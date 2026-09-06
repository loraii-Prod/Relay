"use client";

import { useEffect, useRef, useState } from "react";
import { Room as LiveKitRoom, RoomEvent, Track, type RemoteVideoTrack } from "livekit-client";
import { StatusDot } from "@/components/status-dot";
import { RemoteVideo } from "@/components/remote-video";

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

function stateDot(state: Participant["state"]): "ok" | "warn" | "bad" | "idle" {
  if (state === "CONNECTED") return "ok";
  if (state === "WAITING" || state === "DEGRADED" || state === "RECONNECTING") return "warn";
  if (state === "REJECTED" || state === "DISCONNECTED") return "bad";
  return "idle";
}

export function RoomConsole({ initialRoom, mediaConfigured }: { initialRoom: RoomData; mediaConfigured: boolean }) {
  const [room, setRoom] = useState(initialRoom);
  const [selectedId, setSelectedId] = useState(initialRoom.participants[0]?.id ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [mediaState, setMediaState] = useState<"not-configured" | "connecting" | "connected" | "error">(mediaConfigured ? "connecting" : "not-configured");
  const [videoTracks, setVideoTracks] = useState<Record<string, RemoteVideoTrack>>({});
  const liveKitRoomRef = useRef<LiveKitRoom | null>(null);

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
  });

  useEffect(() => {
    if (!mediaConfigured) return;
    let disposed = false;
    const mediaRoom = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
    liveKitRoomRef.current = mediaRoom;

    mediaRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;
      setVideoTracks((current) => ({ ...current, [participant.identity]: track as RemoteVideoTrack }));
    });
    mediaRoom.on(RoomEvent.TrackUnsubscribed, (_track, _publication, participant) => {
      setVideoTracks((current) => {
        const next = { ...current };
        delete next[participant.identity];
        return next;
      });
    });
    mediaRoom.on(RoomEvent.Reconnecting, () => setMediaState("connecting"));
    mediaRoom.on(RoomEvent.Reconnected, () => setMediaState("connected"));
    mediaRoom.on(RoomEvent.Disconnected, () => { if (!disposed) setMediaState("error"); });

    async function connect() {
      try {
        const response = await fetch(`/api/rooms/${room.publicId}/media-token`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "media_connection_failed");
        await mediaRoom.connect(data.url, data.token, { autoSubscribe: true });
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
      void mediaRoom.disconnect();
      liveKitRoomRef.current = null;
    };
  }, [mediaConfigured, room.publicId]);

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
            {active.length === 0 && <div className="empty-multiview"><b>NO ACTIVE CONTRIBUTIONS</b><span>{mediaConfigured ? "Waiting for accepted guests to publish media." : "Configure the WebRTC media backend to receive contributions."}</span></div>}
            {active.map((participant, index) => {
              const track = videoTracks[participant.id];
              return (
                <article className="monitor" key={participant.id} onClick={() => setSelectedId(participant.id)}>
                  <div className="video-surface">
                    {track ? <RemoteVideo track={track}/> : <div className="video-center"><span>INPUT {String(index + 1).padStart(2, "0")}</span><b>{mediaState === "connected" ? "WAITING FOR VIDEO" : mediaState.toUpperCase()}</b></div>}
                    <div className="safe-label">{participant.roleLabel ?? "CONTRIBUTOR"}</div>
                    <div className="live-state"><StatusDot state={stateDot(participant.state)}/>{participant.state}</div>
                  </div>
                  <div className="monitor-info">
                    <div className="monitor-title"><div><strong>{participant.displayName}</strong><small>{participant.roleLabel ?? "CONTRIBUTOR"}</small></div><span>{track ? "VIDEO" : "NO TRACK"}</span></div>
                    <div className="metric-grid"><span>FORMAT <b>{track?.dimensions ? `${track.dimensions.width}×${track.dimensions.height}` : "—"}</b></span><span>SOURCE <b>{track ? "WEBRTC" : "—"}</b></span><span>BITRATE <b>—</b></span><span>RTT <b>—</b></span><span>LOSS <b>—</b></span><span>JITTER <b>—</b></span></div>
                    <div className="monitor-actions"><button disabled>MUTE</button><button disabled>SOLO</button><button disabled>TALK</button><button disabled>RETURN</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-head"><span>INSPECTOR</span><b>{selected?.displayName ?? "NO SELECTION"}</b><small><StatusDot state={selected ? stateDot(selected.state) : "idle"}/> {selected?.state ?? "IDLE"}</small></div>
          <section><h3>CONTRIBUTION</h3><label><span>Media backend</span><b>{mediaState.toUpperCase()}</b></label><label><span>Video track</span><b>{selected && videoTracks[selected.id] ? "RECEIVING" : "NOT RECEIVED"}</b></label><label><span>Role</span><b>{selected?.roleLabel ?? "CONTRIBUTOR"}</b></label></section>
          <section><h3>NETWORK</h3><label><span>RTT</span><b>NOT AVAILABLE</b></label><label><span>Packet loss</span><b>NOT AVAILABLE</b></label><label><span>Jitter</span><b>NOT AVAILABLE</b></label></section>
          {selected && selected.state !== "WAITING" && selected.state !== "DISCONNECTED" && selected.state !== "REJECTED" && <button className="danger-button" onClick={() => participantAction(selected.id, "remove")}>REMOVE GUEST</button>}
        </aside>
      </div>
      <footer className="comms-bar">
        <div><span className="kicker">PRODUCTION</span><b><StatusDot state={room.status === "LIVE" ? "ok" : "idle"}/> {room.status}</b></div>
        <button onClick={() => changeRoomState("PREFLIGHT")}>PREFLIGHT</button>
        <button onClick={() => changeRoomState("LIVE")} className={room.status === "LIVE" ? "ptt" : ""}>START PRODUCTION</button>
        <button onClick={() => changeRoomState("ENDED")}>END</button>
        <div className="clock"><span>MEDIA</span><b>{mediaState === "connected" ? "ONLINE" : mediaState.toUpperCase()}</b><small>LIVEKIT</small></div>
      </footer>
    </>
  );
}
