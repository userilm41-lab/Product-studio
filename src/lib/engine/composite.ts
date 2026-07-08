import sharp, { type Sharp } from "sharp";
import type { Template } from "../templates";

/**
 * The fidelity core. We never let a model repaint the product: we take the
 * ORIGINAL product cutout and paste its exact pixels onto a freshly built
 * background. In M1 the background is a static template; in later phases it
 * becomes a generated scene — but this composite step keeps the product
 * guaranteed regardless of what paints the backdrop.
 */

function buildBackground(t: Template): Sharp {
  const S = t.size;

  if (t.background.kind === "solid") {
    return sharp({
      create: {
        width: S,
        height: S,
        channels: 4,
        background: t.background.color,
      },
    });
  }

  // linear-gradient: rasterize an SVG. gradientUnits default to the object's
  // bounding box, so rotating about (0.5, 0.5) angles the gradient cleanly.
  const { from, to, angle } = t.background;
  const svg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
</svg>`;
  return sharp(Buffer.from(svg));
}

export async function composite(cutoutPng: Buffer, t: Template): Promise<Buffer> {
  const S = t.size;

  // Trim the transparent border so the product fills the coverage box
  // regardless of how much empty space the cutout carried.
  const trimmed = await sharp(cutoutPng)
    .trim()
    .toBuffer()
    .catch(() => cutoutPng);

  const box = Math.round(S * t.coverage);
  const product = await sharp(trimmed)
    .resize({ width: box, height: box, fit: "inside" })
    .toBuffer();
  const meta = await sharp(product).metadata();

  const w = meta.width ?? box;
  const h = meta.height ?? box;
  const left = Math.round((S - w) / 2);
  const top = Math.round((S - h) / 2);

  return buildBackground(t)
    .composite([{ input: product, left, top }])
    .png()
    .toBuffer();
}
