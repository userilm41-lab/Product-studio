/**
 * M1 template library: static backgrounds the product is composited onto.
 * In M2 these gain a tuned scene prompt + lighting profile and become the
 * seeds for GPT-generated scenes; the shape stays the same so the UI and
 * pipeline don't change.
 */

export type TemplateBackground =
  | { kind: "solid"; color: string }
  | { kind: "linear-gradient"; from: string; to: string; angle: number };

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Output canvas is a square of this many px per side. */
  size: number;
  /** Fraction of the canvas the product should occupy (longest side). */
  coverage: number;
  background: TemplateBackground;
}

export const TEMPLATES: Template[] = [
  {
    id: "studio-white",
    name: "Studio White",
    description: "Pure white (RGB 255,255,255) — marketplace-ready.",
    size: 2048,
    coverage: 0.85,
    background: { kind: "solid", color: "#ffffff" },
  },
  {
    id: "soft-grey",
    name: "Soft Grey",
    description: "Gentle grey gradient for a clean catalog look.",
    size: 2048,
    coverage: 0.78,
    background: { kind: "linear-gradient", from: "#f6f6f8", to: "#d9dade", angle: 145 },
  },
  {
    id: "warm-sand",
    name: "Warm Sand",
    description: "Warm neutral backdrop for lifestyle framing.",
    size: 2048,
    coverage: 0.72,
    background: { kind: "linear-gradient", from: "#f4ebdd", to: "#e2c9a9", angle: 145 },
  },
];

export const DEFAULT_TEMPLATE_ID = "studio-white";

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
