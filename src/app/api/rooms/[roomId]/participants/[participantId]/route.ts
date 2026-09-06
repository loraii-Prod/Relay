import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

const actionSchema = z.object({
  action: z.enum(["accept", "reject", "remove", "mark_degraded", "mark_reconnecting"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string; participantId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId, participantId } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const participant = await prisma.roomParticipant.findFirst({ where: { id: participantId, roomId: room.id } });
  if (!participant) return NextResponse.json({ error: "participant_not_found" }, { status: 404 });

  const nextState = {
    accept: "CONNECTED",
    reject: "REJECTED",
    remove: "DISCONNECTED",
    mark_degraded: "DEGRADED",
    mark_reconnecting: "RECONNECTING",
  } as const;

  const updated = await prisma.roomParticipant.update({
    where: { id: participant.id },
    data: { state: nextState[parsed.data.action], lastSeenAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: {
      roomId: room.id,
      actor: user.id,
      action: `participant.${parsed.data.action}`,
      target: participant.displayName,
    },
  });

  return NextResponse.json({ participant: updated });
}
