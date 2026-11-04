import "server-only";

import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";

export class AuthenticationError extends Error {
  readonly status = 401;
}

export class AuthorizationError extends Error {
  readonly status = 403;
}

export class ResourceNotFoundError extends Error {
  readonly status = 404;
}

export async function requireCustomer() {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError("Sign in is required.");
  if (user.role !== "CUSTOMER" || (!user.emailVerifiedAt && !user.isGuestSession)) {
    throw new AuthorizationError("A customer session is required.");
  }
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError("Sign in is required.");
  if (user.role !== "ADMIN" || !user.emailVerifiedAt) {
    throw new AuthorizationError("Admin access is required.");
  }
  return user;
}

export async function assertOwnsOrder(orderId: string, customerId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { customerId: true },
  });
  if (!order || order.customerId !== customerId) {
    throw new ResourceNotFoundError("Order not found.");
  }
}