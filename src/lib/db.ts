import { PrismaClient } from "@prisma/client";

// Reuse a single client across hot-reloads in dev (avoids exhausting
// connections). In prod one instance per server is correct.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;
