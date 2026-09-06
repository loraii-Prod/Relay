export type MediaTransportState = "idle" | "connecting" | "connected" | "degraded" | "reconnecting" | "disconnected";

export type PublishTrackOptions = {
  streamId: string;
  role: "camera" | "microphone" | "screen" | "return" | "talkback";
};

export type RemoteMediaTrackEvent = {
  trackId: string;
  participantId: string;
  kind: "audio" | "video";
  track: MediaStreamTrack;
  name?: string;
};

export interface MediaTransportProvider {
  readonly state: MediaTransportState;
  connect(roomId: string, credential: string): Promise<void>;
  disconnect(): Promise<void>;
  publish(track: MediaStreamTrack, options: PublishTrackOptions): Promise<void>;
  unpublish(trackId: string): Promise<void>;
  subscribe(trackId: string): Promise<MediaStreamTrack>;
  onStateChange(listener: (state: MediaTransportState) => void): () => void;
  onRemoteTrack(listener: (event: RemoteMediaTrackEvent) => void): () => void;
  onRemoteTrackRemoved(listener: (event: Pick<RemoteMediaTrackEvent, "trackId" | "participantId" | "kind">) => void): () => void;
}

export class UnsupportedTransport implements MediaTransportProvider {
  readonly state: MediaTransportState = "idle";
  async connect(): Promise<void> { throw new Error("Media transport backend is not configured"); }
  async disconnect(): Promise<void> {}
  async publish(): Promise<void> { throw new Error("Media transport backend is not configured"); }
  async unpublish(): Promise<void> {}
  async subscribe(): Promise<MediaStreamTrack> { throw new Error("Media transport backend is not configured"); }
  onStateChange(): () => void { return () => {}; }
  onRemoteTrack(): () => void { return () => {}; }
  onRemoteTrackRemoved(): () => void { return () => {}; }
}
