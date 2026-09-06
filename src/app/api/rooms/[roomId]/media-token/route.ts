import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.NEXT_PUBLIC_LIVEKIT_URL) {
    return NextResponse.json({ error: "media_backend_not_configured" }, { status: 503 });
  }

  const { roomId } = await params;
  const room = await prisma.room.findFirst({ where: { publicId: roomId, ownerId: user.id } });
  if (!room) return NextResponse.json({ error: "room_not_found" }, { status: 404 });

  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: `producer:${user.id}`,
    name: user.name ?? user.email,
    ttl: "15m",
    metadata: JSON.stringify({ role: "producer", roomPublicId: room.publicId }),
  });

  token.addGrant({ roomJoin: true, room: room.id, canSubscribe: true, canPublish: true, canPublishData: true });
  return NextResponse.json({ token: await token.toJwt(), url: process.env.NEXT_PUBLIC_LIVEKIT_URL, mediaRoomId: room.id });
}
