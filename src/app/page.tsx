import Link from "next/link";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";

export default function Home() {
  return <main className="site-shell">
    <header className="marketing-nav"><Brand/><nav><a href="#workflow">WORKFLOW</a><a href="#system">SYSTEM</a><Link href="/test">CONNECTION TEST</Link></nav><Link href="/dashboard" className="button primary">OPEN CONSOLE</Link></header>
    <section className="hero">
      <div className="eyebrow"><StatusDot state="ok"/> BUILT FOR LIVE PRODUCTION</div>
      <h1>REMOTE PRODUCTION.<br/><span>WITHOUT REMOTE DESKTOP.</span></h1>
      <p>Bring commentators, guests, observers and remote studios directly into your OBS workflow with low-latency contribution, programme return and production comms.</p>
      <div className="hero-actions"><Link href="/dashboard" className="button primary">CREATE ROOM</Link><a href="#workflow" className="button ghost">SEE WORKFLOW</a></div>
      <div className="signal-map" id="workflow">
        <div className="signal-node"><b>01</b><span>REMOTE</span><strong>CONTRIBUTORS</strong><small>Camera / Mic / OBS</small></div><div className="signal-line"><i></i><span>WEBRTC</span></div>
        <div className="signal-node relay-node"><b>02</b><span>RELAY</span><strong>CONTROL PLANE</strong><small>Route / Comms / Monitor</small></div><div className="signal-line"><i></i><span>LOCAL BRIDGE</span></div>
        <div className="signal-node"><b>03</b><span>OBS</span><strong>SWITCHER</strong><small>Scenes / Mix / Output</small></div><div className="signal-line"><i></i><span>OUTPUT</span></div>
        <div className="signal-node"><b>04</b><span>LIVE</span><strong>PROGRAMME</strong><small>Stream / Record</small></div>
      </div>
    </section>
    <section className="feature-strip" id="system">{[["01","CONTRIBUTION","Low-latency browser contribution with real device and connection diagnostics."],["02","RETURN FEEDS","Send PGM, preview, clean or custom return feeds per participant."],["03","PRODUCTION COMMS","Private talkback and crew channels isolated from programme audio."],["04","OBS CONTROL","A constrained local connector keeps OBS as the primary switcher."]].map(x=><article key={x[0]}><b>{x[0]}</b><h2>{x[1]}</h2><p>{x[2]}</p></article>)}</section>
  </main>
}
