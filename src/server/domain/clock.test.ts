import { describe, expect, it } from "vitest";
import { createManualClock, formatIndiaDateTime } from "@/server/domain/clock";

describe("injectable clock", () => {
  it("returns defensive Date copies and advances deterministically", () => {
    const clock = createManualClock(new Date("2026-01-01T00:00:00.000Z"));
    const first = clock.now();
    first.setFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("labels displayed timestamps in India time", () => {
    expect(formatIndiaDateTime(new Date("2026-01-01T00:00:00.000Z"))).toContain("IST");
  });
});