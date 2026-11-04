import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPaymentSignature, verifyPaymentSignature, verifyPaymentWebhookSignature } from "@/server/payments/service";

describe("PGW-2 and PGW-6 payment signatures", () => {
  it("verifies a signature over the provider order and payment identifiers", () => {
    const signature = createPaymentSignature("mock_order_123", "mock_payment_456");
    expect(verifyPaymentSignature("mock_order_123", "mock_payment_456", signature)).toBe(true);
    expect(verifyPaymentSignature("mock_order_123", "mock_payment_other", signature)).toBe(false);
    expect(verifyPaymentSignature("mock_order_other", "mock_payment_456", signature)).toBe(false);
  });

  it("verifies webhook HMAC over the exact raw request body", () => {
    const rawBody = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test"}}}}';
    const secret = createHash("sha256")
      .update(`${process.env.SESSION_SECRET}:florangi-mock-payment`)
      .digest();
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(verifyPaymentWebhookSignature(rawBody, signature)).toBe(true);
    expect(verifyPaymentWebhookSignature(`${rawBody} `, signature)).toBe(false);
  });
});