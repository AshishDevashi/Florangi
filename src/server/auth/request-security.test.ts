import { describe, expect, it } from "vitest";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";

describe("browser request protections", () => {
  it("accepts only a same-origin mutation", () => {
    expect(isSameOriginMutation(new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }))).toBe(true);
    expect(isSameOriginMutation(new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }))).toBe(false);
    expect(isSameOriginMutation(new Request("http://localhost:3000/api", { method: "POST" }))).toBe(false);
  });

  it("supports a local host alias when the browser Origin matches the public Host", () => {
    expect(isSameOriginMutation(new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
    }))).toBe(true);
    expect(isSameOriginMutation(new Request("http://localhost:3000/api", {
      method: "POST",
      headers: { origin: "http://attacker.example", host: "127.0.0.1:3000" },
    }))).toBe(false);
  });

  it("limits attempts per bucket and client address", () => {
    const request = () => new Request("http://localhost:3000/api", {
      headers: { "x-forwarded-for": "192.0.2.145" },
    });
    const bucket = `test-${crypto.randomUUID()}`;
    expect(checkRateLimit(request(), bucket, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(request(), bucket, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(request(), bucket, 2, 60_000).allowed).toBe(false);
  });
});