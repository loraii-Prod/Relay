import { randomUUID } from "node:crypto";
import OBSWebSocket from "obs-websocket-js";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";

const protocolVersion = 1;
const host = process.env.RELAY_CONNECTOR_HOST ?? "127.0.0.1";
const port = Number(process.env.RELAY_CONNECTOR_PORT ?? 4456);
const bridgeToken = process.env.RELAY_CONNECTOR_TOKEN;
const obsUrl = process.env.OBS_WEBSOCKET_URL ?? "ws://127.0.0.1:4455";
const obsPassword = process.env.OBS_WEBSOCKET_PASSWORD ?? "";

if (!bridgeToken || bridgeToken.length < 24) {
  throw new Error("RELAY_CONNECTOR_TOKEN must be set to a strong random value (24+ characters)");
}

const requestSchema = z.discriminatedUnion("type", [
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("hello"), payload: z.object({}) }),
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("obs.status"), payload: z.object({}) }),
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("guest.create"), payload: z.object({ participantId: z.string(), displayName: z.string().min(1).max(80), browserSourceUrl: z.string().url() }) }),
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("guest.remove"), payload: z.object({ participantId: z.string() }) }),
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("media.control"), payload: z.object({ inputName: z.string().min(1).max(160), command: z.enum(["play", "pause", "restart"]) }) }),
  z.object({ protocolVersion: z.literal(protocolVersion), requestId: z.string(), type: z.literal("diagnostics"), payload: z.object({}) }),
]);

type RequestMessage = z.infer<typeof requestSchema>;
const obs = new OBSWebSocket();
let obsConnected = false;
const managedInputs = new Map<string, string>();

function reply(socket: WebSocket, requestId: string, ok: boolean, payload: unknown) {
  socket.send(JSON.stringify({ protocolVersion, requestId, ok, payload }));
}

async function connectOBS() {
  if (obsConnected) return;
  await obs.connect(obsUrl, obsPassword || undefined);
  obsConnected = true;
  obs.on("ConnectionClosed", () => { obsConnected = false; });
}

async function getOBSStatus() {
  await connectOBS();
  const [version, video, stream, record, collection, program, studio] = await Promise.all([
    obs.call("GetVersion"),
    obs.call("GetVideoSettings"),
    obs.call("GetStreamStatus"),
    obs.call("GetRecordStatus"),
    obs.call("GetSceneCollectionList"),
    obs.call("GetCurrentProgramScene"),
    obs.call("GetStudioModeEnabled"),
  ]);

  return {
    connected: true,
    obsVersion: version.obsVersion,
    obsWebSocketVersion: version.obsWebSocketVersion,
    sceneCollection: collection.currentSceneCollectionName,
    baseWidth: video.baseWidth,
    baseHeight: video.baseHeight,
    outputWidth: video.outputWidth,
    outputHeight: video.outputHeight,
    fpsNumerator: video.fpsNumerator,
    fpsDenominator: video.fpsDenominator,
    streaming: stream.outputActive,
    recording: record.outputActive,
    currentScene: program.currentProgramSceneName,
    studioMode: studio.studioModeEnabled,
    managedInputs: [...managedInputs.values()],
  };
}

async function createGuestInput(message: Extract<RequestMessage, { type: "guest.create" }>) {
  await connectOBS();
  const inputName = `Relay — Guest — ${message.payload.displayName}`;
  const existing = await obs.call("GetInputList");
  const found = existing.inputs.some((input) => input.inputName === inputName);

  if (!found) {
    const scene = await obs.call("GetCurrentProgramScene");
    await obs.call("CreateInput", {
      sceneName: scene.currentProgramSceneName,
      inputName,
      inputKind: "browser_source",
      inputSettings: {
        url: message.payload.browserSourceUrl,
        width: 1920,
        height: 1080,
        reroute_audio: true,
      },
      sceneItemEnabled: true,
    });
  }

  managedInputs.set(message.payload.participantId, inputName);
  return { inputName, created: !found };
}

async function removeGuestInput(participantId: string) {
  await connectOBS();
  const inputName = managedInputs.get(participantId);
  if (!inputName) return { removed: false, reason: "not_managed" };
  await obs.call("RemoveInput", { inputName });
  managedInputs.delete(participantId);
  return { removed: true, inputName };
}

async function controlMedia(inputName: string, command: "play" | "pause" | "restart") {
  await connectOBS();
  const action = command === "play" ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY" : command === "pause" ? "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" : "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART";
  await obs.call("TriggerMediaInputAction", { inputName, mediaAction: action });
  return { inputName, command };
}

async function handle(socket: WebSocket, message: RequestMessage) {
  switch (message.type) {
    case "hello":
      return reply(socket, message.requestId, true, { connectorVersion: "0.1.0", instanceId: randomUUID(), obsConnected });
    case "obs.status":
    case "diagnostics":
      return reply(socket, message.requestId, true, await getOBSStatus());
    case "guest.create":
      return reply(socket, message.requestId, true, await createGuestInput(message));
    case "guest.remove":
      return reply(socket, message.requestId, true, await removeGuestInput(message.payload.participantId));
    case "media.control":
      return reply(socket, message.requestId, true, await controlMedia(message.payload.inputName, message.payload.command));
  }
}

const server = new WebSocketServer({ host, port });
server.on("connection", (socket, request) => {
  const auth = request.headers.authorization;
  if (auth !== `Bearer ${bridgeToken}`) {
    socket.close(1008, "unauthorized");
    return;
  }

  socket.on("message", async (data) => {
    const parsed = requestSchema.safeParse(JSON.parse(data.toString()));
    if (!parsed.success) {
      socket.send(JSON.stringify({ protocolVersion, ok: false, error: "invalid_message" }));
      return;
    }
    try {
      await handle(socket, parsed.data);
    } catch (error) {
      reply(socket, parsed.data.requestId, false, { error: error instanceof Error ? error.message : "connector_error" });
    }
  });
});

console.log(`[Relay Connector] listening on ws://${host}:${port}`);
console.log(`[Relay Connector] OBS target ${obsUrl}`);
