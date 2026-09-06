import { PrismaClient } from "@prisma/client";

declare global {
  var relayPrisma: PrismaClient | undefined;
}

export const prisma = global.relayPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") global.relayPrisma = prisma;
