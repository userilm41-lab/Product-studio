import { NextRequest, NextResponse } from "next/server";
import { segmenter } from "@/lib/engine/segment";
import { composite } from "@/lib/engine/composite";
import { getTemplate } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB phone photo ceiling

/**
 * M1 generate endpoint: upload → isolate (cutout) → composite onto a static
 * template → PNG. Synchronous for now; M6 moves this behind an async job queue
 * with streamed progress.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const templateId = String(form.get("templateId") ?? "");

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
    const final = await composite(cutout, template);
    const elapsed = Date.now() - started;

    return new NextResponse(new Uint8Array(final), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="cadence-${template.id}.png"`,
        "Cache-Control": "no-store",
        "X-Generation-Ms": String(elapsed),
      },
    });
  } catch (err) {
    console.error("[generate] failed", err);
    return NextResponse.json({ error: "Generation failed. Please try another photo." }, { status: 500 });
  }
}
