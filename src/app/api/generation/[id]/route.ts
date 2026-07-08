import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/generation/:id — poll a background render (see /api/generate).
 * Returns the row's status; once `done`, includes everything the client needs
 * to display the version (image is served by /api/asset/:id).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await prisma.generation.findUnique({ where: { id } });
  if (!g) {
    return NextResponse.json({ error: "Generation not found." }, { status: 404 });
  }

  return NextResponse.json({
    versionId: g.id,
    productId: g.productId,
    status: g.status,
    error: g.error,
    createdAt: g.createdAt.toISOString(),
    image: g.finalAssetId ? `/api/asset/${g.finalAssetId}` : null,
    filename: `cadence-${g.templateId}.png`,
    cost: g.costJson,
    meta: {
      mode: g.mode,
      model: g.model,
      elapsedMs: g.elapsedMs,
      reusedCutout: g.reusedCutout,
      templateId: g.templateId,
      templateName: g.templateName,
      artDirection: g.prompt,
    },
  });
}
