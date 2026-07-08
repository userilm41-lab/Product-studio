import { NextRequest, NextResponse } from "next/server";
import { segmenter } from "@/lib/engine/segment";
import { composite } from "@/lib/engine/composite";
import { getSceneGenerator } from "@/lib/engine/scene";
import { buildScenePrompt } from "@/lib/engine/prompt";
import { getTemplate, isSceneTemplate } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB phone photo ceiling
const SCENE_SIZE = process.env.SCENE_SIZE ?? "1024x1024";
const SCENE_QUALITY = process.env.SCENE_QUALITY ?? "medium";

/**
 * generate endpoint. Isolate the product, then either:
 *   - Studio mode (template has a scenePrompt): generate an empty scene with
 *     GPT Image and composite the original product onto it; or
 *   - Static mode (M1): composite onto the template's solid/gradient background.
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

    const headers: Record<string, string> = {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="cadence-${template.id}.png"`,
      "Cache-Control": "no-store",
    };

    let sceneBackground: Buffer | undefined;

    if (isSceneTemplate(template)) {
      const scenegen = getSceneGenerator();
      if (!scenegen) {
        return NextResponse.json(
          { error: "Scene generation is not configured (missing OPENAI_API_KEY)." },
          { status: 503 },
        );
      }
      const { prompt } = buildScenePrompt(template, artDirection);
      const scene = await scenegen.generate({
        prompt,
        size: SCENE_SIZE,
        quality: SCENE_QUALITY,
      });
      sceneBackground = scene.png;
      // Usage headers feed the M3 cost meter (priced from a rates table).
      headers["X-Scene-Model"] = scene.model;
      headers["X-Input-Text-Tokens"] = String(scene.usage.inputTextTokens);
      headers["X-Input-Image-Tokens"] = String(scene.usage.inputImageTokens);
      headers["X-Output-Image-Tokens"] = String(scene.usage.outputImageTokens);
    }

    const final = await composite(cutout, template, sceneBackground);
    headers["X-Generation-Ms"] = String(Date.now() - started);

    return new NextResponse(new Uint8Array(final), { status: 200, headers });
  } catch (err) {
    console.error("[generate] failed", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
