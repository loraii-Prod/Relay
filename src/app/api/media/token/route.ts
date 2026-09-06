import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getVdoRoomCredentials } from "@/server/media/vdo";
import { mediaStreamId } from "@/features/webrtc/transport";

export const runtime = "nodejs";

const requestSchema = z.object({
  participantId: z.string().uuid(),
  sessionKey: z.string().min(10),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const participant = await prisma.roomParticipant.findFirst({
    where: { id: parsed.data.participantId, sessionKey: parsed.data.sessionKey },
    include: { room: true },
  });

  if (!participant) return NextResponse.json({ error: "participant_not_authorized" }, { status: 401 });
  if (participant.state === "WAITING") return NextResponse.json({ error: "waiting_for_producer" }, { status: 409 });
  if (!["CONNECTED", "DEGRADED", "RECONNECTING"].includes(participant.state)) {
    return NextResponse.json({ error: "participant_not_authorized" }, { status: 401 });
  }

  const media = getVdoRoomCredentials(participant.roomId);
  return NextResponse.json({
    provider: media.provider,
    roomId: media.roomId,
    password: media.password,
    streamId: mediaStreamId(participant.id),
    label: participant.displayName,
  });
}
