import { prisma } from "@/lib/prisma";
import { createOpaqueToken, hashToken, verifyToken } from "@/lib/security/tokens";
import type { CreateInviteInput } from "@/lib/validation/rooms";

export async function createInvitation(roomId: string, input: CreateInviteInput) {
  const token = createOpaqueToken();
  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : null;

  const invitation = await prisma.invitation.create({
    data: {
      roomId,
      type: input.type,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { invitation, token };
}

export async function resolveInvitation(publicId: string, token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { publicId },
    include: { room: true },
  });

  if (!invitation || invitation.revokedAt) return null;
  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) return null;
  if (!verifyToken(token, invitation.tokenHash)) return null;

  return invitation;
}

export async function revokeInvitation(id: string) {
  return prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
}
