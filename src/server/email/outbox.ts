import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getEnvironment } from "@/server/env";

export interface QueuedEmail {
  eventKey: string;
  template: string;
  recipient: string;
  payload: Record<string, unknown>;
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(getEnvironment().SESSION_SECRET).digest();
}

function encryptPayload(payload: Record<string, unknown>): Prisma.InputJsonObject {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptEmailPayload(payload: Prisma.JsonValue): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Email payload is not a valid encrypted object.");
  }
  const encrypted = payload as Record<string, unknown>;
  if (
    encrypted.version !== 1 ||
    typeof encrypted.iv !== "string" ||
    typeof encrypted.tag !== "string" ||
    typeof encrypted.ciphertext !== "string"
  ) {
    throw new Error("Email payload has an unsupported encrypted format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const decoded: unknown = JSON.parse(plaintext);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Decrypted email payload is invalid.");
  }
  return decoded as Record<string, unknown>;
}

export async function enqueueEmailJob(
  transaction: Prisma.TransactionClient,
  message: QueuedEmail,
): Promise<void> {
  const recipient = message.recipient.trim().toLowerCase();
  const dedupeKey = `${message.eventKey}:${message.template}:${recipient}`;
  await transaction.emailJob.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      eventKey: message.eventKey,
      template: message.template,
      recipient,
      payload: encryptPayload(message.payload),
    },
    update: {},
  });

  if (getEnvironment().EMAIL_DRIVER === "dev") console.info("email.queued", { template: message.template });
}