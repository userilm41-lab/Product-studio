import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/versions?productId=... — durable version history for a product. */
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  const gens = await prisma.generation.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    versions: gens.map((g) => ({
      versionId: g.id,
      createdAt: g.createdAt.toISOString(),
      templateId: g.templateId,
      templateName: g.templateName,
      prompt: g.prompt,
      mode: g.mode,
      model: g.model,
      costPennies: g.costPennies,
      costUsd: g.costUsd,
      elapsedMs: g.elapsedMs,
      reusedCutout: g.reusedCutout,
      imageUrl: g.finalAssetId ? `/api/asset/${g.finalAssetId}` : null,
    })),
  });
}
