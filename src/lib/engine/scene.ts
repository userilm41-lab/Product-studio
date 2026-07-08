import type { GeneratedScene, ProductRenderRequest, SceneGenerator, SceneRequest } from "./types";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";

/**
 * Scene engine backed by OpenAI GPT Image. It generates the *background scene
 * only*; the product is composited on afterwards, so the model never touches
 * the product's pixels. Model/quality are config, not code (prices change).
 */
export class OpenAISceneGenerator implements SceneGenerator {
  readonly model: string;
  private readonly apiKey: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.apiKey = opts.apiKey;
    // gpt-image-2 is the current flagship (verified available on this key).
    this.model = opts.model ?? process.env.SCENE_MODEL ?? "gpt-image-2";
  }

  async generate(req: SceneRequest): Promise<GeneratedScene> {
    const res = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: req.prompt,
        size: req.size,
        quality: req.quality,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Scene generation failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    return this.parseImageResponse(await res.json());
  }

  /**
   * images/edits at high input fidelity: the model re-photographs the product
   * from the original photo per the prompt. One call handles isolation +
   * background + lighting/shadows — no local matte, no paste seams.
   */
  async render(req: ProductRenderRequest): Promise<GeneratedScene> {
    const call = (withFidelity: boolean) => {
      const form = new FormData();
      form.append("model", this.model);
      form.append("prompt", req.prompt);
      form.append("size", req.size);
      form.append("quality", req.quality);
      // Preserves fine product detail (labels, artwork, texture) in edits.
      if (withFidelity) form.append("input_fidelity", "high");
      const ext = req.mime === "image/jpeg" ? "jpg" : "png";
      form.append(
        "image",
        new Blob([Uint8Array.from(req.image)], { type: req.mime || "image/png" }),
        `product.${ext}`,
      );
      return fetch(OPENAI_EDITS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
    };

    let res = await call(true);
    if (res.status === 400) {
      // Some tiers (e.g. -mini) may not accept input_fidelity — retry without.
      const detail = await res.text().catch(() => "");
      if (!detail.includes("input_fidelity")) {
        throw new Error(`AI render failed (400): ${detail.slice(0, 300)}`);
      }
      res = await call(false);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI render failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return this.parseImageResponse(await res.json());
  }

  private parseImageResponse(json: {
    data?: { b64_json?: string }[];
    usage?: {
      input_tokens_details?: { text_tokens?: number; image_tokens?: number };
      output_tokens_details?: { image_tokens?: number };
      output_tokens?: number;
      total_tokens?: number;
    };
  }): GeneratedScene {
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image model returned no image.");

    const u = json.usage ?? {};
    return {
      png: Buffer.from(b64, "base64"),
      model: this.model,
      usage: {
        inputTextTokens: u.input_tokens_details?.text_tokens ?? 0,
        inputImageTokens: u.input_tokens_details?.image_tokens ?? 0,
        outputImageTokens: u.output_tokens_details?.image_tokens ?? u.output_tokens ?? 0,
        totalTokens: u.total_tokens ?? 0,
      },
    };
  }
}

/** Returns a configured scene generator (optionally for a specific model),
 *  or null if no API key is set. */
export function getSceneGenerator(model?: string): SceneGenerator | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAISceneGenerator({ apiKey, model });
}
