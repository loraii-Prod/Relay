import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const requestSchema = z.object({
  participantId: z.string().uuid(),
  sessionKey: z.string().min(10),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.NEXT_PUBLIC_LIVEKIT_URL) {
    return NextResponse.json({ error: "media_backend_not_configured" }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const participant = await prisma.roomParticipant.findFirst({
    where: { id: parsed.data.participantId, sessionKey: parsed.data.sessionKey },
    include: { room: true },
  });

  if (!participant) {
    return NextResponse.json({ error: "participant_not_authorized" }, { status: 401 });
  }
  if (participant.state === "WAITING") {
    return NextResponse.json({ error: "waiting_for_producer" }, { status: 409 });
  }
  if (participant.state !== "CONNECTED" && participant.state !== "DEGRADED" && participant.state !== "RECONNECTING") {
    return NextResponse.json({ error: "participant_not_authorized" }, { status: 401 });
  }

  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participant.id,
    name: participant.displayName,
    ttl: "15m",
    metadata: JSON.stringify({ roomPublicId: participant.room.publicId, roleLabel: participant.roleLabel }),
  });

  token.addGrant({
    roomJoin: true,
    room: participant.roomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    roomId: participant.roomId,
  });
}
