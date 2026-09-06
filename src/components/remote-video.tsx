"use client";

import { useEffect, useRef } from "react";

export function RemoteVideo({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const stream = new MediaStream([track]);
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => {
      element.srcObject = null;
    };
  }, [track]);

  return <video ref={ref} autoPlay playsInline muted />;
}
