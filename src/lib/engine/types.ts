/**
 * The fidelity core is built on one guarantee: the product's own pixels are
 * what ships. These interfaces keep each step swappable (local model vs hosted
 * API) so we can A/B or self-host later without touching product code.
 */

export interface SegmentedProduct {
  /** RGBA PNG cutout of the product on a transparent background. */
  png: Buffer;
}

/** Isolates the product from its original photo. */
export interface Segmenter {
  segment(input: Buffer, mimeType: string): Promise<SegmentedProduct>;
}
