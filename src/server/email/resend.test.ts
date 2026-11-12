import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/server/env", () => ({
  getEnvironment: () => ({ EMAIL_DRIVER: "resend", RESEND_API_KEY: "test-key", EMAIL_FROM: "sender@example.test", EMAIL_REPLY_TO: "reply@example.test" }),
}));

import { getEmailProvider } from "@/server/email/provider";

describe("Resend email delivery", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends the rendered email with configured sender and reply-to", async () => {
    send.mockResolvedValue({ data: { id: "email-test" }, error: null });
    await getEmailProvider().send({ to: "customer@example.test", email: { subject: "Order", text: "Text", html: "<p>Text</p>" } });
    expect(send).toHaveBeenCalledWith({ from: "sender@example.test", replyTo: "reply@example.test", to: "customer@example.test", subject: "Order", text: "Text", html: "<p>Text</p>" });
  });
  it("propagates provider errors for outbox retry", async () => {
    send.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    await expect(getEmailProvider().send({ to: "customer@example.test", email: { subject: "Order", text: "Text", html: "<p>Text</p>" } })).rejects.toThrow("Resend send failed");
  });
});
