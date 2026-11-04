import { describe, expect, it } from "vitest";
import { formatPaise, parseRupeesToPaise } from "@/server/domain/money";

describe("integer-paise money helpers", () => {
  it("parses rupee strings without floating point arithmetic", () => {
    expect(parseRupeesToPaise("2000")).toBe(200000);
    expect(parseRupeesToPaise("4999.99")).toBe(499999);
    expect(parseRupeesToPaise("0.5")).toBe(50);
  });

  it("rejects negative values and precision beyond paise", () => {
    expect(() => parseRupeesToPaise("-1")).toThrow(RangeError);
    expect(() => parseRupeesToPaise("1.001")).toThrow(RangeError);
    expect(() => parseRupeesToPaise("1e3")).toThrow(RangeError);
  });

  it("formats INR amounts and rejects invalid stored values", () => {
    expect(formatPaise(500000)).toContain("5,000.00");
    expect(() => formatPaise(-1)).toThrow(RangeError);
    expect(() => formatPaise(1.5)).toThrow(RangeError);
  });
});