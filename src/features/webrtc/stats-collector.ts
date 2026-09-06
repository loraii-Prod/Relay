export type RelayConnectionStats = {
  timestamp: number;
  rttMs: number | null;
  jitterMs: number | null;
  packetLossPercent: number | null;
  inboundBitrate: number | null;
  outboundBitrate: number | null;
  framesPerSecond: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  codec: string | null;
  nackCount: number | null;
  pliCount: number | null;
  firCount: number | null;
};

export type QualityState = "EXCELLENT" | "GOOD" | "DEGRADED" | "POOR" | "CRITICAL";

export function classifyQuality(stats: RelayConnectionStats): QualityState {
  const loss = stats.packetLossPercent ?? 0;
  const rtt = stats.rttMs ?? 0;
  const jitter = stats.jitterMs ?? 0;
  if (loss >= 10 || rtt >= 500 || jitter >= 100) return "CRITICAL";
  if (loss >= 5 || rtt >= 300 || jitter >= 60) return "POOR";
  if (loss >= 2 || rtt >= 180 || jitter >= 30) return "DEGRADED";
  if (loss >= 0.5 || rtt >= 100 || jitter >= 15) return "GOOD";
  return "EXCELLENT";
}

export class StatsCollector {
  private previous = new Map<string, { bytes: number; timestamp: number }>();

  async collect(peer: RTCPeerConnection): Promise<RelayConnectionStats> {
    const reports = await peer.getStats();
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let packetLossPercent: number | null = null;
    let inboundBitrate: number | null = null;
    let outboundBitrate: number | null = null;
    let framesPerSecond: number | null = null;
    let frameWidth: number | null = null;
    let frameHeight: number | null = null;
    let codec: string | null = null;
    let nackCount: number | null = null;
    let pliCount: number | null = null;
    let firCount: number | null = null;
    const codecs = new Map<string, string>();

    reports.forEach((report) => {
      if (report.type === "codec") codecs.set(report.id, report.mimeType ?? report.codec ?? "unknown");
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        if (typeof report.currentRoundTripTime === "number") rttMs = report.currentRoundTripTime * 1000;
      }
      if ((report.type === "inbound-rtp" || report.type === "outbound-rtp") && !report.isRemote) {
        if (typeof report.jitter === "number") jitterMs = report.jitter * 1000;
        if (typeof report.framesPerSecond === "number") framesPerSecond = report.framesPerSecond;
        if (typeof report.frameWidth === "number") frameWidth = report.frameWidth;
        if (typeof report.frameHeight === "number") frameHeight = report.frameHeight;
        if (report.codecId && codecs.has(report.codecId)) codec = codecs.get(report.codecId) ?? null;
        if (typeof report.nackCount === "number") nackCount = report.nackCount;
        if (typeof report.pliCount === "number") pliCount = report.pliCount;
        if (typeof report.firCount === "number") firCount = report.firCount;

        const packetsLost = typeof report.packetsLost === "number" ? report.packetsLost : 0;
        const packetsReceived = typeof report.packetsReceived === "number" ? report.packetsReceived : 0;
        const totalPackets = packetsLost + packetsReceived;
        if (totalPackets > 0) packetLossPercent = (packetsLost / totalPackets) * 100;

        const bytesField = report.type === "inbound-rtp" ? "bytesReceived" : "bytesSent";
        const bytes = typeof report[bytesField] === "number" ? report[bytesField] : null;
        if (bytes !== null) {
          const previous = this.previous.get(report.id);
          if (previous && report.timestamp > previous.timestamp) {
            const bps = ((bytes - previous.bytes) * 8 * 1000) / (report.timestamp - previous.timestamp);
            if (report.type === "inbound-rtp") inboundBitrate = Math.max(0, bps);
            else outboundBitrate = Math.max(0, bps);
          }
          this.previous.set(report.id, { bytes, timestamp: report.timestamp });
        }
      }
    });

    return { timestamp: Date.now(), rttMs, jitterMs, packetLossPercent, inboundBitrate, outboundBitrate, framesPerSecond, frameWidth, frameHeight, codec, nackCount, pliCount, firCount };
  }
}
