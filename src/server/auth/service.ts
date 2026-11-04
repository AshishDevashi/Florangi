import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";
import { systemClock } from "@/server/domain/clock";
import { enqueueEmailJob } from "@/server/email/outbox";
import { createSession, destroyCurrentSession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/tokens";

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const resetRequestSchema = z.object({ email: z.string().trim().email().max(254) });
const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(128),
});

export class AuthInputError extends Error {
  constructor() {
    super("Submitted authentication data is invalid.");
    this.name = "AuthInputError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AuthInputError();
  return parsed.data;
}

export async function registerCustomer(input: unknown): Promise<void> {
  const parsed = parseInput(registrationSchema, input);
  const email = parsed.email.toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return;

  const token = createOpaqueToken();
  const now = systemClock.now();
  const passwordHash = await hashPassword(parsed.password);
  const environment = getEnvironment();

  await db.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        name: parsed.name,
        email,
        phone: parsed.phone,
        passwordHash,
        role: "CUSTOMER",
      },
    });
    await transaction.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      },
    });
    await enqueueEmailJob(transaction, {
      eventKey: `account-verification:${user.id}`,
      template: "account-verification",
      recipient: email,
      payload: {
        subject: "Verify your Florangi account",
        text: "Use this one-time link to verify your email address.",
        url: `${environment.APP_URL}/verify-email#token=${encodeURIComponent(token)}`,
      },
    });
  });
}

export async function verifyCustomerEmail(token: string): Promise<boolean> {
  const tokenHash = hashOpaqueToken(token);
  const now = systemClock.now();
  const record = await db.verificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= now) return false;

  return db.$transaction(async (transaction) => {
    const claimed = await transaction.verificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await transaction.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now },
    });
    return true;
  });
}

export async function loginCustomer(input: unknown): Promise<
  | { ok: true; user: { id: string; name: string | null; email: string } }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "EMAIL_UNVERIFIED" }
> {
  const parsed = parseInput(loginSchema, input);
  const email = parsed.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, parsed.password))) {
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }
  if (!user.emailVerifiedAt) return { ok: false, reason: "EMAIL_UNVERIFIED" };

  await createSession(user.id);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

export async function loginAdmin(input: unknown): Promise<
  | { ok: true; user: { id: string; name: string | null; email: string } }
  | { ok: false }
> {
  const parsed = parseInput(loginSchema, input);
  const email = parsed.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (
    !user ||
    user.role !== "ADMIN" ||
    !user.emailVerifiedAt ||
    !(await verifyPassword(user.passwordHash, parsed.password))
  ) {
    return { ok: false };
  }
  await createSession(user.id);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}

export async function requestPasswordReset(input: unknown): Promise<void> {
  const { email: submittedEmail } = parseInput(resetRequestSchema, input);
  const email = submittedEmail.toLowerCase();
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const token = createOpaqueToken();
  const now = systemClock.now();
  const environment = getEnvironment();
  await db.$transaction(async (transaction) => {
    await transaction.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    });
    await enqueueEmailJob(transaction, {
      eventKey: `password-reset:${user.id}:${now.getTime()}`,
      template: "password-reset",
      recipient: user.email,
      payload: {
        subject: "Reset your Florangi password",
        text: "Use this one-time link to reset your password.",
        url: `${environment.APP_URL}/reset-password#token=${encodeURIComponent(token)}`,
      },
    });
  });
}

export async function completePasswordReset(input: unknown): Promise<boolean> {
  const parsed = parseInput(resetPasswordSchema, input);
  const tokenHash = hashOpaqueToken(parsed.token);
  const now = systemClock.now();
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= now) return false;

  const passwordHash = await hashPassword(parsed.password);
  return db.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await transaction.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await transaction.session.deleteMany({ where: { userId: record.userId } });
    return true;
  }).then(async (completed) => {
    if (completed) await destroyCurrentSession();
    return completed;
  });
}