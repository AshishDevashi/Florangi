import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getCurrentAdmin } from "@/server/auth/session";
import { hasGuestOrderAccess } from "@/server/guest-order-access";
import { verifyPrivateFileSignature } from "@/server/storage/local";
import { getStorageProvider } from "@/server/storage";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const provider = url.searchParams.get("provider") ?? "local";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("sig") ?? "";
  if (!key || (provider !== "local" && provider !== "cloudinary") || !verifyPrivateFileSignature(key, expires, signature, undefined, provider)) {
    return new Response(null, { status: 404 });
  }

  const photo = await db.replacementPhoto.findFirst({
    where: { provider, key },
    include: { request: { select: { orderId: true } } },
  });
  if (!photo) return new Response(null, { status: 404 });

  const [admin, hasOrderAccess] = await Promise.all([
    getCurrentAdmin(),
    hasGuestOrderAccess(photo.request.orderId),
  ]);
  if (!admin && !hasOrderAccess) {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await getStorageProvider(photo.provider).readPrivate(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}