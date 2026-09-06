# Relay

Relay is a remote broadcast contribution control platform designed around OBS Studio workflows.

## v0.1 shell

Implemented routes:
- `/` product entry
- `/dashboard` producer console
- `/room/[roomId]` engineering multiview
- `/join/[token]` guest device preflight (real getUserMedia preview)
- `/test` connection test shell

The room telemetry shown in this first UI slice is explicitly demo data. Production media metrics will be connected to `RTCPeerConnection.getStats()` in the WebRTC milestone.

## Run

```bash
npm install
npm run dev
```

## Next engineering milestone

1. PostgreSQL + Prisma room/invitation schema
2. Auth
3. secure guest tokens
4. WebSocket signalling
5. WebRTC publish/subscribe abstraction
6. waiting room lifecycle
7. real stats collector
8. OBS local connector protocol
