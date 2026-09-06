"use client";

import { useEffect, useRef } from "react";
import type { RemoteVideoTrack } from "livekit-client";

export function RemoteVideo({ track }: { track: RemoteVideoTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted={false} />;
}
