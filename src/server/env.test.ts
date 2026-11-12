import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnvironment } from "@/server/env";

afterEach(() => vi.unstubAllEnvs());

describe("provider configuration", () => {
  it("requires the Razorpay webhook secret but not a duplicate public key", () => {
    vi.stubEnv("PAYMENT_DRIVER", "razorpay");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_id");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "test-secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect(() => getEnvironment()).toThrow("RAZORPAY_WEBHOOK_SECRET");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret");
    expect(getEnvironment().RAZORPAY_KEY_ID).toBe("rzp_test_id");
  });
  it("rejects missing Cloudinary and Resend credentials when enabled", () => {
    vi.stubEnv("STORAGE_DRIVER", "cloudinary");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    vi.stubEnv("EMAIL_DRIVER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(() => getEnvironment()).toThrow("CLOUDINARY_CLOUD_NAME");
    expect(() => getEnvironment()).toThrow("RESEND_API_KEY");
  });
});
