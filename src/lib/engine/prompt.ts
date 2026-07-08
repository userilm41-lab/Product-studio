import type { Template } from "../templates";

/**
 * Prompt orchestration (Plan §5). Turns a template + optional owner art
 * direction into a scene prompt. Two rules are non-negotiable and baked in:
 *   1. Generate an EMPTY scene — the real product is composited on afterwards,
 *      so the model must not paint a product, text, or logo.
 *   2. Leave clear space in the lower-centre foreground for the product.
 *
 * This is deterministic for now (fast, free, reliable). An LLM expander can
 * later slot in behind this same function to enrich the base description.
 */

const QUALITY_DIRECTIVE =
  "Photorealistic professional product-photography scene. Soft, diffused studio lighting, " +
  "gentle natural shadows, shallow depth of field, high detail, sharp focus, 4k.";

const EMPTY_SCENE_GUARD =
  "The scene is completely empty: no product, no object, no person, no text, no logo, " +
  "no watermark, no props in the centre. Leave clear, uncluttered space in the lower-centre " +
  "foreground where a product will be placed, with a believable surface for it to rest on.";

export interface ScenePromptResult {
  prompt: string;
}

export function buildScenePrompt(template: Template, artDirection?: string): ScenePromptResult {
  const base = template.scenePrompt ?? template.description;
  const owner = artDirection?.trim()
    ? ` Additional art direction from the shop owner: ${artDirection.trim()}.`
    : "";

  const prompt = `${base} ${QUALITY_DIRECTIVE} ${EMPTY_SCENE_GUARD}${owner}`;
  return { prompt };
}
