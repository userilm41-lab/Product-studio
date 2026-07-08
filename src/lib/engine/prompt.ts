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

/**
 * AI-finish prompt (image-to-image edits). The model receives the ORIGINAL
 * photo and re-photographs the product into the target setting, so the
 * non-negotiables flip: instead of "paint no product", we demand the product
 * be preserved exactly while everything around it is replaced.
 */
const PRODUCT_PRESERVE_GUARD =
  "Keep the product from the photo EXACTLY as it is — identical shape, proportions, colors, " +
  "materials, buttons, artwork, labels and text. Do not restyle, redesign, clean up, or replace " +
  "the product. Do not add any other objects, text, watermarks or logos. Remove the original " +
  "background, surface and any straps/clutter around the product completely.";

/** How the product should sit, phrased per template anchor. */
function placement(template: Template): string {
  return template.anchor === "floor"
    ? "The product stands upright resting naturally on the surface with correct perspective and a soft, realistic contact shadow."
    : "The product is centered, filling most of the frame, with a subtle soft shadow so it does not look pasted.";
}

export function buildRenderPrompt(template: Template, artDirection?: string): ScenePromptResult {
  // Scene templates re-shoot into their scene; static templates re-shoot onto
  // their clean backdrop (e.g. pure white for marketplaces).
  const setting = template.scenePrompt
    ? `Place it in this setting: ${template.scenePrompt}`
    : `Place it on this backdrop: ${template.description} Seamless, evenly lit, edge-to-edge.`;

  const owner = artDirection?.trim()
    ? ` Additional art direction from the shop owner: ${artDirection.trim()}.`
    : "";

  const prompt =
    `Professional e-commerce product photograph of the product in this photo. ${setting} ` +
    `${placement(template)} ${QUALITY_DIRECTIVE} ${PRODUCT_PRESERVE_GUARD}${owner}`;
  return { prompt };
}
