import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type ParsedCodConfirmationToken = {
  orderId: string;
  expiresAt: Date;
  tokenHash: string;
};

export function createCodConfirmationToken(orderId: string, expiresAt: Date, secret: string): string {
  const expiresSeconds = Math.floor(expiresAt.getTime() / 1000);
  const nonce = randomBytes(32).toString("base64url");
  const payload = `${orderId}.${expiresSeconds}.${nonce}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function parseCodConfirmationToken(
  token: string,
  secret: string,
  now: Date,
): ParsedCodConfirmationToken | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [orderId, expiresRaw, nonce, signature] = parts;
  const expiresSeconds = Number(expiresRaw);
  if (!orderId || !nonce || !Number.isSafeInteger(expiresSeconds) || expiresSeconds <= Math.floor(now.getTime() / 1000)) return null;
  const payload = `${orderId}.${expiresRaw}.${nonce}`;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return {
    orderId,
    expiresAt: new Date(expiresSeconds * 1000),
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}