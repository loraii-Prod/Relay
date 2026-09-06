"use client";

import { Room, RoomEvent, Track, type LocalTrack, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from "livekit-client";
import type { MediaTransportProvider, MediaTransportState, PublishTrackOptions, RemoteMediaTrackEvent } from "./transport";

export class LiveKitTransportProvider implements MediaTransportProvider {
  private room: Room | null = null;
  private stateListeners = new Set<(state: MediaTransportState) => void>();
  private remoteTrackListeners = new Set<(event: RemoteMediaTrackEvent) => void>();
  private remoteTrackRemovedListeners = new Set<(event: Pick<RemoteMediaTrackEvent, "trackId" | "participantId" | "kind">) => void>();
  private remoteTracks = new Map<string, RemoteTrack>();
  state: MediaTransportState = "idle";

  private setState(next: MediaTransportState) {
    this.state = next;
    this.stateListeners.forEach((listener) => listener(next));
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
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => this.handleRemoteTrack(track, publication, participant));
    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => this.handleRemoteTrackRemoved(track, participant));

    try {
      await room.connect(url, credential, { autoSubscribe: true });
      this.setState("connected");
    } catch (error) {
      this.setState("disconnected");
      throw error;
    }
  }

  private handleRemoteTrack(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) {
    this.remoteTracks.set(track.sid, track);
    const event: RemoteMediaTrackEvent = {
      trackId: track.sid,
      participantId: participant.identity,
      kind: track.kind === Track.Kind.Audio ? "audio" : "video",
      track: track.mediaStreamTrack,
      name: publication.trackName,
    };
    this.remoteTrackListeners.forEach((listener) => listener(event));
  }

  private handleRemoteTrackRemoved(track: RemoteTrack, participant: RemoteParticipant) {
    this.remoteTracks.delete(track.sid);
    const event = {
      trackId: track.sid,
      participantId: participant.identity,
      kind: track.kind === Track.Kind.Audio ? "audio" as const : "video" as const,
    };
    this.remoteTrackRemovedListeners.forEach((listener) => listener(event));
  }

  async disconnect() {
    if (this.room) await this.room.disconnect();
    this.room = null;
    this.remoteTracks.clear();
    this.setState("disconnected");
  }

  async publish(track: MediaStreamTrack, options: PublishTrackOptions) {
    if (!this.room) throw new Error("LiveKit room is not connected");
    const source = options.role === "microphone" || options.role === "talkback"
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
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onRemoteTrack(listener: (event: RemoteMediaTrackEvent) => void) {
    this.remoteTrackListeners.add(listener);
    return () => this.remoteTrackListeners.delete(listener);
  }

  onRemoteTrackRemoved(listener: (event: Pick<RemoteMediaTrackEvent, "trackId" | "participantId" | "kind">) => void) {
    this.remoteTrackRemovedListeners.add(listener);
    return () => this.remoteTrackRemovedListeners.delete(listener);
  }
}
