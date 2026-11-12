import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), fetchPayment: vi.fn() }));
vi.mock("razorpay", () => ({
  default: class {
    orders = { create: mocks.create };
    payments = { fetch: mocks.fetchPayment };
  },
}));
vi.mock("@/server/env", () => ({
  getEnvironment: () => ({ PAYMENT_DRIVER: "razorpay", RAZORPAY_KEY_ID: "test-key", RAZORPAY_KEY_SECRET: "test-secret" }),
}));

import { getPaymentProvider } from "@/server/payments/provider";

describe("Razorpay payment provider", () => {
  it("creates an INR order and retrieves the provider's capture details", async () => {
    mocks.create.mockResolvedValue({ id: "order_test", amount: 12500, currency: "INR", receipt: "FLR-test" });
    mocks.fetchPayment.mockResolvedValue({ id: "pay_test", order_id: "order_test", amount: 12500, currency: "INR", status: "captured", captured: true });
    const provider = getPaymentProvider();
    await expect(provider.createOrder({ amount: 12500, currency: "INR", receipt: "FLR-test" })).resolves.toEqual({ id: "order_test", amount: 12500, currency: "INR", receipt: "FLR-test" });
    await expect(provider.fetchPayment("pay_test")).resolves.toEqual({ id: "pay_test", orderId: "order_test", amount: 12500, currency: "INR", status: "captured", captured: true });
  });
});
