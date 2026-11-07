import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getEnvironment } from "@/server/env";
import { ResourceNotFoundError } from "@/server/auth/guards";

const ORDER_ACCESS_COOKIE_PREFIX = "florangi_order_";
const ORDER_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieName(orderId: string): string {
  return `${ORDER_ACCESS_COOKIE_PREFIX}${orderId}`;
}

export async function issueGuestOrderAccessToken(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await transaction.orderAccessToken.create({
    data: { orderId, tokenHash: hashAccessToken(token) },
  });
  return token;
}

export async function hasGuestOrderAccess(orderId: string): Promise<boolean> {
  const token = (await cookies()).get(cookieName(orderId))?.value;
  if (!token) return false;
  return Boolean(await db.orderAccessToken.findFirst({
    where: { orderId, tokenHash: hashAccessToken(token), revokedAt: null },
    select: { id: true },
  }));
}

export async function requireGuestOrderAccess(orderId: string): Promise<void> {
  if (!await hasGuestOrderAccess(orderId)) throw new ResourceNotFoundError("Order not found.");
}

export function attachGuestOrderAccessCookie(response: NextResponse, orderId: string, token: string): void {
  response.cookies.set(cookieName(orderId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ORDER_ACCESS_COOKIE_MAX_AGE,
  });
}

export async function validateGuestOrderAccessToken(orderId: string, token: string): Promise<boolean> {
  return Boolean(await db.orderAccessToken.findFirst({
    where: { orderId, tokenHash: hashAccessToken(token), revokedAt: null },
    select: { id: true },
  }));
}

export function guestOrderAccessUrl(orderId: string, token: string): string {
  const baseUrl = getEnvironment().APP_URL.replace(/\/+$/, "");
  return `${baseUrl}/orders/${encodeURIComponent(orderId)}#access=${encodeURIComponent(token)}`;
}
