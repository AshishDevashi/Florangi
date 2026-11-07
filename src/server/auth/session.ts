import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { systemClock, type Clock } from "@/server/domain/clock";

const SESSION_COOKIE = "florangi_admin_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(adminUserId: string, clock: Clock = systemClock): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(clock.now().getTime() + SESSION_LIFETIME_MS);

  await db.adminSession.create({
    data: { adminUserId, tokenHash: hashSessionToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentAdmin(clock: Clock = systemClock) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await db.adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!session) return null;
  if (session.expiresAt <= clock.now()) {
    await db.adminSession.deleteMany({ where: { tokenHash } });
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.adminUser;
}

export async function destroyCurrentAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.adminSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}