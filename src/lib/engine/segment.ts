import { removeBackground } from "@imgly/background-removal-node";
import type { Segmenter, SegmentedProduct } from "./types";

/**
 * Local, offline segmenter backed by the bundled ONNX model
 * (@imgly/background-removal-node). Produces a clean alpha matte on CPU.
 * This is the M1 default; a hosted BiRefNet/RMBG-2.0 implementation can drop
 * in behind the same `Segmenter` interface for higher edge quality at volume.
 */
export class ImglySegmenter implements Segmenter {
  async segment(input: Buffer, mimeType: string): Promise<SegmentedProduct> {
    // removeBackground detects format from the Blob's type, so it must be set.
    const blob = new Blob([Uint8Array.from(input)], {
      type: mimeType || "image/png",
    });
    const out = await removeBackground(blob);
    const png = Buffer.from(await out.arrayBuffer());
    return { png };
  }
}

export const segmenter: Segmenter = new ImglySegmenter();
