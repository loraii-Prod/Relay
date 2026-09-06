import { NextResponse } from "next/server";
import { createRoomSchema } from "@/lib/validation/rooms";
import { createRoom, listRoomsForOwner } from "@/server/rooms/service";
import { getCurrentUser } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const rooms = await listRoomsForOwner(user.id);
  return NextResponse.json({ rooms });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = createRoomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });

  const room = await createRoom(user.id, parsed.data);
  return NextResponse.json({ room }, { status: 201 });
}
