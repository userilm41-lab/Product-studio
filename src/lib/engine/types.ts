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

/**
 * Token usage for one image-model call, normalised across providers so the M3
 * cost meter can price it from a rates table (no hardcoded per-image number).
 */
export interface ImageUsage {
  inputTextTokens: number;
  inputImageTokens: number;
  outputImageTokens: number;
  totalTokens: number;
}

export interface GeneratedScene {
  /** RGB PNG of the empty scene (no product — the product is composited on). */
  png: Buffer;
  model: string;
  usage: ImageUsage;
}

export interface SceneRequest {
  prompt: string;
  /** e.g. "1024x1024" — provider-native size. */
  size: string;
  /** e.g. "low" | "medium" | "high". */
  quality: string;
}

/** An image-to-image render: the model re-photographs the product per prompt. */
export interface ProductRenderRequest extends SceneRequest {
  /** The source photo containing the product (original upload, not a matte). */
  image: Buffer;
  mime: string;
}

/**
 * Generates the *scene* (background) only — never the product. Studio mode
 * composites the original product cutout on top, so whichever model paints the
 * scene, the product is guaranteed.
 */
export interface SceneGenerator {
  readonly model: string;
  generate(req: SceneRequest): Promise<GeneratedScene>;
  /**
   * AI finish: one edits-API call renders product + background together at
   * high input fidelity — clean edges, integrated lighting/shadows (what the
   * ChatGPT UI does). Trades the pixel-exact guarantee for photographic
   * quality; the "instant" composite path remains the exact fallback.
   */
  render(req: ProductRenderRequest): Promise<GeneratedScene>;
}
