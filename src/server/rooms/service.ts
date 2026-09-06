import { prisma } from "@/lib/prisma";
import type { CreateRoomInput } from "@/lib/validation/rooms";

export async function listRoomsForOwner(ownerId: string) {
  return prisma.room.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });
}

export async function createRoom(ownerId: string, input: CreateRoomInput) {
  return prisma.room.create({
    data: {
      ownerId,
      name: input.name,
      maxGuests: input.maxGuests,
      waitingRoom: input.waitingRoom,
      auditEvents: {
        create: { actor: ownerId, action: "room.created", target: input.name },
      },
    },
  });
}

export async function getRoomByPublicId(publicId: string) {
  return prisma.room.findUnique({
    where: { publicId },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      invitations: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
}
