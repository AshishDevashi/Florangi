import "server-only";

import { Resend } from "resend";
import { getEnvironment } from "@/server/env";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export interface EmailProvider {
  send(input: { to: string; email: RenderedEmail }): Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmailPayload(payload: Record<string, unknown>): RenderedEmail {
  const subject = typeof payload.subject === "string" ? payload.subject : "Florangi order update";
  const text = typeof payload.text === "string" ? payload.text : "You have a new update from Florangi.";
  const url = typeof payload.url === "string" && /^https?:\/\//i.test(payload.url) ? payload.url : null;
  const measurements = Array.isArray(payload.measurements) ? JSON.stringify(payload.measurements, null, 2) : null;
  const html = [
    `<main style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1d2722">`,
    `<h1 style="font-size:24px">${escapeHtml(subject)}</h1>`,
    `<p style="white-space:pre-line;line-height:1.6">${escapeHtml(text)}</p>`,
    ...(measurements ? [`<pre style="white-space:pre-wrap;background:#f6f7f3;padding:16px">${escapeHtml(measurements)}</pre>`] : []),
    ...(url ? [`<p><a href="${escapeHtml(url)}" style="color:#245c46">Continue securely</a></p>`] : []),
    `<p style="font-size:12px;color:#68736c">Florangi · India</p>`,
    `</main>`,
  ].join("");
  return { subject, text: `${text}${measurements ? `\n\n${measurements}` : ""}${url ? `\n\n${url}` : ""}`, html };
}

class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly from: string;
  private readonly replyTo: string;

  constructor(apiKey: string, from: string, replyTo: string) {
    this.client = new Resend(apiKey);
    this.from = from;
    this.replyTo = replyTo;
  }

  async send(input: { to: string; email: RenderedEmail }): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      replyTo: this.replyTo,
      to: input.to,
      subject: input.email.subject,
      text: input.email.text,
      html: input.email.html,
    });
    if (result.error) throw new Error(`Resend send failed: ${result.error.name}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const environment = getEnvironment();
  if (environment.EMAIL_DRIVER === "resend") {
    return new ResendEmailProvider(environment.RESEND_API_KEY!, environment.EMAIL_FROM, environment.EMAIL_REPLY_TO);
  }
  if (environment.EMAIL_DRIVER === "brevo") {
    throw new Error("Brevo driver is scaffolded but not implemented.");
  }
  throw new Error("Development email driver does not send externally.");
}