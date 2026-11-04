import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    product: { findMany: vi.fn() },
  },
}));

vi.mock("@/server/services/settings", () => ({
  getEffectiveSettings: vi.fn(),
}));

import { db } from "@/server/db";
import { getEffectiveSettings } from "@/server/services/settings";
import { quoteCartLines } from "@/server/services/cart";

const measurementRanges = {
  bust: { min: 30, max: 50 },
  underbust: { min: 25, max: 45 },
  waist: { min: 24, max: 48 },
  hips: { min: 32, max: 55 },
  dressLength: { min: 35, max: 65 },
  heightFeet: { min: 4, max: 7 },
  heightInches: { min: 0, max: 11.99 },
};

const designerProduct = {
  id: "designer-1",
  name: "Designer sample",
  status: "ACTIVE",
  type: "DESIGNER_DRESS",
  basePricePaise: 200000,
  customizationFeePaise: null,
  category: { visible: true, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  variants: [{ id: "variant-xs", size: "XS", sizePremiumPaise: 20000, onHand: 3, reserved: 1 }],
};

const customProduct = {
  id: "custom-1",
  name: "Custom sample",
  status: "ACTIVE",
  type: "CUSTOM_DRESS",
  basePricePaise: 300000,
  customizationFeePaise: 50000,
  category: { visible: true, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  variants: [],
};

const validMeasurements = {
  bust: 36,
  underbust: 32,
  waist: 30,
  hips: 40,
  dressLength: 55,
  heightFeet: 5,
  heightInches: 6,
};

describe("server cart quote validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSettings).mockResolvedValue(new Map([
      ["shipping_fee_paise", { value: { amountPaise: 5000 }, version: 1 }],
      ["shipping_free_threshold_paise", { value: { amountPaise: 1000000 }, version: 1 }],
      ["measurement_ranges", { value: measurementRanges, version: 1 }],
    ]) as never);
    vi.mocked(db.product.findMany).mockResolvedValue([designerProduct, customProduct] as never);
  });

  it("CRT-4 recalculates DD/CD line totals and shipping from server data", async () => {
    const quote = await quoteCartLines([
      { productId: "designer-1", variantId: "variant-xs", quantity: 2 },
      { productId: "custom-1", quantity: 1, measurements: validMeasurements },
    ]);
    expect(quote.lines.map((line) => line.lineTotalPaise)).toEqual([440000, 350000]);
    expect(quote.subtotalPaise).toBe(790000);
    expect(quote.shippingFeePaise).toBe(5000);
    expect(quote.totalPaise).toBe(795000);
  });

  it("flags price changes and unavailable inventory for review", async () => {
    const quote = await quoteCartLines([
      { productId: "custom-1", quantity: 1, measurements: validMeasurements, acceptedUnitPaise: 360000 },
      { productId: "designer-1", variantId: "variant-xs", quantity: 3 },
    ]);
    expect(quote.lines[0].state).toBe("PRICE_CHANGED");
    expect(quote.lines[1].state).toBe("UNAVAILABLE");
    expect(quote.hasBlockingLines).toBe(true);
    expect(quote.needsAcceptance).toBe(true);
  });

  it("quotes designer dresses with free shipping when no settings exist, and blocks custom lines", async () => {
    vi.mocked(getEffectiveSettings).mockResolvedValue(new Map() as never);
    const quote = await quoteCartLines([
      { productId: "designer-1", variantId: "variant-xs", quantity: 1 },
      { productId: "custom-1", quantity: 1, measurements: validMeasurements },
    ]);
    expect(quote.lines.map((line) => line.state)).toEqual(["AVAILABLE", "INVALID"]);
    expect(quote.shippingFeePaise).toBe(0);
    expect(quote.totalPaise).toBe(220000);
  });

  it("invalidates an accepted quote when the free shipping threshold changes", async () => {
    const first = await quoteCartLines([{ productId: "designer-1", variantId: "variant-xs", quantity: 1 }]);
    vi.mocked(getEffectiveSettings).mockResolvedValue(new Map([
      ["shipping_fee_paise", { value: { amountPaise: 5000 }, version: 1 }],
      ["shipping_free_threshold_paise", { value: { amountPaise: 220000 }, version: 2 }],
      ["measurement_ranges", { value: measurementRanges, version: 1 }],
    ]) as never);
    const next = await quoteCartLines([{
      productId: "designer-1", variantId: "variant-xs", quantity: 1,
      acceptedUnitPaise: first.lines[0].unitPricePaise, acceptedQuoteVersion: first.lines[0].quoteVersion,
    }]);
    expect(next.shippingFeePaise).toBe(0);
    expect(next.needsAcceptance).toBe(true);
  });

  it("CRT-7 counts duplicate DD variants together against available stock", async () => {
    const quote = await quoteCartLines([
      { productId: "designer-1", variantId: "variant-xs", quantity: 1 },
      { productId: "designer-1", variantId: "variant-xs", quantity: 2 },
    ]);
    expect(quote.lines.map((line) => line.state)).toEqual(["UNAVAILABLE", "UNAVAILABLE"]);
    expect(quote.hasBlockingLines).toBe(true);
  });

  it("MEA-1 and CRT-2 reject missing measurements and custom quantity above one", async () => {
    const quote = await quoteCartLines([
      { productId: "custom-1", quantity: 2, measurements: validMeasurements },
      { productId: "custom-1", quantity: 1, measurements: { waist: 30 } },
    ]);
    expect(quote.lines.map((line) => line.state)).toEqual(["INVALID", "INVALID"]);
    expect(quote.hasBlockingLines).toBe(true);
  });
});