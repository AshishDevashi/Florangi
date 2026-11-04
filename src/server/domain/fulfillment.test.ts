import { describe, expect, it } from "vitest";
import { areAllOrderLinesReady, assertCanStartProduction, assertOrderLinesReadyForShipment } from "@/server/domain/fulfillment";

const placedAt = new Date("2026-01-01T00:00:00.000Z");
const afterFreeze = new Date("2026-01-01T12:00:00.000Z");

describe("AT-09: custom production gates", () => {
  const context = {
    fulfillmentStatus: "APPROVED" as const,
    containsCustomDress: true,
    paymentMethod: "COD" as const,
    createdAt: placedAt,
    now: afterFreeze,
    customerConfirmed: true,
  };

  it("blocks before approval or before the 12-hour freeze expires", () => {
    expect(() => assertCanStartProduction({ ...context, fulfillmentStatus: "PENDING_APPROVAL" })).toThrow(RangeError);
    expect(() => assertCanStartProduction({ ...context, now: new Date(afterFreeze.getTime() - 1) })).toThrow(RangeError);
  });

  it("requires COD confirmation and a custom line", () => {
    expect(() => assertCanStartProduction({ ...context, customerConfirmed: false })).toThrow(RangeError);
    expect(() => assertCanStartProduction({ ...context, containsCustomDress: false })).toThrow(RangeError);
  });

  it("allows production after approval, 12 hours, and customer confirmation", () => {
    expect(() => assertCanStartProduction(context)).not.toThrow();
  });
});

describe("AT-10: mixed-order readiness", () => {
  it("keeps mixed orders unready until every line is ready", () => {
    const mixedLines = [{ isReady: true }, { isReady: false }];
    expect(areAllOrderLinesReady(mixedLines)).toBe(false);
    expect(() => assertOrderLinesReadyForShipment(mixedLines)).toThrow(RangeError);
    expect(areAllOrderLinesReady([{ isReady: true }, { isReady: true }])).toBe(true);
    expect(() => assertOrderLinesReadyForShipment([{ isReady: true }, { isReady: true }])).not.toThrow();
  });
});