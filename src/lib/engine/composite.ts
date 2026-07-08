import sharp, { type Sharp } from "sharp";
import type { Template } from "../templates";

/**
 * The fidelity core. We never let a model repaint the product: we take the
 * ORIGINAL product cutout and paste its exact pixels onto a background. The
 * background is either a static template (M1) or a GPT-generated scene (M2) —
 * either way the product is guaranteed, by construction.
 */

function buildStaticBackground(t: Template): Sharp {
  const S = t.size;

  if (t.background.kind === "solid") {
    return sharp({
      create: { width: S, height: S, channels: 4, background: t.background.color },
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

/**
 * Composite the product cutout onto a background.
 * @param sceneBackground optional generated scene; if omitted the static
 *   template background is built and used.
 */
export async function composite(
  cutoutPng: Buffer,
  t: Template,
  sceneBackground?: Buffer,
): Promise<Buffer> {
  const S = t.size;

  const background = sceneBackground
    ? await sharp(sceneBackground).resize(S, S, { fit: "cover", position: "centre" }).toBuffer()
    : await buildStaticBackground(t).png().toBuffer();

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

  // "floor": product rests near the surface line; "center": vertically centred.
  const top =
    t.anchor === "floor"
      ? Math.max(Math.round(S * 0.06), Math.round(S * 0.9 - h))
      : Math.round((S - h) / 2);

  return sharp(background)
    .composite([{ input: product, left, top }])
    .png()
    .toBuffer();
}
