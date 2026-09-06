"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";
import { MediaDeviceManager, type ContributionPreset } from "@/features/webrtc/media-device-manager";
import { LiveKitTransportProvider } from "@/features/webrtc/livekit-provider";

type Stage = "preflight" | "joining" | "waiting" | "connecting" | "live" | "rejected" | "error";

type DeviceLists = {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const invitationId = params.token;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transportRef = useRef<LiveKitTransportProvider | null>(null);
  const pollingRef = useRef<number | null>(null);

  const manager = useMemo(() => new MediaDeviceManager(), []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceLists>({ cameras: [], microphones: [], speakers: [] });
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [quality, setQuality] = useState<ContributionPreset>("BROADCAST");
  const [deviceStatus, setDeviceStatus] = useState("REQUEST DEVICE ACCESS");
  const [stage, setStage] = useState<Stage>("preflight");
  const [message, setMessage] = useState("");
  const [participant, setParticipant] = useState<{ id: string; sessionKey: string } | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  function invitationSecret() {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.hash.slice(1)).get("token");
  }

  async function refreshDevices() {
    const next = await manager.listDevices();
    setDevices(next);
    if (!cameraId && next.cameras[0]) setCameraId(next.cameras[0].deviceId);
    if (!microphoneId && next.microphones[0]) setMicrophoneId(next.microphones[0].deviceId);
  }

  async function startMedia() {
    setDeviceStatus("OPENING DEVICES…");
    setMessage("");
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const next = await manager.open(
        { cameraId: cameraId || undefined, microphoneId: microphoneId || undefined },
        quality,
      );
      streamRef.current = next;
      setStream(next);
      if (videoRef.current) videoRef.current.srcObject = next;
      await refreshDevices();
      setDeviceStatus("DEVICES READY");
    } catch (error) {
      setDeviceStatus("DEVICE ACCESS FAILED");
      setMessage(error instanceof Error ? error.message : "Unable to access camera or microphone.");
    }
  }

  async function enterWaitingRoom() {
    const secret = invitationSecret();
    if (!secret) {
      setStage("error");
      setMessage("This invite link is incomplete or has been modified.");
      return;
    }
    if (!stream || !displayName.trim()) {
      setMessage("Enter your name and complete the camera/microphone check first.");
      return;
    }

    setStage("joining");
    setMessage("");
    try {
      const response = await fetch("/api/guest/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId, token: secret, displayName: displayName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to join this room");
      setParticipant({ id: data.participant.id, sessionKey: data.participant.sessionKey });
      setRoomName(data.room.name);
      if (data.participant.state === "CONNECTED") {
        await connectMedia(data.participant.id, data.participant.sessionKey);
      } else {
        setStage("waiting");
      }
    } catch (error) {
      setStage("error");
      setMessage(error instanceof Error ? error.message : "Unable to join this room.");
    }
  }

  async function connectMedia(participantId: string, sessionKey: string) {
    if (!streamRef.current) throw new Error("Local media is no longer available");
    setStage("connecting");
    const response = await fetch("/api/media/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId, sessionKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Unable to start media contribution");

    const transport = new LiveKitTransportProvider();
    transportRef.current = transport;
    await transport.connect(data.roomId, data.token);

    const camera = streamRef.current.getVideoTracks()[0];
    const microphone = streamRef.current.getAudioTracks()[0];
    if (camera) await transport.publish(camera, { role: "camera", streamId: participantId });
    if (microphone) await transport.publish(microphone, { role: "microphone", streamId: participantId });
    setStage("live");
  }

  useEffect(() => {
    if (stage !== "waiting" || !participant) return;
    async function poll() {
      try {
        const query = new URLSearchParams({ participantId: participant!.id, sessionKey: participant!.sessionKey });
        const response = await fetch(`/api/guest/status?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const state = data.participant.state as string;
        if (state === "CONNECTED") {
          if (pollingRef.current) window.clearInterval(pollingRef.current);
          await connectMedia(participant!.id, participant!.sessionKey);
        } else if (state === "REJECTED" || state === "DISCONNECTED") {
          if (pollingRef.current) window.clearInterval(pollingRef.current);
          setStage("rejected");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Connection check failed");
      }
    }
    void poll();
    pollingRef.current = window.setInterval(() => void poll(), 1500);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [stage, participant]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      void transportRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (stage === "waiting" || stage === "connecting" || stage === "live" || stage === "rejected" || stage === "error") {
    return (
      <main className="join-shell">
        <header><Brand/><span className="secure-label"><StatusDot state={stage === "live" ? "ok" : stage === "rejected" || stage === "error" ? "bad" : "warn"}/> SECURE CONTRIBUTION</span></header>
        <section className="join-card">
          <div className="join-copy">
            <span className="kicker">{roomName ? roomName.toUpperCase() : "RELAY"} / CONTRIBUTOR</span>
            <h1>{stage === "waiting" ? "Waiting for producer" : stage === "connecting" ? "Connecting media" : stage === "live" ? "You’re connected" : stage === "rejected" ? "Access ended" : "Unable to join"}</h1>
            <p>{stage === "waiting" ? "Your devices are ready. The producer can see your request and must accept you before your contribution goes on the production media network." : stage === "connecting" ? "The producer accepted you. Relay is establishing the low-latency media path." : stage === "live" ? "Your camera and microphone are being contributed to Relay. Keep this page open during the production." : stage === "rejected" ? "The producer rejected or removed this contribution session." : message}</p>
          </div>
          {stage === "live" && <div className="preview-box"><video ref={videoRef} autoPlay playsInline muted/><div className="live-state"><StatusDot state="ok"/> CONTRIBUTING</div></div>}
          {stage === "waiting" && <div className="test-result"><div><span>STATE</span><b>WAITING ROOM</b></div><span className="secure-label"><StatusDot state="warn"/> PRODUCER APPROVAL REQUIRED</span></div>}
          {message && stage !== "error" && <p>{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="join-shell">
      <header><Brand/><span className="secure-label"><StatusDot state="ok"/> SECURE GUEST LINK</span></header>
      <section className="join-card">
        <div className="join-copy"><span className="kicker">PRE-FLIGHT / CONTRIBUTOR</span><h1>Join production</h1><p>Check your camera and microphone before entering the producer waiting room.</p></div>
        <div className="preview-box"><video ref={videoRef} autoPlay playsInline muted/><div className="preview-placeholder">{!stream && <><b>CAMERA PREVIEW</b><span>Media remains local until the producer accepts you.</span></>}</div></div>
        <div className="form-grid">
          <label><span>DISPLAY NAME</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name"/></label>
          <label><span>CAMERA</span><select value={cameraId} onChange={(event) => setCameraId(event.target.value)}><option value="">System default</option>{devices.cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
          <label><span>MICROPHONE</span><select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}><option value="">System default</option>{devices.microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
          <label><span>QUALITY</span><select value={quality} onChange={(event) => setQuality(event.target.value as ContributionPreset)}><option value="BROADCAST">BROADCAST — 1080p60</option><option value="HIGH">HIGH — 1080p30</option><option value="STANDARD">STANDARD — 720p30</option><option value="LOW">LOW — 540p30</option></select></label>
        </div>
        <div className="readiness"><span><StatusDot state={stream?.getVideoTracks().length ? "ok" : "idle"}/>Camera</span><span><StatusDot state={stream?.getAudioTracks().length ? "ok" : "idle"}/>Microphone</span><span><StatusDot state={typeof RTCPeerConnection !== "undefined" ? "ok" : "bad"}/>WebRTC</span><span><StatusDot state="ok"/>Browser</span></div>
        {message && <p>{message}</p>}
        <div className="join-actions"><button className="button ghost" onClick={startMedia}>{deviceStatus}</button><button className="button primary" onClick={enterWaitingRoom} disabled={!stream || !displayName.trim() || stage === "joining"}>{stage === "joining" ? "JOINING…" : "ENTER WAITING ROOM"}</button></div>
      </section>
    </main>
  );
}
