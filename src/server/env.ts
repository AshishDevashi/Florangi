import "server-only";

import { z } from "zod";

const senderSchema = z.string().trim().max(254).refine((value) => {
  const displayName = /^([^<>]+) <([^<>]+)>$/.exec(value);
  const address = displayName?.[2] ?? value;
  return z.email().safeParse(address).success;
}, "Use an email address, optionally with a display name.");
const optionalEmailSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.email().optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    STORAGE_DRIVER: z.enum(["local", "cloudinary"]).default("local"),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    EMAIL_DRIVER: z.enum(["dev", "resend", "brevo"]).default("dev"),
    EMAIL_FROM: senderSchema.default("hello@example.test"),
    EMAIL_REPLY_TO: z.string().email().default("support@example.test"),
    EMAIL_DAILY_QUOTA: z.coerce.number().int().positive().default(300),
    RESEND_API_KEY: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    ADMIN_ALERT_EMAIL: optionalEmailSchema,
    PAYMENT_DRIVER: z.enum(["razorpay", "mock"]).default("mock"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.PAYMENT_DRIVER === "mock") {
      context.addIssue({ code: "custom", path: ["PAYMENT_DRIVER"], message: "Mock payments are forbidden in production." });
    }
    if (env.NODE_ENV === "production" && env.EMAIL_DRIVER === "dev") {
      context.addIssue({ code: "custom", path: ["EMAIL_DRIVER"], message: "The development email driver is forbidden in production." });
    }
    if (env.PAYMENT_DRIVER === "razorpay") {
      for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const) {
        if (!env[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required for Razorpay.` });
      }
    }
    if (env.STORAGE_DRIVER === "cloudinary") {
      for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
        if (!env[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required for Cloudinary.` });
      }
    }
    if (env.EMAIL_DRIVER === "resend" && !env.RESEND_API_KEY) {
      context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required for Resend." });
    }
    if (env.EMAIL_DRIVER === "brevo" && !env.BREVO_API_KEY) {
      context.addIssue({ code: "custom", path: ["BREVO_API_KEY"], message: "BREVO_API_KEY is required for Brevo." });
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function getEnvironment(): AppEnvironment {
  return environmentSchema.parse(process.env);
}