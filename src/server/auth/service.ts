import "server-only";

import { z } from "zod";
import { db } from "@/server/db";
import { createAdminSession } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/passwords";

const adminLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export class AuthInputError extends Error {
  constructor() {
    super("Submitted admin credentials are invalid.");
    this.name = "AuthInputError";
  }
}

export async function loginAdmin(input: unknown): Promise<
  | { ok: true; user: { id: string; name: string | null; email: string } }
  | { ok: false }
> {
  const parsed = adminLoginSchema.safeParse(input);
  if (!parsed.success) throw new AuthInputError();
  const email = parsed.data.email.toLowerCase();
  const user = await db.adminUser.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) return { ok: false };

  await createAdminSession(user.id);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
}
