import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";
import { RoomConsole } from "@/components/room-console";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  if (!process.env.DATABASE_URL) redirect("/dashboard");
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const room = await prisma.room.findFirst({
    where: { publicId: roomId, ownerId: user.id },
    include: { participants: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) redirect("/dashboard");

  const initialRoom = {
    publicId: room.publicId,
    name: room.name,
    status: room.status,
    maxGuests: room.maxGuests,
    waitingRoom: room.waitingRoom,
    participants: room.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      roleLabel: participant.roleLabel,
      state: participant.state,
      joinedAt: participant.joinedAt.toISOString(),
      lastSeenAt: participant.lastSeenAt.toISOString(),
    })),
  };

  return (
    <main className="room-shell">
      <header className="room-top">
        <Brand/>
        <div className="room-ident"><span>ROOM</span><b>{room.name.toUpperCase()}</b></div>
        <nav>{["ROOM","GUESTS","ROUTING","COMMS","DRAW","RECORD","OBS","DIAGNOSTICS"].map((item,index)=><button className={index===0?"active":""} key={item} disabled={index > 0}>{item}</button>)}</nav>
        <div className="top-telemetry"><span><StatusDot state="ok"/> WEBRTC · VDO.NINJA</span><span><StatusDot state="idle"/> OBS</span><b>{room.status}</b></div>
      </header>
      <RoomConsole initialRoom={initialRoom}/>
    </main>
  );
}
