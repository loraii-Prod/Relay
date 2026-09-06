"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { StatusDot } from "@/components/status-dot";

export default function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Authentication failed");
      window.location.href = "/dashboard";
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replaceAll("_", " ") : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="join-shell">
      <header><Brand/><Link href="/" className="text-button">← PRODUCT</Link></header>
      <section className="join-card" style={{ maxWidth: 640 }}>
        <div className="join-copy">
          <span className="kicker">RELAY / PRODUCER ACCESS</span>
          <h1>{mode === "signin" ? "Open control room" : "Create producer account"}</h1>
          <p>Producer accounts control rooms, invitations, routing and OBS integration. Guests never need an account.</p>
        </div>
        <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          {mode === "signup" && <label><span>NAME</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required/></label>}
          <label><span>EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required/></label>
          <label><span>PASSWORD</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 10 : undefined} required/></label>
          {message && <div className="secure-label"><StatusDot state="bad"/> {message.toUpperCase()}</div>}
          <button className="button primary" disabled={busy}>{busy ? "WORKING…" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
        </form>
        <button className="text-button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>
          {mode === "signin" ? "NEW TO RELAY? CREATE ACCOUNT →" : "ALREADY HAVE AN ACCOUNT? SIGN IN →"}
        </button>
      </section>
    </main>
  );
}
