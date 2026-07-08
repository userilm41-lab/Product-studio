import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** GET /api/asset/:id — serve a stored asset's bytes (key comes from the DB,
 *  never from the client, so there's no path-traversal surface). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
  const bytes = await storage.get(asset.storageKey);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
