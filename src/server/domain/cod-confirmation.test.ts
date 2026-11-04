import { describe, expect, it } from "vitest";
import { createCodConfirmationToken, parseCodConfirmationToken } from "@/server/domain/cod-confirmation";

describe("ORD-14: signed one-time custom COD confirmation tokens", () => {
  it("verifies untampered tokens before expiry", () => {
    const secret = "test-secret-with-sufficient-entropy";
    const token = createCodConfirmationToken("order_123", new Date("2026-01-03T00:00:00.000Z"), secret);
    const parsed = parseCodConfirmationToken(token, secret, new Date("2026-01-02T00:00:00.000Z"));
    expect(parsed?.orderId).toBe("order_123");
    expect(parsed?.tokenHash).toHaveLength(64);
  });

  it("rejects tampered, wrong-secret, and expired tokens", () => {
    const secret = "test-secret-with-sufficient-entropy";
    const token = createCodConfirmationToken("order_123", new Date("2026-01-03T00:00:00.000Z"), secret);
    expect(parseCodConfirmationToken(`${token}x`, secret, new Date("2026-01-02T00:00:00.000Z"))).toBeNull();
    expect(parseCodConfirmationToken(token, "wrong-secret", new Date("2026-01-02T00:00:00.000Z"))).toBeNull();
    expect(parseCodConfirmationToken(token, secret, new Date("2026-01-03T00:00:00.000Z"))).toBeNull();
  });
});