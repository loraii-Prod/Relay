import { createHash } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function getVdoRoomCredentials(roomInternalId: string) {
  // The internal UUID is never placed in guest URLs. Hashing it creates stable,
  // non-enumerable media identifiers without requiring a third-party secret.
  const roomDigest = digest(`relay:vdo:room:${roomInternalId}`);
  const passwordDigest = digest(`relay:vdo:password:${roomInternalId}`);
  return {
    roomId: `relay_${roomDigest.slice(0, 32)}`,
    password: passwordDigest,
    provider: "vdo.ninja" as const,
  };
}
