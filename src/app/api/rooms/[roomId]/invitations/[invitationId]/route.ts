import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ roomId: string; invitationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId, invitationId } = await params;
  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, roomId: room.id } });
  if (!invitation) return NextResponse.json({ error: "invitation_not_found" }, { status: 404 });
  if (!invitation.revokedAt) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    await prisma.auditEvent.create({ data: { roomId: room.id, actor: user.id, action: "invitation.revoked", target: invitation.id } });
  }
  return NextResponse.json({ ok: true });
}
