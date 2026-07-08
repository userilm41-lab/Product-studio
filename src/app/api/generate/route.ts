import { NextRequest, NextResponse } from "next/server";
import { segmenter } from "@/lib/engine/segment";
import { composite } from "@/lib/engine/composite";
import { getSceneGenerator } from "@/lib/engine/scene";
import { buildScenePrompt } from "@/lib/engine/prompt";
import { getTemplate, isSceneTemplate } from "@/lib/templates";
import { computeCost } from "@/lib/pricing/cost";
import type { GeneratedScene } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB phone photo ceiling
const SCENE_SIZE = process.env.SCENE_SIZE ?? "1024x1024";
const SCENE_QUALITY = process.env.SCENE_QUALITY ?? "medium";

/**
 * generate endpoint. Isolate the product, optionally generate a scene, then
 * composite the original product onto the background. Returns the final image
 * plus the TRUE, margin-free cost of the generation (Plan §4).
 * Synchronous for now; M6 moves this behind an async job queue.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const templateId = String(form.get("templateId") ?? "");
    const artDirection = String(form.get("prompt") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 25 MB)." }, { status: 413 });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Unknown template." }, { status: 400 });
    }

    const started = Date.now();
    const input = Buffer.from(await file.arrayBuffer());
    const { png: cutout } = await segmenter.segment(input, file.type);

    let scene: GeneratedScene | undefined;
    if (isSceneTemplate(template)) {
      const scenegen = getSceneGenerator();
      if (!scenegen) {
        return NextResponse.json(
          { error: "Scene generation is not configured (missing OPENAI_API_KEY)." },
          { status: 503 },
        );
      }
      const { prompt } = buildScenePrompt(template, artDirection);
      scene = await scenegen.generate({ prompt, size: SCENE_SIZE, quality: SCENE_QUALITY });
    }

    const final = await composite(cutout, template, scene?.png);
    const elapsedMs = Date.now() - started;

    const cost = computeCost({
      scene: scene ? { model: scene.model, usage: scene.usage } : undefined,
      computeSeconds: elapsedMs / 1000,
    });

    return NextResponse.json({
      image: `data:image/png;base64,${final.toString("base64")}`,
      filename: `cadence-${template.id}.png`,
      cost,
      meta: {
        mode: scene ? "studio" : "static",
        model: scene?.model ?? null,
        elapsedMs,
      },
    });
  } catch (err) {
    console.error("[generate] failed", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
