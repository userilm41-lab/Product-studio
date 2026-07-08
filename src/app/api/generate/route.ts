import { NextRequest, NextResponse } from "next/server";
import { segmenter } from "@/lib/engine/segment";
import { composite } from "@/lib/engine/composite";
import { getSceneGenerator } from "@/lib/engine/scene";
import { buildScenePrompt } from "@/lib/engine/prompt";
import { getTemplate, isSceneTemplate } from "@/lib/templates";
import { computeCost } from "@/lib/pricing/cost";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getDefaultShop } from "@/lib/tenant";
import type { GeneratedScene } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB phone photo ceiling
const SCENE_SIZE = process.env.SCENE_SIZE ?? "1024x1024";

// Quality tiers the shop owner picks. Draft is fast + cheap for iterating;
// Standard/High use the flagship for final renders. Model choice is per-tier so
// the cost meter reflects the real trade-off.
const QUALITY_TIERS: Record<string, { model: string; quality: string }> = {
  draft: { model: "gpt-image-1-mini", quality: "low" },
  standard: { model: "gpt-image-2", quality: "medium" },
  high: { model: "gpt-image-2", quality: "high" },
};
const DEFAULT_TIER = "standard";

/**
 * generate endpoint. Isolate the product (or reuse the product's stored cutout
 * on regenerate), optionally generate a scene, composite the original product
 * onto the background, then persist the generation + assets and return the
 * true margin-free cost. Segmentation runs once per product; regenerations vary
 * only the scene, so the product can't drift (Plan §3).
 * Synchronous for now; M6 moves this behind an async job queue.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const templateId = String(form.get("templateId") ?? "");
    const artDirection = String(form.get("prompt") ?? "").trim();
    const requestedProductId = String(form.get("productId") ?? "");
    const tier = QUALITY_TIERS[String(form.get("quality") ?? "")] ?? QUALITY_TIERS[DEFAULT_TIER];

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Unknown template." }, { status: 400 });
    }

    const started = Date.now();

    // Resolve the product + its cutout: reuse a stored cutout on regenerate,
    // else segment a fresh upload and persist the cutout for future runs.
    let productId = "";
    let cutout: Buffer | undefined;
    let reusedCutout = false;

    if (requestedProductId) {
      const cutoutAsset = await prisma.asset.findFirst({
        where: { productId: requestedProductId, role: "cutout" },
        orderBy: { createdAt: "desc" },
      });
      if (cutoutAsset && (await storage.exists(cutoutAsset.storageKey))) {
        cutout = await storage.get(cutoutAsset.storageKey);
        productId = requestedProductId;
        reusedCutout = true;
      }
    }

    if (!cutout) {
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "No image uploaded (and no stored product to regenerate)." },
          { status: 400 },
        );
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "File must be an image." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Image is too large (max 25 MB)." }, { status: 413 });
      }

      const input = Buffer.from(await file.arrayBuffer());
      cutout = (await segmenter.segment(input, file.type)).png;

      const shop = await getDefaultShop();
      const product = await prisma.product.create({ data: { shopId: shop.id } });
      productId = product.id;

      const uploadKey = await storage.put(input, { role: "upload", ext: "bin" });
      const cutoutKey = await storage.put(cutout, { role: "cutout" });
      await prisma.asset.createMany({
        data: [
          { productId, role: "upload", storageKey: uploadKey, mime: file.type },
          { productId, role: "cutout", storageKey: cutoutKey, mime: "image/png" },
        ],
      });
    }

    // Generate the scene (Studio mode) if this template calls for one.
    let scene: GeneratedScene | undefined;
    if (isSceneTemplate(template)) {
      const scenegen = getSceneGenerator(tier.model);
      if (!scenegen) {
        return NextResponse.json(
          { error: "Scene generation is not configured (missing OPENAI_API_KEY)." },
          { status: 503 },
        );
      }
      const { prompt } = buildScenePrompt(template, artDirection);
      scene = await scenegen.generate({ prompt, size: SCENE_SIZE, quality: tier.quality });
    }

    const final = await composite(cutout, template, scene?.png);
    const elapsedMs = Date.now() - started;

    const cost = computeCost({
      scene: scene ? { model: scene.model, usage: scene.usage } : undefined,
      computeSeconds: elapsedMs / 1000,
    });

    // Persist the final asset + the generation record (cost_pennies for the
    // per-shop usage dashboard, Plan §4/§6).
    const finalKey = await storage.put(final, { role: "final" });
    const finalAsset = await prisma.asset.create({
      data: { productId, role: "final", storageKey: finalKey, mime: "image/png" },
    });
    const generation = await prisma.generation.create({
      data: {
        productId,
        templateId: template.id,
        templateName: template.name,
        prompt: artDirection || null,
        mode: scene ? "studio" : "static",
        model: scene?.model ?? null,
        costPennies: cost.totalGbpPence,
        costUsd: cost.totalUsd,
        elapsedMs,
        reusedCutout,
        finalAssetId: finalAsset.id,
      },
    });

    return NextResponse.json({
      image: `data:image/png;base64,${final.toString("base64")}`,
      filename: `cadence-${template.id}.png`,
      productId,
      versionId: generation.id,
      createdAt: generation.createdAt.toISOString(),
      cost,
      meta: {
        mode: scene ? "studio" : "static",
        model: scene?.model ?? null,
        elapsedMs,
        reusedCutout,
        templateId: template.id,
        templateName: template.name,
        artDirection: artDirection || null,
      },
    });
  } catch (err) {
    console.error("[generate] failed", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
