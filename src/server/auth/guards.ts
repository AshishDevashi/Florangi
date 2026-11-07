import "server-only";

import { getCurrentAdmin } from "@/server/auth/session";

export class AuthenticationError extends Error {
  readonly status = 401;
}

export class AuthorizationError extends Error {
  readonly status = 403;
}

export class ResourceNotFoundError extends Error {
  readonly status = 404;
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthenticationError("Admin sign in is required.");
  return admin;
}