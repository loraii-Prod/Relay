"use client";

import Link from "next/link";
import { useState } from "react";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";

type CheckState = "idle" | "ok" | "warn" | "bad";
type Check = { id: string; label: string; detail: string; state: CheckState };

const initialChecks: Check[] = [
  { id: "browser", label: "BROWSER", detail: "Not tested", state: "idle" },
  { id: "camera", label: "CAMERA", detail: "Permission required", state: "idle" },
  { id: "microphone", label: "MICROPHONE", detail: "Permission required", state: "idle" },
  { id: "webrtc", label: "WEBRTC", detail: "Not tested", state: "idle" },
  { id: "ice", label: "ICE", detail: "Not tested", state: "idle" },
  { id: "network", label: "RELAY API", detail: "Not tested", state: "idle" },
  { id: "codecs", label: "CODECS", detail: "Not tested", state: "idle" },
  { id: "turn", label: "TURN / SFU", detail: "Requires configured media backend", state: "idle" },
];

export default function TestPage() {
  const [checks, setChecks] = useState(initialChecks);
  const [running, setRunning] = useState(false);

  function update(id: string, detail: string, state: CheckState) {
    setChecks((current) => current.map((check) => check.id === id ? { ...check, detail, state } : check));
  }

  async function runAll() {
    setRunning(true);
    try {
      update("browser", `${navigator.userAgent.includes("Chrome") ? "Chromium" : navigator.userAgent.includes("Firefox") ? "Firefox" : navigator.userAgent.includes("Safari") ? "Safari" : "Modern browser"}`, "ok");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const video = stream.getVideoTracks()[0];
        const audio = stream.getAudioTracks()[0];
        update("camera", video ? `${video.label || "Camera"} ready` : "No camera track", video ? "ok" : "bad");
        update("microphone", audio ? `${audio.label || "Microphone"} ready` : "No microphone track", audio ? "ok" : "bad");
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Permission denied";
        update("camera", detail, "bad");
        update("microphone", detail, "bad");
      }

      if (typeof RTCPeerConnection === "undefined") {
        update("webrtc", "RTCPeerConnection unavailable", "bad");
        update("ice", "Unavailable", "bad");
      } else {
        update("webrtc", "RTCPeerConnection supported", "ok");
        const peer = new RTCPeerConnection();
        peer.createDataChannel("relay-test");
        const candidateTypes = new Set<string>();
        peer.onicecandidate = (event) => {
          const candidate = event.candidate?.candidate ?? "";
          const match = candidate.match(/ typ ([a-z]+)/i);
          if (match?.[1]) candidateTypes.add(match[1].toUpperCase());
        };
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        update("ice", candidateTypes.size ? `Candidates: ${[...candidateTypes].join(", ")}` : "No candidates gathered", candidateTypes.size ? "ok" : "warn");
        peer.close();
      }

      const videoCaps = typeof RTCRtpSender !== "undefined" ? RTCRtpSender.getCapabilities("video") : null;
      const codecs = [...new Set((videoCaps?.codecs ?? []).map((codec) => codec.mimeType.split("/")[1]).filter(Boolean))];
      update("codecs", codecs.length ? codecs.join(" · ") : "No video codec capabilities reported", codecs.length ? "ok" : "warn");

      const started = performance.now();
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const latency = Math.round(performance.now() - started);
        const data = await response.json();
        update("network", `${latency} ms · ${data.status}`, response.ok && latency < 500 ? "ok" : "warn");
        update("turn", data.checks?.mediaTransport === "not-configured" ? "Media backend not configured" : String(data.checks?.mediaTransport ?? "Not tested"), data.checks?.mediaTransport === "not-configured" ? "warn" : "ok");
      } catch (error) {
        update("network", error instanceof Error ? error.message : "Relay API unreachable", "bad");
      }
    } finally {
      setRunning(false);
    }
  }

  const bad = checks.some((check) => check.state === "bad");
  const warning = checks.some((check) => check.state === "warn" || check.state === "idle");
  const overall = bad ? "FAIL" : warning ? "WARNING" : "READY";

  return (
    <main className="test-shell">
      <header><Brand/><Link href="/dashboard" className="text-button">CONTROL CONSOLE →</Link></header>
      <section className="test-content">
        <span className="kicker">RELAY / CONNECTION TEST</span>
        <h1>Pre-production system check</h1>
        <p>Run a real browser, media-device, WebRTC and Relay endpoint check before call time. No result is simulated.</p>
        <div className="test-list">
          {checks.map((check) => <div key={check.id}><StatusDot state={check.state}/><b>{check.label}</b><span>{check.detail}</span><button onClick={runAll} disabled={running}>TEST</button></div>)}
        </div>
        <div className="test-result"><div><span>OVERALL STATUS</span><b>{overall}</b></div><button className="button primary" onClick={runAll} disabled={running}>{running ? "TESTING…" : "RUN ALL TESTS"}</button></div>
      </section>
    </main>
  );
}
