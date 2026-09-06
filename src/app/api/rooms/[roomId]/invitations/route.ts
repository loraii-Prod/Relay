import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInviteSchema } from "@/lib/validation/rooms";
import { getCurrentUser } from "@/server/auth/session";
import { createInvitation } from "@/server/invitations/service";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId } = await params;
  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  const invitations = await prisma.invitation.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, publicId: true, type: true, createdAt: true, expiresAt: true, revokedAt: true },
  });
  return NextResponse.json({ invitations });
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId } = await params;
  const parsed = createInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });

  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const { invitation, token } = await createInvitation(room.id, parsed.data);
  await prisma.auditEvent.create({ data: { roomId: room.id, actor: user.id, action: "invitation.created", target: invitation.type } });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const joinUrl = `${appUrl.replace(/\/$/, "")}/join/${invitation.publicId}#token=${token}`;
  return NextResponse.json({
    invitation: { id: invitation.id, publicId: invitation.publicId, type: invitation.type, expiresAt: invitation.expiresAt },
    joinUrl,
  }, { status: 201 });
}
