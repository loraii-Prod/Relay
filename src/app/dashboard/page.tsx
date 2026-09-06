import Link from "next/link";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";

const rooms = [
  { name: "OVERDRIVE — MAIN", id: "overdrive-main", guests: 4, status: "LIVE", obs: true, runtime: "01:42:18" },
  { name: "NOVA — DESK TEST", id: "nova-desk", guests: 2, status: "STANDBY", obs: false, runtime: "00:18:04" },
];
export default function Dashboard() {
 return <main className="app-shell"><aside className="sidebar"><Brand/><div className="sidebar-section"><span>PRODUCTION</span>{["Rooms","Team","Usage","Recordings","API"].map((x,i)=><a className={i===0?"active":""} key={x}>{x}</a>)}</div><div className="sidebar-section lower"><span>SYSTEM</span><a>Account</a><a>Support</a><div className="system-state"><StatusDot state="ok"/><div><b>Relay services</b><small>Operational</small></div></div></div></aside>
 <section className="workspace"><header className="workspace-header"><div><span className="kicker">CONTROL CONSOLE</span><h1>Good evening.</h1></div><button className="button primary">+ CREATE ROOM</button></header>
 <div className="summary-row"><div><span>ACTIVE ROOMS</span><b>02</b><small>1 currently live</small></div><div><span>CONNECTED GUESTS</span><b>06</b><small>4 video · 2 audio</small></div><div><span>MONTHLY USAGE</span><b>27.4 <i>h</i></b><small>184 GB transferred</small></div><div><span>OBS CONNECTORS</span><b>01</b><small><StatusDot state="ok"/> main workstation online</small></div></div>
 <section className="panel"><div className="panel-title"><div><span>ROOMS</span><small>2 productions</small></div><button className="text-button">FILTER</button></div><div className="room-table head"><span>ROOM</span><span>STATE</span><span>GUESTS</span><span>OBS</span><span>RUNTIME</span><span></span></div>{rooms.map(r=><Link href={`/room/${r.id}`} className="room-table row" key={r.id}><span><strong>{r.name}</strong><small>eu-west · 1080p60</small></span><span className="state"><StatusDot state={r.status==="LIVE"?"ok":"idle"}/>{r.status}</span><span>{String(r.guests).padStart(2,"0")}</span><span>{r.obs?"CONNECTED":"OFFLINE"}</span><span className="mono">{r.runtime}</span><span className="open-link">OPEN →</span></Link>)}</section>
 <section className="lower-grid"><div className="panel"><div className="panel-title"><div><span>RECENT PRODUCTIONS</span></div></div><div className="event-row"><b>ONYX Academy Test</b><span>Yesterday · 01:14:22</span><small>4 guests</small></div><div className="event-row"><b>Observer Link Test</b><span>Sep 04 · 00:42:10</span><small>2 guests</small></div></div><div className="panel status-panel"><div className="panel-title"><div><span>INFRASTRUCTURE</span></div></div><div><span><StatusDot state="ok"/> Signalling</span><b>18 ms</b></div><div><span><StatusDot state="ok"/> Media region</span><b>EU-WEST</b></div><div><span><StatusDot state="ok"/> TURN</span><b>READY</b></div></div></section>
 </section></main>
}
