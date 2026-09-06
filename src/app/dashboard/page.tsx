import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";
import { DashboardRoomControls } from "@/components/dashboard-room-controls";
import { getCurrentUser } from "@/server/auth/session";
import { listRoomsForOwner } from "@/server/rooms/service";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!process.env.DATABASE_URL) {
    return (
      <main className="app-shell">
        <aside className="sidebar"><Brand/><div className="sidebar-section"><span>PRODUCTION</span><a className="active">Rooms</a><a>Team</a><a>Usage</a><a>Recordings</a><a>API</a></div></aside>
        <section className="workspace">
          <header className="workspace-header"><div><span className="kicker">CONTROL CONSOLE</span><h1>Setup required.</h1></div></header>
          <section className="panel setup-panel"><div className="panel-title"><div><span>PERSISTENCE</span><small>Relay will not fake room state.</small></div></div><div className="event-row"><b>PostgreSQL database</b><span>DATABASE_URL is not configured</span><small><StatusDot state="warn"/> REQUIRED</small></div><p>Connect a PostgreSQL database and add its DATABASE_URL to the deployment environment. Once configured, accounts, rooms, invitations, waiting-room state and audit logs become persistent.</p></section>
        </section>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const rooms = await listRoomsForOwner(user.id);
  const active = rooms.filter((room) => room.status !== "ENDED");
  const live = rooms.filter((room) => room.status === "LIVE").length;
  const guestCount = rooms.reduce((sum, room) => sum + room._count.participants, 0);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand/>
        <div className="sidebar-section"><span>PRODUCTION</span>{["Rooms","Team","Usage","Recordings","API"].map((item,index)=><a className={index===0?"active":""} key={item}>{item}</a>)}</div>
        <div className="sidebar-section lower"><span>SYSTEM</span><a>Account</a><a>Support</a><div className="system-state"><StatusDot state="ok"/><div><b>Relay web</b><small>Operational</small></div></div></div>
      </aside>
      <section className="workspace">
        <header className="workspace-header"><div><span className="kicker">CONTROL CONSOLE / {user.name?.toUpperCase() ?? user.email.toUpperCase()}</span><h1>Production rooms</h1></div><DashboardRoomControls/></header>
        <div className="summary-row">
          <div><span>ACTIVE ROOMS</span><b>{String(active.length).padStart(2,"0")}</b><small>{live} currently live</small></div>
          <div><span>PARTICIPANTS</span><b>{String(guestCount).padStart(2,"0")}</b><small>Across all rooms</small></div>
          <div><span>MEDIA BACKEND</span><b style={{fontSize:"20px"}}>READY</b><small><StatusDot state="ok"/> VDO.Ninja WebRTC</small></div>
          <div><span>OBS CONNECTORS</span><b>00</b><small><StatusDot state="idle"/> No workstation registered</small></div>
        </div>
        <section className="panel">
          <div className="panel-title"><div><span>ROOMS</span><small>{rooms.length} production{rooms.length === 1 ? "" : "s"}</small></div></div>
          <div className="room-table head"><span>ROOM</span><span>STATE</span><span>GUESTS</span><span>WAITING ROOM</span><span>UPDATED</span><span></span></div>
          {rooms.length === 0 ? <div className="event-row"><b>No rooms yet</b><span>Create your first production room.</span><small>READY</small></div> : rooms.map((room)=><Link href={`/room/${room.publicId}`} className="room-table row" key={room.id}><span><strong>{room.name}</strong><small>{room.publicId}</small></span><span className="state"><StatusDot state={room.status === "LIVE" ? "ok" : room.status === "PREFLIGHT" ? "warn" : "idle"}/>{room.status}</span><span>{String(room._count.participants).padStart(2,"0")}</span><span>{room.waitingRoom ? "ENABLED" : "BYPASS"}</span><span className="mono">{room.updatedAt.toISOString().slice(0,16).replace("T"," ")}Z</span><span className="open-link">OPEN →</span></Link>)}
        </section>
        <section className="lower-grid">
          <div className="panel"><div className="panel-title"><div><span>CORE SERVICES</span></div></div><div className="event-row"><b>Database</b><span>PostgreSQL persistence</span><small><StatusDot state="ok"/> CONNECTED</small></div><div className="event-row"><b>Media</b><span>VDO.Ninja peer-to-peer WebRTC transport</span><small><StatusDot state="ok"/> READY</small></div></div>
          <div className="panel status-panel"><div className="panel-title"><div><span>SECURITY BOUNDARY</span></div></div><div><span><StatusDot state="ok"/> Producer session</span><b>AUTHENTICATED</b></div><div><span><StatusDot state="ok"/> Guest access</span><b>REVOCABLE TOKENS</b></div><div><span><StatusDot state="idle"/> OBS bridge</span><b>LOCALHOST ONLY</b></div></div>
        </section>
      </section>
    </main>
  );
}
