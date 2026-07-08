import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { segmenter } from "@/lib/engine/segment";
import { composite } from "@/lib/engine/composite";
import { getSceneGenerator } from "@/lib/engine/scene";
import { buildRenderPrompt, buildScenePrompt } from "@/lib/engine/prompt";
import { getTemplate, isSceneTemplate, type Template } from "@/lib/templates";
import { computeCost } from "@/lib/pricing/cost";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getDefaultShop } from "@/lib/tenant";
import type { GeneratedScene, SceneGenerator } from "@/lib/engine/types";

export const runtime = "nodejs";
// Background render budget (after() runs within the function lifetime on
// serverless). High-quality edits at input_fidelity=high can exceed 2 minutes.
export const maxDuration = 300;

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

/** The stored source photo + product row, resolved from an upload or the DB. */
interface Source {
  productId: string;
  original: Buffer;
  mime: string;
}

interface Job {
  generationId: string;
  source: Source;
  template: Template;
  artDirection: string;
  tier: { model: string; quality: string };
  finish: "ai" | "instant";
  scenegen: SceneGenerator | null;
  started: number;
}

/**
 * generate endpoint — async job pattern. Renders (especially High tier) can
 * outlive proxy/gateway timeouts, so POST validates, stores the source,
 * creates a `processing` Generation row and returns immediately; the render
 * runs in the background (after()) and the client polls /api/generation/:id.
 *
 * Two finish modes:
 * - "ai" (default): ONE images/edits call at high input fidelity re-photographs
 *   the product from the ORIGINAL photo into the template's setting — the
 *   ChatGPT-quality path. No local matte, so no halos/ghosting.
 * - "instant": free offline path. Local segmentation + pixel-exact paste (plus
 *   an empty generated scene for scene templates).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const templateId = String(form.get("templateId") ?? "");
    const artDirection = String(form.get("prompt") ?? "").trim();
    const requestedProductId = String(form.get("productId") ?? "");
    const tier = QUALITY_TIERS[String(form.get("quality") ?? "")] ?? QUALITY_TIERS[DEFAULT_TIER];
    const scenegen = getSceneGenerator(tier.model);
    // AI finish is the default whenever a key is configured; "instant" opts out.
    const finish = String(form.get("finish") ?? "") === "instant" || !scenegen ? "instant" : "ai";

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Unknown template." }, { status: 400 });
    }
    const sceneMode = isSceneTemplate(template);
    if (finish === "instant" && sceneMode && !scenegen) {
      return NextResponse.json(
        { error: "Scene generation is not configured (missing OPENAI_API_KEY)." },
        { status: 503 },
      );
    }

    const started = Date.now();

    // ── Resolve the source photo (fresh upload or stored product) ──────────
    let source: Source | undefined;

    if (requestedProductId) {
      const uploadAsset = await prisma.asset.findFirst({
        where: { productId: requestedProductId, role: "upload" },
        orderBy: { createdAt: "desc" },
      });
      if (uploadAsset && (await storage.exists(uploadAsset.storageKey))) {
        source = {
          productId: requestedProductId,
          original: await storage.get(uploadAsset.storageKey),
          mime: uploadAsset.mime,
        };
      }
    }

    if (!source) {
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

      const original = Buffer.from(await file.arrayBuffer());
      const shop = await getDefaultShop();
      const product = await prisma.product.create({ data: { shopId: shop.id } });
      const uploadKey = await storage.put(original, { role: "upload", ext: "bin" });
      await prisma.asset.create({
        data: { productId: product.id, role: "upload", storageKey: uploadKey, mime: file.type },
      });
      source = { productId: product.id, original, mime: file.type };
    }

    // ── Enqueue: row now, render in the background, client polls ───────────
    const mode = finish === "ai" ? "ai" : sceneMode ? "studio" : "static";
    const generation = await prisma.generation.create({
      data: {
        productId: source.productId,
        templateId: template.id,
        templateName: template.name,
        prompt: artDirection || null,
        status: "processing",
        mode,
      },
    });

    const job: Job = {
      generationId: generation.id,
      source,
      template,
      artDirection,
      tier,
      finish,
      scenegen,
      started,
    };
    after(() => runGeneration(job));

    return NextResponse.json(
      {
        versionId: generation.id,
        productId: source.productId,
        status: "processing",
        createdAt: generation.createdAt.toISOString(),
      },
      { status: 202 },
    );
  } catch (err) {
    console.error("[generate] failed", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The actual render. Runs detached from the HTTP request; all outcomes —
 *  success or failure — land on the Generation row for the poller. */
async function runGeneration(job: Job): Promise<void> {
  const { generationId, source, template, artDirection, tier, finish, scenegen } = job;
  try {
    let final: Buffer;
    let render: GeneratedScene | undefined; // the single AI-finish call
    let scene: GeneratedScene | undefined; // instant path's empty scene
    let reusedCutout = false;

    if (finish === "ai" && scenegen) {
      const { prompt } = buildRenderPrompt(template, artDirection);
      render = await scenegen.render({
        image: source.original,
        mime: source.mime,
        prompt,
        size: SCENE_SIZE,
        quality: tier.quality,
      });
      final = render.png;
    } else {
      // Instant path: reuse the stored cutout, else segment (lazily) and store.
      let cutout: Buffer | undefined;
      const cutoutAsset = await prisma.asset.findFirst({
        where: { productId: source.productId, role: "cutout" },
        orderBy: { createdAt: "desc" },
      });
      if (cutoutAsset && (await storage.exists(cutoutAsset.storageKey))) {
        cutout = await storage.get(cutoutAsset.storageKey);
        reusedCutout = true;
      } else {
        cutout = (await segmenter.segment(source.original, source.mime)).png;
        const cutoutKey = await storage.put(cutout, { role: "cutout" });
        await prisma.asset.create({
          data: {
            productId: source.productId,
            role: "cutout",
            storageKey: cutoutKey,
            mime: "image/png",
          },
        });
      }

      if (isSceneTemplate(template) && scenegen) {
        const { prompt } = buildScenePrompt(template, artDirection);
        scene = await scenegen.generate({ prompt, size: SCENE_SIZE, quality: tier.quality });
      }
      final = await composite(cutout, template, scene?.png);
    }

    const elapsedMs = Date.now() - job.started;
    const cost = computeCost({
      images: [
        ...(render ? [{ label: "AI render (product + scene)", ...render }] : []),
        ...(scene ? [{ label: "Scene generation", ...scene }] : []),
      ].map(({ label, model, usage }) => ({ label, model, usage })),
      computeSeconds: elapsedMs / 1000,
    });

    const finalKey = await storage.put(final, { role: "final" });
    const finalAsset = await prisma.asset.create({
      data: { productId: source.productId, role: "final", storageKey: finalKey, mime: "image/png" },
    });

    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "done",
        model: render?.model ?? scene?.model ?? null,
        costPennies: cost.totalGbpPence,
        costUsd: cost.totalUsd,
        costJson: JSON.parse(JSON.stringify(cost)),
        elapsedMs,
        reusedCutout,
        finalAssetId: finalAsset.id,
      },
    });
  } catch (err) {
    console.error("[generate] background render failed", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    await prisma.generation
      .update({
        where: { id: generationId },
        data: { status: "error", error: message.slice(0, 500) },
      })
      .catch(() => {});
  }
}
