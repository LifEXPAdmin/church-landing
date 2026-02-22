import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }

  const fallbackUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (fallbackUrl) {
    process.env.DATABASE_URL = fallbackUrl;
  }
}

ensureDatabaseUrl();

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
