import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId } = await params;
  const room = await prisma.room.findFirst({
    where: { publicId: roomId, ownerId: user.id },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      invitations: { orderBy: { createdAt: "desc" } },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  return NextResponse.json({ room });
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  maxGuests: z.number().int().min(1).max(24).optional(),
  waitingRoom: z.boolean().optional(),
  status: z.enum(["IDLE", "PREFLIGHT", "LIVE", "ENDED"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });

  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const updated = await prisma.room.update({ where: { id: room.id }, data: parsed.data });
  await prisma.auditEvent.create({ data: { roomId: room.id, actor: user.id, action: "room.updated", metadata: parsed.data } });
  return NextResponse.json({ room: updated });
}

const deleteSchema = z.object({ confirmName: z.string() });

export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { roomId } = await params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });
  if (parsed.data.confirmName !== room.name) return NextResponse.json({ error: "confirmation_mismatch" }, { status: 409 });
  await prisma.room.delete({ where: { id: room.id } });
  return NextResponse.json({ ok: true });
}
