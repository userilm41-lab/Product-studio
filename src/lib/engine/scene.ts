import type { GeneratedScene, SceneGenerator, SceneRequest } from "./types";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

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

    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("Scene generation returned no image.");

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

/** Returns a configured scene generator, or null if no API key is set. */
export function getSceneGenerator(): SceneGenerator | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAISceneGenerator({ apiKey });
}
