export type MediaTransportState = "idle" | "connecting" | "connected" | "degraded" | "reconnecting" | "disconnected";

export type MediaTransportConnection = {
  roomId: string;
  password: string;
  label?: string;
};

export type PublishStreamOptions = {
  streamId: string;
  label?: string;
  videoBitrate?: number;
};

export type RemoteMediaTrackEvent = {
  trackId: string;
  streamId: string;
  kind: "audio" | "video";
  track: MediaStreamTrack;
};

export interface MediaTransportProvider {
  readonly state: MediaTransportState;
  connect(connection: MediaTransportConnection): Promise<void>;
  disconnect(): Promise<void>;
  publishStream(stream: MediaStream, options: PublishStreamOptions): Promise<string>;
  stopPublishing(): Promise<void>;
  view(streamId: string): Promise<RTCPeerConnection>;
  stopViewing(streamId: string): Promise<void>;
  onStateChange(listener: (state: MediaTransportState) => void): () => void;
  onRemoteTrack(listener: (event: RemoteMediaTrackEvent) => void): () => void;
  onRemoteTrackRemoved(listener: (event: Omit<RemoteMediaTrackEvent, "track">) => void): () => void;
}

export function mediaStreamId(participantId: string) {
  return `guest_${participantId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}
