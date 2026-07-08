import { prisma } from "./db";

/**
 * Multi-tenant scaffolding. Auth lands later; for now every generation belongs
 * to a single default shop so the data model is already tenant-shaped and the
 * switch to real accounts is additive.
 */
export async function getDefaultShop() {
  const existing = await prisma.shop.findFirst({ where: { name: "Demo Shop" } });
  if (existing) return existing;
  return prisma.shop.create({
    data: {
      name: "Demo Shop",
      users: { create: { email: "owner@demo.local", role: "owner" } },
    },
  });
}
