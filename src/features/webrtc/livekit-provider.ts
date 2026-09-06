"use client";

import { Room, RoomEvent, Track, type LocalTrack, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import type { MediaTransportProvider, MediaTransportState, PublishTrackOptions } from "./transport";

export class LiveKitTransportProvider implements MediaTransportProvider {
  private room: Room | null = null;
  private listeners = new Set<(state: MediaTransportState) => void>();
  private remoteTracks = new Map<string, RemoteTrack>();
  state: MediaTransportState = "idle";

  private setState(next: MediaTransportState) {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  async connect(_roomId: string, credential: string) {
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
    if (!url) throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not configured");

    this.setState("connecting");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;

    room.on(RoomEvent.Connected, () => this.setState("connected"));
    room.on(RoomEvent.Reconnecting, () => this.setState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => this.setState("connected"));
    room.on(RoomEvent.Disconnected, () => this.setState("disconnected"));
    room.on(RoomEvent.TrackSubscribed, (track) => this.remoteTracks.set(track.sid, track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => this.remoteTracks.delete(track.sid));

    try {
      await room.connect(url, credential, { autoSubscribe: true });
      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }

  async disconnect() {
    if (this.room) await this.room.disconnect();
    this.room = null;
    this.remoteTracks.clear();
    this.setState("disconnected");
  }

  async publish(track: MediaStreamTrack, options: PublishTrackOptions) {
    if (!this.room) throw new Error("LiveKit room is not connected");
    const source = options.role === "microphone"
      ? Track.Source.Microphone
      : options.role === "screen"
        ? Track.Source.ScreenShare
        : Track.Source.Camera;
    await this.room.localParticipant.publishTrack(track, { name: `${options.role}:${options.streamId}`, source });
  }

  async unpublish(trackId: string) {
    if (!this.room) return;
    const publication = Array.from(this.room.localParticipant.trackPublications.values()).find(
      (item) => item.trackSid === trackId || item.track?.sid === trackId,
    );
    const track = publication?.track as LocalTrack | undefined;
    if (track) await this.room.localParticipant.unpublishTrack(track, true);
  }

  async subscribe(trackId: string): Promise<MediaStreamTrack> {
    const existing = this.remoteTracks.get(trackId);
    if (existing?.mediaStreamTrack) return existing.mediaStreamTrack;
    if (!this.room) throw new Error("LiveKit room is not connected");

    const publication = this.findRemotePublication(trackId);
    if (!publication) throw new Error(`Remote track ${trackId} not found`);
    if (publication.track?.mediaStreamTrack) return publication.track.mediaStreamTrack;

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for track ${trackId}`)), 10_000);
      const handler = (track: RemoteTrack) => {
        if (track.sid !== trackId) return;
        window.clearTimeout(timeout);
        this.room?.off(RoomEvent.TrackSubscribed, handler);
        resolve(track.mediaStreamTrack);
      };
      this.room?.on(RoomEvent.TrackSubscribed, handler);
    });
  }

  private findRemotePublication(trackId: string): RemoteTrackPublication | undefined {
    if (!this.room) return undefined;
    for (const participant of this.room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.trackSid === trackId) return publication;
      }
    }
    return undefined;
  }

  onStateChange(listener: (state: MediaTransportState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
