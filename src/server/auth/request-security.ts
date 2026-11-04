import "server-only";

const windows = new Map<string, { count: number; resetAt: number }>();

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim()
      ?? requestUrl.protocol.slice(0, -1);
    return originUrl.host === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export function checkRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (windows.size > 2000) {
    for (const [key, value] of windows) {
      if (value.resetAt <= now) windows.delete(key);
    }
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientAddress = forwardedFor?.split(",", 1)[0]?.trim() || "unknown";
  const key = `${bucket}:${clientAddress}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}