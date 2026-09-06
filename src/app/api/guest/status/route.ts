import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const url = new URL(request.url);
  const participantId = url.searchParams.get("participantId");
  const sessionKey = url.searchParams.get("sessionKey");
  if (!participantId || !sessionKey) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const participant = await prisma.roomParticipant.findFirst({
    where: { id: participantId, sessionKey },
    select: { id: true, displayName: true, state: true, roleLabel: true, room: { select: { name: true, publicId: true, status: true } } },
  });
  if (!participant) return NextResponse.json({ error: "participant_not_found" }, { status: 404 });
  return NextResponse.json({ participant });
}
