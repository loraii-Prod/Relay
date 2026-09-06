import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { getVdoRoomCredentials } from "@/server/media/vdo";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { roomId } = await params;
  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const media = getVdoRoomCredentials(room.id);
  return NextResponse.json({
    provider: media.provider,
    roomId: media.roomId,
    password: media.password,
    label: user.name ?? user.email,
  });
}
