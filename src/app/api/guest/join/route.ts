import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveInvitation } from "@/server/invitations/service";

export const runtime = "nodejs";

const requestSchema = z.object({
  invitationId: z.string().min(1),
  token: z.string().min(16),
  displayName: z.string().trim().min(1).max(60),
  roleLabel: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });
  }

  const invitation = await resolveInvitation(parsed.data.invitationId, parsed.data.token);
  if (!invitation) return NextResponse.json({ error: "invalid_or_expired_invitation" }, { status: 401 });

  const participant = await prisma.roomParticipant.create({
    data: {
      roomId: invitation.roomId,
      displayName: parsed.data.displayName,
      roleLabel: parsed.data.roleLabel,
      state: invitation.room.waitingRoom ? "WAITING" : "CONNECTED",
    },
  });

  await prisma.auditEvent.create({
    data: {
      roomId: invitation.roomId,
      actor: participant.id,
      action: "guest.joined",
      target: participant.displayName,
    },
  });

  return NextResponse.json({
    participant: {
      id: participant.id,
      sessionKey: participant.sessionKey,
      state: participant.state,
      displayName: participant.displayName,
    },
    room: { publicId: invitation.room.publicId, name: invitation.room.name },
  }, { status: 201 });
}
