"use client";

import { FormEvent, useState } from "react";

export function DashboardRoomControls() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [maxGuests, setMaxGuests] = useState(8);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, maxGuests, waitingRoom }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create room");
      window.location.href = `/room/${data.room.publicId}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Unable to create room");
      setBusy(false);
    }
  }

  if (!open) return <button className="button primary" onClick={() => setOpen(true)}>+ CREATE ROOM</button>;

  return (
    <form onSubmit={submit} className="create-room-inline">
      <label><span>ROOM NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="OVERDRIVE — MAIN" required minLength={2} maxLength={80}/></label>
      <label><span>MAX GUESTS</span><input type="number" min={1} max={24} value={maxGuests} onChange={(event) => setMaxGuests(Number(event.target.value))}/></label>
      <label className="toggle-row"><span>WAITING ROOM</span><input type="checkbox" checked={waitingRoom} onChange={(event) => setWaitingRoom(event.target.checked)}/></label>
      <div className="join-actions"><button type="button" className="button ghost" onClick={() => setOpen(false)}>CANCEL</button><button className="button primary" disabled={busy}>{busy ? "CREATING…" : "CREATE"}</button></div>
      {error && <small>{error.toUpperCase()}</small>}
    </form>
  );
}
