import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const started = Date.now();
  let database: "connected" | "unavailable" = "unavailable";

  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "unavailable";
    }
  }

  return NextResponse.json({
    service: "relay",
    version: "0.5.1",
    status: database === "connected" ? "ready" : "degraded",
    checks: {
      web: "ready",
      database,
      mediaTransport: "vdo.ninja",
      obsConnector: "client-side",
    },
    responseTimeMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  });
}
