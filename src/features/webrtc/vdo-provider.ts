"use client";

import VDONinja from "@vdoninja/sdk";
import type { MediaTransportProvider, MediaTransportState, PublishTrackOptions } from "./transport";

/**
 * Relay media transport backed by the official VDO.Ninja SDK.
 * Relay owns room authorization and workflow; VDO.Ninja only carries media/data.
 */
export class VDONinjaTransportProvider implements MediaTransportProvider {
  private vdo: VDONinja | null = null;
  private listeners = new Set<(state: MediaTransportState) => void>();
  private remoteTracks = new Map<string, MediaStreamTrack>();
  private localStream: MediaStream | null = null;
  state: MediaTransportState = "idle";

  private setState(next: MediaTransportState) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  async connect(roomId: string, credential: string) {
    this.setState("connecting");
    const vdo = new VDONinja({
      salt: "vdo.ninja",
      password: credential,
      host: process.env.NEXT_PUBLIC_VDO_SIGNALING_URL || "wss://wss.vdo.ninja",
    });
    this.vdo = vdo;

    vdo.addEventListener("connected", () => this.setState("connected"));
    vdo.addEventListener("disconnected", () => this.setState("disconnected"));
    vdo.addEventListener("error", () => this.setState("degraded"));
    vdo.addEventListener("track", (event: Event) => {
      const detail = (event as CustomEvent<{ track: MediaStreamTrack; streamID?: string }>).detail;
      if (detail?.track) this.remoteTracks.set(detail.streamID || detail.track.id, detail.track);
    });

    try {
      await vdo.connect();
      await vdo.joinRoom({ room: roomId });
      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }

  async disconnect() {
    if (this.vdo) await this.vdo.disconnect();
    this.vdo = null;
    this.remoteTracks.clear();
    this.localStream = null;
    this.setState("disconnected");
  }

  async publish(track: MediaStreamTrack, options: PublishTrackOptions) {
    if (!this.vdo) throw new Error("VDO.Ninja is not connected");
    if (!this.localStream) this.localStream = new MediaStream();
    if (!this.localStream.getTracks().some((item) => item.id === track.id)) this.localStream.addTrack(track);
    // Publish once the camera/mic stream is assembled. Re-publish updates the active stream safely.
    await this.vdo.publish(this.localStream, { streamID: options.streamId });
  }

  async unpublish(_trackId: string) {
    if (!this.vdo) return;
    await this.vdo.stopPublishing();
    this.localStream = null;
  }

  async subscribe(trackId: string): Promise<MediaStreamTrack> {
    const existing = this.remoteTracks.get(trackId);
    if (existing) return existing;
    if (!this.vdo) throw new Error("VDO.Ninja is not connected");
    await this.vdo.view(trackId, { audio: true, video: true });
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for VDO.Ninja stream ${trackId}`)), 10_000);
      const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ track: MediaStreamTrack; streamID?: string }>).detail;
        if (!detail?.track || (detail.streamID && detail.streamID !== trackId)) return;
        window.clearTimeout(timeout);
        this.vdo?.removeEventListener("track", handler);
        resolve(detail.track);
      };
      this.vdo?.addEventListener("track", handler);
    });
  }

  onStateChange(listener: (state: MediaTransportState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
