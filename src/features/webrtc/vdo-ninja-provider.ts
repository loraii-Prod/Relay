"use client";

import type {
  MediaTransportConnection,
  MediaTransportProvider,
  MediaTransportState,
  PublishStreamOptions,
  RemoteMediaTrackEvent,
} from "./transport";

// Official VDO.Ninja browser SDK distribution. Pin this to a release tag once
// Relay has completed its production interoperability matrix.
const SDK_URL = "https://cdn.jsdelivr.net/gh/steveseguin/ninjasdk@latest/vdoninja-sdk.min.js";
const SIGNAL_HOST = "wss://wss.vdo.ninja";

type VdoDetailEvent<T> = Event & { detail: T };

type VdoSdk = EventTarget & {
  connect(): Promise<void>;
  disconnect(): Promise<void> | void;
  joinRoom(options: { room: string; password?: string }): Promise<unknown>;
  publish(stream: MediaStream, options: { streamID: string; room?: string; label?: string; password?: string; media?: { video?: { maxBitrate?: number } } }): Promise<string>;
  stopPublishing(): Promise<void> | void;
  view(streamId: string, options?: { audio?: boolean; video?: boolean; label?: string; downloads?: boolean }): Promise<RTCPeerConnection>;
  stopViewing(streamId: string): Promise<void> | void;
};

type VdoConstructor = new (options?: {
  host?: string;
  room?: string;
  password?: string | false;
  salt?: string;
  debug?: boolean;
  turnServers?: RTCIceServer[] | null | false;
  forceTURN?: boolean;
  label?: string;
}) => VdoSdk;

declare global {
  interface Window {
    VDONinjaSDK?: VdoConstructor;
    __relayVdoSdkPromise?: Promise<VdoConstructor>;
  }
}

function loadSdk(): Promise<VdoConstructor> {
  if (window.VDONinjaSDK) return Promise.resolve(window.VDONinjaSDK);
  if (window.__relayVdoSdkPromise) return window.__relayVdoSdkPromise;

  window.__relayVdoSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error("VDO.Ninja SDK load timed out")), 15_000);

    const finish = () => {
      window.clearTimeout(timeout);
      if (window.VDONinjaSDK) resolve(window.VDONinjaSDK);
      else reject(new Error("VDO.Ninja SDK did not expose VDONinjaSDK"));
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("Unable to load VDO.Ninja SDK"));
    }, { once: true });

    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  });

  return window.__relayVdoSdkPromise;
}

export class VdoNinjaTransportProvider implements MediaTransportProvider {
  private sdk: VdoSdk | null = null;
  private connection: MediaTransportConnection | null = null;
  private viewed = new Set<string>();
  private stateListeners = new Set<(state: MediaTransportState) => void>();
  private trackListeners = new Set<(event: RemoteMediaTrackEvent) => void>();
  private trackRemovedListeners = new Set<(event: Omit<RemoteMediaTrackEvent, "track">) => void>();
  state: MediaTransportState = "idle";

  private setState(next: MediaTransportState) {
    this.state = next;
    this.stateListeners.forEach((listener) => listener(next));
  }

  async connect(connection: MediaTransportConnection) {
    this.setState("connecting");
    this.connection = connection;
    const Constructor = await loadSdk();
    const sdk = new Constructor({
      host: SIGNAL_HOST,
      room: connection.roomId,
      password: connection.password,
      salt: "vdo.ninja",
      label: connection.label,
      turnServers: null,
      debug: false,
    });
    this.sdk = sdk;

    sdk.addEventListener("reconnecting", () => this.setState("reconnecting"));
    sdk.addEventListener("reconnected", () => this.setState("connected"));
    sdk.addEventListener("connectionRecovering", () => this.setState("degraded"));
    sdk.addEventListener("connectionRecovered", () => this.setState("connected"));
    sdk.addEventListener("disconnected", () => this.setState("disconnected"));
    sdk.addEventListener("track", (event) => {
      const detail = (event as VdoDetailEvent<{ track: MediaStreamTrack; streamID?: string; uuid?: string }>).detail;
      if (!detail?.track) return;
      const streamId = detail.streamID ?? detail.uuid ?? "unknown";
      const remote: RemoteMediaTrackEvent = {
        trackId: detail.track.id,
        streamId,
        kind: detail.track.kind === "audio" ? "audio" : "video",
        track: detail.track,
      };
      this.trackListeners.forEach((listener) => listener(remote));
    });
    sdk.addEventListener("trackRemoved", (event) => {
      const detail = (event as VdoDetailEvent<{ track?: MediaStreamTrack; streamID?: string; uuid?: string }>).detail;
      if (!detail?.track) return;
      const removed = {
        trackId: detail.track.id,
        streamId: detail.streamID ?? detail.uuid ?? "unknown",
        kind: detail.track.kind === "audio" ? "audio" as const : "video" as const,
      };
      this.trackRemovedListeners.forEach((listener) => listener(removed));
    });

    try {
      await sdk.connect();
      await sdk.joinRoom({ room: connection.roomId, password: connection.password });
      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }

  async publishStream(stream: MediaStream, options: PublishStreamOptions) {
    if (!this.sdk || !this.connection) throw new Error("VDO.Ninja transport is not connected");
    return this.sdk.publish(stream, {
      streamID: options.streamId,
      room: this.connection.roomId,
      password: this.connection.password,
      label: options.label,
      media: options.videoBitrate ? { video: { maxBitrate: options.videoBitrate } } : undefined,
    });
  }

  async stopPublishing() {
    await this.sdk?.stopPublishing();
  }

  async view(streamId: string) {
    if (!this.sdk) throw new Error("VDO.Ninja transport is not connected");
    if (this.viewed.has(streamId)) throw new Error(`Stream ${streamId} is already being viewed`);
    const peer = await this.sdk.view(streamId, { audio: true, video: true, downloads: false });
    this.viewed.add(streamId);
    return peer;
  }

  async stopViewing(streamId: string) {
    if (!this.sdk || !this.viewed.has(streamId)) return;
    await this.sdk.stopViewing(streamId);
    this.viewed.delete(streamId);
  }

  async disconnect() {
    if (this.sdk) {
      for (const streamId of this.viewed) await this.sdk.stopViewing(streamId);
      this.viewed.clear();
      await this.sdk.disconnect();
    }
    this.sdk = null;
    this.connection = null;
    this.setState("disconnected");
  }

  onStateChange(listener: (state: MediaTransportState) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onRemoteTrack(listener: (event: RemoteMediaTrackEvent) => void) {
    this.trackListeners.add(listener);
    return () => this.trackListeners.delete(listener);
  }

  onRemoteTrackRemoved(listener: (event: Omit<RemoteMediaTrackEvent, "track">) => void) {
    this.trackRemovedListeners.add(listener);
    return () => this.trackRemovedListeners.delete(listener);
  }
}
