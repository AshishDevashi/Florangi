import { describe, expect, it } from "vitest";
import { calculateShippingFeePaise, calculateSubtotalPaise, calculateTotalPaise } from "@/server/domain/pricing";

describe("AT-02: exact paise pricing", () => {
  it("prices DD and CD lines and adds shipping once", () => {
    const subtotal = calculateSubtotalPaise([
      { type: "DESIGNER_DRESS", basePricePaise: 200000, sizePremiumPaise: 20000, quantity: 2 },
      { type: "CUSTOM_DRESS", basePricePaise: 300000, customizationFeePaise: 50000, quantity: 1 },
    ]);
    expect(subtotal).toBe(790000);
    expect(calculateTotalPaise(subtotal, { shippingFeePaise: 5000, shippingFreeThresholdPaise: 1000000 })).toEqual({
      subtotalPaise: 790000,
      shippingFeePaise: 5000,
      codSurchargePaise: 0,
      totalPaise: 795000,
    });
  });
});

describe("AT-03: payment-independent shipping threshold pricing", () => {
  const settings = { shippingFeePaise: 30000, shippingFreeThresholdPaise: 500000 };

  it("charges below threshold but not at or above it", () => {
    expect(calculateShippingFeePaise(499999, settings)).toBe(30000);
    expect(calculateShippingFeePaise(500000, settings)).toBe(0);
    expect(calculateShippingFeePaise(500001, settings)).toBe(0);
    for (const method of ["ONLINE", "COD"] as const) {
      expect(calculateTotalPaise(499999, settings, method)).toMatchObject({ shippingFeePaise: 30000, codSurchargePaise: 0, totalPaise: 529999 });
      expect(calculateTotalPaise(500000, settings, method)).toMatchObject({ shippingFeePaise: 0, codSurchargePaise: 0, totalPaise: 500000 });
    }
  });

  it("rejects invalid fees and thresholds", () => {
    expect(() => calculateShippingFeePaise(1, { ...settings, shippingFreeThresholdPaise: -1 })).toThrow();
    expect(() => calculateShippingFeePaise(1, { ...settings, shippingFeePaise: 1.5 })).toThrow();
  });
});