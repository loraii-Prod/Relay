# Relay

Relay is a remote broadcast contribution and production-control platform built around OBS Studio workflows.

> The website manages the remote production. OBS remains the switcher.

## Current milestone — v0.5

Relay currently includes:

- native producer accounts and persistent sessions
- PostgreSQL / Prisma persistence
- production room creation and lifecycle
- secure, revocable guest invitation links
- browser camera and microphone preflight
- producer waiting-room accept / reject flow
- VDO.Ninja WebRTC contribution transport
- producer multiview with incoming camera + audio
- real browser WebRTC telemetry using `RTCPeerConnection.getStats()`
- participant state and audit history
- a constrained localhost OBS connector prototype
- connection-test tooling

Routes:

- `/` — product entry
- `/auth` — producer sign in / registration
- `/dashboard` — persistent producer room dashboard
- `/room/[roomId]` — engineering multiview and waiting-room console
- `/join/[token]` — secure guest preflight / contribution page
- `/test` — browser and WebRTC capability tests
- `/api/health` — service health

## Media architecture

Relay owns room state, authorization, invitations, routing decisions, UI and production workflow. VDO.Ninja is used only as the browser WebRTC media/signalling layer.

The browser SDK is loaded from VDO.Ninja's documented CDN distribution rather than bundled into Relay. Media room credentials are derived server-side from Relay's private internal room identifier and are returned only to authenticated producers or accepted guest sessions.

A contributor publishes one stable stream ID per Relay participant. The producer subscribes to those streams and retains the returned `RTCPeerConnection`, allowing Relay to collect actual RTT, packet loss, jitter, bitrate, resolution and codec information instead of displaying synthetic telemetry.

## Database

Relay uses PostgreSQL through Prisma. On production builds, `scripts/build.mjs` runs:

1. `prisma generate`
2. `prisma migrate deploy` when `DATABASE_URL` is present
3. `next build`

For Vercel, a Neon Postgres integration works with the standard `DATABASE_URL` variable.

## Environment

Copy `.env.example` for local development.

Required web variables:

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

VDO.Ninja does not require a Relay API key.

## Run the web application

```bash
npm install
npm run dev
```

## OBS connector

The `connector/` package is intentionally separate from the hosted web application. It binds to localhost and talks to OBS WebSocket locally so OBS credentials never need to be exposed to Relay's public web deployment.

Current connector commands are deliberately constrained to Relay-owned operations such as OBS status, Relay guest Browser Source creation/removal and media control. It does not provide an arbitrary OBS command tunnel.

Local connector variables are documented in `.env.example`.

## Next work

The next engineering milestones are:

- end-to-end VDO.Ninja contribution interoperability testing
- automatic VDO.Ninja viewer URLs for Relay-managed OBS Browser Sources
- connector pairing / registration UI
- resilient participant reconnection without duplicate OBS sources
- programme return and clean return feeds
- private talkback and crew comms
- routing matrix and operator permissions
- deeper diagnostics and scoped Companion / Stream Deck control API

Features that are not implemented must remain visibly unavailable in the UI rather than simulating a connected state.
