import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  maxGuests: z.number().int().min(1).max(24).default(8),
  waitingRoom: z.boolean().default(true),
});

export const createInviteSchema = z.object({
  type: z.enum(["VIDEO_AUDIO", "AUDIO_ONLY", "OBS_FEED", "SCREEN_SHARE", "OPERATOR", "TELESTRATOR", "VIEWER"]).default("VIDEO_AUDIO"),
  expiresInMinutes: z.number().int().min(5).max(60 * 24 * 30).optional(),
});

export const joinGuestSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  roleLabel: z.string().trim().max(40).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type JoinGuestInput = z.infer<typeof joinGuestSchema>;
