import { describe, expect, it } from "vitest";
import { isReplacementWindowOpen } from "@/server/domain/replacement-window";

describe("AT-11: exact replacement deadline", () => {
  const deliveredAt = new Date("2026-01-01T00:00:00.000Z");

  it("allows 95h59m and rejects exactly 96 hours", () => {
    expect(isReplacementWindowOpen(deliveredAt, new Date(deliveredAt.getTime() + (95 * 60 + 59) * 60_000), 96)).toBe(true);
    expect(isReplacementWindowOpen(deliveredAt, new Date(deliveredAt.getTime() + 96 * 60 * 60_000), 96)).toBe(false);
  });
});