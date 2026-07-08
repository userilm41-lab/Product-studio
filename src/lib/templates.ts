/**
 * Template library.
 *
 * - Static templates (M1) composite the product onto a solid/gradient
 *   background — instant, offline, and marketplace-safe.
 * - Scene templates (M2) carry a `scenePrompt`; Studio mode generates an empty
 *   scene with GPT Image and composites the original product onto it. Each also
 *   keeps a `background` as a graceful fallback if generation is unavailable.
 */

export type TemplateBackground =
  | { kind: "solid"; color: string }
  | { kind: "linear-gradient"; from: string; to: string; angle: number };

/** Where the product sits on the canvas. */
export type Anchor = "center" | "floor";

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Output canvas is a square of this many px per side. */
  size: number;
  /** Fraction of the canvas the product should occupy (longest side). */
  coverage: number;
  anchor: Anchor;
  /** Static background (M1 fast path + fallback when generation is off). */
  background: TemplateBackground;
  /** If set, Studio mode generates this scene and composites onto it. */
  scenePrompt?: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "studio-white",
    name: "Studio White",
    description: "Pure white (RGB 255,255,255) — marketplace-ready.",
    size: 2048,
    coverage: 0.85,
    anchor: "center",
    background: { kind: "solid", color: "#ffffff" },
  },
  {
    id: "soft-grey",
    name: "Soft Grey",
    description: "Gentle grey gradient for a clean catalog look.",
    size: 2048,
    coverage: 0.78,
    anchor: "center",
    background: { kind: "linear-gradient", from: "#f6f6f8", to: "#d9dade", angle: 145 },
  },
  {
    id: "marble-kitchen",
    name: "Marble Kitchen",
    description: "White marble countertop, bright airy kitchen behind.",
    size: 2048,
    coverage: 0.6,
    anchor: "floor",
    background: { kind: "linear-gradient", from: "#f3f2ee", to: "#dcdad3", angle: 160 },
    scenePrompt:
      "A polished white marble kitchen countertop in the foreground with soft grey veining, " +
      "a bright airy modern kitchen softly blurred in the background, warm morning daylight from a window.",
  },
  {
    id: "wood-table",
    name: "Wood Table",
    description: "Warm wooden tabletop, cosy lifestyle feel.",
    size: 2048,
    coverage: 0.62,
    anchor: "floor",
    background: { kind: "linear-gradient", from: "#e8d3b5", to: "#b98b57", angle: 160 },
    scenePrompt:
      "A warm natural wooden tabletop in the foreground with visible grain, a softly blurred cosy " +
      "interior behind, gentle warm side lighting.",
  },
  {
    id: "minimal-podium",
    name: "Minimal Podium",
    description: "Neutral studio with a low pedestal, editorial look.",
    size: 2048,
    coverage: 0.58,
    anchor: "floor",
    background: { kind: "linear-gradient", from: "#efe9e3", to: "#cfc6bd", angle: 150 },
    scenePrompt:
      "A minimalist studio set with a smooth low cylindrical stone pedestal on a seamless neutral " +
      "beige backdrop, soft even lighting, subtle long shadow, editorial product-photography style.",
  },
];

export const DEFAULT_TEMPLATE_ID = "studio-white";

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function isSceneTemplate(t: Template): boolean {
  return Boolean(t.scenePrompt);
}
