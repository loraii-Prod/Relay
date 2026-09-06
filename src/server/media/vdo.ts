import { createHmac } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

export function isMediaSecretConfigured() {
  return Boolean(process.env.RELAY_MEDIA_SECRET && process.env.RELAY_MEDIA_SECRET.length >= MIN_SECRET_LENGTH);
}

function requireMediaSecret() {
  const secret = process.env.RELAY_MEDIA_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("media_secret_not_configured");
  }
  return secret;
}

function digest(secret: string, value: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function getVdoRoomCredentials(roomInternalId: string) {
  const secret = requireMediaSecret();
  const roomDigest = digest(secret, `relay:vdo:room:${roomInternalId}`);
  const passwordDigest = digest(secret, `relay:vdo:password:${roomInternalId}`);

  return {
    roomId: `relay_${roomDigest.slice(0, 32)}`,
    password: passwordDigest,
    provider: "vdo.ninja" as const,
  };
}
