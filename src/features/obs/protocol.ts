import { z } from "zod";

export const relayProtocolVersion = 1 as const;

const baseMessage = z.object({
  protocolVersion: z.literal(relayProtocolVersion),
  requestId: z.string().min(1),
});

export const connectorMessageSchema = z.discriminatedUnion("type", [
  baseMessage.extend({ type: z.literal("hello"), payload: z.object({ connectorVersion: z.string(), obsVersion: z.string().optional() }) }),
  baseMessage.extend({ type: z.literal("obs.status"), payload: z.object({}) }),
  baseMessage.extend({ type: z.literal("guest.create"), payload: z.object({ participantId: z.string(), displayName: z.string(), videoUrl: z.string().url().optional(), audioUrl: z.string().url().optional() }) }),
  baseMessage.extend({ type: z.literal("guest.remove"), payload: z.object({ participantId: z.string() }) }),
  baseMessage.extend({ type: z.literal("return.start"), payload: z.object({ feedId: z.string(), label: z.string() }) }),
  baseMessage.extend({ type: z.literal("drawing.update"), payload: z.object({ sourceUrl: z.string().url() }) }),
  baseMessage.extend({ type: z.literal("media.control"), payload: z.object({ sourceId: z.string(), command: z.enum(["play", "pause", "restart"]) }) }),
  baseMessage.extend({ type: z.literal("diagnostics"), payload: z.object({}) }),
]);

export type ConnectorMessage = z.infer<typeof connectorMessageSchema>;

export type OBSStatus = {
  connected: boolean;
  obsVersion?: string;
  connectorVersion?: string;
  sceneCollection?: string;
  baseWidth?: number;
  baseHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  fps?: number;
  streaming?: boolean;
  recording?: boolean;
  currentScene?: string;
  previewScene?: string;
  studioMode?: boolean;
  cpuUsage?: number;
  droppedFrames?: number;
};

export const MANAGED_SOURCE_PREFIX = "Relay — ";
