"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { StatusDot } from "@/components/status-dot";
import { RemoteVideo } from "@/components/remote-video";
import { RemoteAudio } from "@/components/remote-audio";
import { VdoNinjaTransportProvider } from "@/features/webrtc/vdo-ninja-provider";
import { mediaStreamId } from "@/features/webrtc/transport";
import { StatsCollector, type RelayConnectionStats } from "@/features/webrtc/stats-collector";

type Participant = {
  id: string;
  displayName: string;
  roleLabel: string | null;
  state: "WAITING" | "CONNECTED" | "DEGRADED" | "RECONNECTING" | "DISCONNECTED" | "REJECTED";
  joinedAt: string | Date;
  lastSeenAt: string | Date;
};

type RoomData = {
  publicId: string;
  name: string;
  status: "IDLE" | "PREFLIGHT" | "LIVE" | "ENDED";
  maxGuests: number;
  waitingRoom: boolean;
  participants: Participant[];
};

type TrackState = { video?: MediaStreamTrack; audio?: MediaStreamTrack };

function stateDot(state: Participant["state"]): "ok" | "warn" | "bad" | "idle" {
  if (state === "CONNECTED") return "ok";
  if (state === "WAITING" || state === "DEGRADED" || state === "RECONNECTING") return "warn";
  if (state === "REJECTED" || state === "DISCONNECTED") return "bad";
  return "idle";
}

function formatBitrate(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mb/s`;
  return `${Math.round(value / 1000)} kb/s`;
}

function formatMs(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value)} ms`;
}

export function RoomConsole({ initialRoom }: { initialRoom: RoomData }) {
  const [room, setRoom] = useState(initialRoom);
  const [selectedId, setSelectedId] = useState(initialRoom.participants[0]?.id ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [mediaState, setMediaState] = useState<"connecting" | "connected" | "error">("connecting");
  const [tracks, setTracks] = useState<Record<string, TrackState>>({});
  const [stats, setStats] = useState<Record<string, RelayConnectionStats>>({});
  const transportRef = useRef<VdoNinjaTransportProvider | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewingRef = useRef<Set<string>>(new Set());
  const statsCollectorsRef = useRef<Map<string, StatsCollector>>(new Map());

  const participantIds = room.participants.map((participant) => participant.id).join(",");
  const participantByStream = useMemo(() => {
    const map = new Map<string, string>();
    room.participants.forEach((participant) => map.set(mediaStreamId(participant.id), participant.id));
    return map;
    // participantIds deliberately makes this mapping stable across room polling
    // when only participant state/timestamps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantIds]);

  async function refreshRoom() {
    const response = await fetch(`/api/rooms/${room.publicId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setRoom(data.room);
    if (!selectedId && data.room.participants[0]) setSelectedId(data.room.participants[0].id);
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refreshRoom(), 1800);
    return () => window.clearInterval(timer);
  }, [room.publicId, selectedId]);

  useEffect(() => {
    let disposed = false;
    const transport = new VdoNinjaTransportProvider();
    transportRef.current = transport;

    const offState = transport.onStateChange((state) => {
      if (disposed) return;
      if (state === "connected") setMediaState("connected");
      else if (state === "reconnecting" || state === "degraded" || state === "connecting") setMediaState("connecting");
      else if (state === "disconnected") setMediaState("error");
    });
    const offTrack = transport.onRemoteTrack((event) => {
      const participantId = participantByStream.get(event.streamId);
      if (!participantId) return;
      setTracks((current) => ({
        ...current,
        [participantId]: {
          ...current[participantId],
          [event.kind]: event.track,
        },
      }));
    });
    const offRemoved = transport.onRemoteTrackRemoved((event) => {
      const participantId = participantByStream.get(event.streamId);
      if (!participantId) return;
      setTracks((current) => {
        const existing = current[participantId];
        if (!existing) return current;
        const nextTrack = { ...existing };
        delete nextTrack[event.kind];
        return { ...current, [participantId]: nextTrack };
      });
    });

    async function connect() {
      try {
        const response = await fetch(`/api/rooms/${room.publicId}/media-token`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "media_connection_failed");
        if (data.provider !== "vdo.ninja") throw new Error("unsupported_media_provider");
        await transport.connect({ roomId: data.roomId, password: data.password, label: `Producer · ${data.label}` });
        if (!disposed) setMediaState("connected");
      } catch (error) {
        if (!disposed) {
          setMediaState("error");
          setNotice(error instanceof Error ? error.message.replaceAll("_", " ") : "Media connection failed");
        }
      }
    }
    void connect();

    return () => {
      disposed = true;
      offState();
      offTrack();
      offRemoved();
      void transport.disconnect();
      transportRef.current = null;
      peersRef.current.clear();
      viewingRef.current.clear();
      statsCollectorsRef.current.clear();
    };
  }, [room.publicId, participantByStream]);

  const activeIds = room.participants
    .filter((participant) => ["CONNECTED", "DEGRADED", "RECONNECTING"].includes(participant.state))
    .map((participant) => participant.id)
    .join(",");

  useEffect(() => {
    if (mediaState !== "connected" || !transportRef.current) return;
    const transport = transportRef.current;
    const active = room.participants.filter((participant) => ["CONNECTED", "DEGRADED", "RECONNECTING"].includes(participant.state));

    for (const participant of active) {
      const streamId = mediaStreamId(participant.id);
      if (viewingRef.current.has(streamId)) continue;
      viewingRef.current.add(streamId);
      void transport.view(streamId).then((peer) => {
        peersRef.current.set(participant.id, peer);
        statsCollectorsRef.current.set(participant.id, new StatsCollector());
      }).catch((error) => {
        viewingRef.current.delete(streamId);
        setNotice(`Waiting for ${participant.displayName}: ${error instanceof Error ? error.message : "stream unavailable"}`);
      });
    }

    const activeSet = new Set(active.map((participant) => participant.id));
    for (const [participantId] of peersRef.current) {
      if (activeSet.has(participantId)) continue;
      const streamId = mediaStreamId(participantId);
      void transport.stopViewing(streamId);
      peersRef.current.delete(participantId);
      viewingRef.current.delete(streamId);
      statsCollectorsRef.current.delete(participantId);
      setTracks((current) => {
        const next = { ...current };
        delete next[participantId];
        return next;
      });
    }
  }, [mediaState, activeIds, room.participants]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const [participantId, peer] of peersRef.current) {
        const collector = statsCollectorsRef.current.get(participantId);
        if (!collector) continue;
        void collector.collect(peer).then((next) => setStats((current) => ({ ...current, [participantId]: next }))).catch(() => undefined);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  async function participantAction(participantId: string, action: "accept" | "reject" | "remove") {
    setNotice("");
    const response = await fetch(`/api/rooms/${room.publicId}/participants/${participantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice((data.error ?? "operation_failed").replaceAll("_", " "));
      return;
    }
    await refreshRoom();
  }

  async function createInvite() {
    setNotice("");
    const response = await fetch(`/api/rooms/${room.publicId}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "VIDEO_AUDIO", expiresInMinutes: 1440 }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice((data.error ?? "invite_failed").replaceAll("_", " "));
      return;
    }
    setInviteUrl(data.joinUrl);
    await navigator.clipboard?.writeText(data.joinUrl).catch(() => undefined);
    setNotice("Guest invite copied to clipboard");
  }

  async function changeRoomState(status: RoomData["status"]) {
    const response = await fetch(`/api/rooms/${room.publicId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) await refreshRoom();
  }

  const selected = room.participants.find((participant) => participant.id === selectedId) ?? room.participants[0];
  const waiting = room.participants.filter((participant) => participant.state === "WAITING");
  const active = room.participants.filter((participant) => ["CONNECTED", "DEGRADED", "RECONNECTING"].includes(participant.state));
  const selectedStats = selected ? stats[selected.id] : undefined;

  return (
    <>
      <div className="room-body">
        <aside className="guest-rail">
          <div className="rail-title"><span>GUESTS</span><b>{room.participants.length}</b></div>
          {waiting.length > 0 && <div className="rail-title"><span>WAITING</span><b>{waiting.length}</b></div>}
          {room.participants.length === 0 && <div className="event-row"><b>EMPTY ROOM</b><span>Generate an invite to add a contributor.</span></div>}
          {room.participants.map((participant, index) => (
            <button className={`guest-list-item ${selected?.id === participant.id ? "selected" : ""}`} onClick={() => setSelectedId(participant.id)} key={participant.id}>
              <span className="avatar">{String(index + 1).padStart(2, "0")}</span>
              <span><b>{participant.displayName}</b><small>{participant.roleLabel ?? "CONTRIBUTOR"} · {participant.state}</small></span>
              <StatusDot state={stateDot(participant.state)}/>
            </button>
          ))}
          <button className="invite-button" onClick={createInvite}>+ INVITE GUEST</button>
          {inviteUrl && <div className="invite-output"><span>INVITE URL</span><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()}/></div>}
        </aside>

        <section className="multiview">
          <div className="multiview-bar">
            <div><b>MULTIVIEW</b><span>{active.length} ACTIVE · {waiting.length} WAITING</span></div>
            <div className="view-controls"><button className="active">GRID</button><button disabled>ENGINEERING</button></div>
          </div>
          {notice && <div className="operator-notice">{notice.toUpperCase()}</div>}
          {waiting.length > 0 && (
            <div className="waiting-strip">
              {waiting.map((participant) => <div key={participant.id}><div><StatusDot state="warn"/><b>{participant.displayName}</b><span>REQUESTING ACCESS</span></div><div><button onClick={() => participantAction(participant.id, "reject")}>REJECT</button><button className="button primary" onClick={() => participantAction(participant.id, "accept")}>ACCEPT</button></div></div>)}
            </div>
          )}
          <div className="monitor-grid">
            {active.length === 0 && <div className="empty-multiview"><b>NO ACTIVE CONTRIBUTIONS</b><span>Accepted guests will appear here over VDO.Ninja WebRTC.</span></div>}
            {active.map((participant, index) => {
              const participantTracks = tracks[participant.id];
              const participantStats = stats[participant.id];
              return (
                <article className="monitor" key={participant.id} onClick={() => setSelectedId(participant.id)}>
                  <div className="video-surface">
                    {participantTracks?.video ? <RemoteVideo track={participantTracks.video}/> : <div className="video-center"><span>INPUT {String(index + 1).padStart(2, "0")}</span><b>{mediaState === "connected" ? "WAITING FOR VIDEO" : mediaState.toUpperCase()}</b></div>}
                    {participantTracks?.audio && <RemoteAudio track={participantTracks.audio}/>} 
                    <div className="safe-label">{participant.roleLabel ?? "CONTRIBUTOR"}</div>
                    <div className="live-state"><StatusDot state={stateDot(participant.state)}/>{participant.state}</div>
                  </div>
                  <div className="monitor-info">
                    <div className="monitor-title"><div><strong>{participant.displayName}</strong><small>{participant.roleLabel ?? "CONTRIBUTOR"}</small></div><span>{participantTracks?.video ? "VIDEO" : "NO TRACK"}</span></div>
                    <div className="metric-grid">
                      <span>FORMAT <b>{participantStats?.frameWidth && participantStats?.frameHeight ? `${participantStats.frameWidth}×${participantStats.frameHeight}` : "—"}</b></span>
                      <span>CODEC <b>{participantStats?.codec?.replace("video/", "").toUpperCase() ?? "—"}</b></span>
                      <span>BITRATE <b>{formatBitrate(participantStats?.inboundBitrate)}</b></span>
                      <span>RTT <b>{formatMs(participantStats?.rttMs)}</b></span>
                      <span>LOSS <b>{participantStats?.packetLossPercent == null ? "—" : `${participantStats.packetLossPercent.toFixed(1)}%`}</b></span>
                      <span>JITTER <b>{formatMs(participantStats?.jitterMs)}</b></span>
                    </div>
                    <div className="monitor-actions"><button disabled>MUTE</button><button disabled>SOLO</button><button disabled>TALK</button><button disabled>RETURN</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-head"><span>INSPECTOR</span><b>{selected?.displayName ?? "NO SELECTION"}</b><small><StatusDot state={selected ? stateDot(selected.state) : "idle"}/> {selected?.state ?? "IDLE"}</small></div>
          <section><h3>CONTRIBUTION</h3><label><span>Media backend</span><b>VDO.NINJA · {mediaState.toUpperCase()}</b></label><label><span>Video track</span><b>{selected && tracks[selected.id]?.video ? "RECEIVING" : "NOT RECEIVED"}</b></label><label><span>Audio track</span><b>{selected && tracks[selected.id]?.audio ? "RECEIVING" : "NOT RECEIVED"}</b></label><label><span>Role</span><b>{selected?.roleLabel ?? "CONTRIBUTOR"}</b></label></section>
          <section><h3>NETWORK</h3><label><span>RTT</span><b>{formatMs(selectedStats?.rttMs)}</b></label><label><span>Packet loss</span><b>{selectedStats?.packetLossPercent == null ? "NOT REPORTED" : `${selectedStats.packetLossPercent.toFixed(2)}%`}</b></label><label><span>Jitter</span><b>{formatMs(selectedStats?.jitterMs)}</b></label><label><span>Inbound bitrate</span><b>{formatBitrate(selectedStats?.inboundBitrate)}</b></label></section>
          {selected && selected.state !== "WAITING" && selected.state !== "DISCONNECTED" && selected.state !== "REJECTED" && <button className="danger-button" onClick={() => participantAction(selected.id, "remove")}>REMOVE GUEST</button>}
        </aside>
      </div>
      <footer className="comms-bar">
        <div><span className="kicker">PRODUCTION</span><b><StatusDot state={room.status === "LIVE" ? "ok" : "idle"}/> {room.status}</b></div>
        <button onClick={() => changeRoomState("PREFLIGHT")}>PREFLIGHT</button>
        <button onClick={() => changeRoomState("LIVE")} className={room.status === "LIVE" ? "ptt" : ""}>START PRODUCTION</button>
        <button onClick={() => changeRoomState("ENDED")}>END</button>
        <div className="clock"><span>MEDIA</span><b>{mediaState === "connected" ? "ONLINE" : mediaState.toUpperCase()}</b><small>VDO.NINJA</small></div>
      </footer>
    </>
  );
}
