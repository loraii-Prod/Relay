import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMediaSecretConfigured } from "@/server/media/vdo";

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

  const mediaSecret = isMediaSecretConfigured() ? "configured" : "missing";
  const ready = database === "connected" && mediaSecret === "configured";

  return NextResponse.json({
    service: "relay",
    version: "0.5.2",
    status: ready ? "ready" : "degraded",
    checks: {
      web: "ready",
      database,
      mediaTransport: "vdo.ninja",
      mediaSecret,
      obsConnector: "client-side",
    },
    responseTimeMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  });
}
