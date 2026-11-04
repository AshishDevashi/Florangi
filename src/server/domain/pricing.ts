export type PricedLine = {
  type: "DESIGNER_DRESS" | "CUSTOM_DRESS";
  basePricePaise: number;
  sizePremiumPaise?: number | null;
  customizationFeePaise?: number | null;
  quantity: number;
};

export type PaymentPricingSettings = {
  shippingFeePaise: number;
  shippingFreeThresholdPaise: number;
};

function assertMoney(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of paise.`);
  }
}

export function priceUnit(line: Omit<PricedLine, "quantity">): number {
  assertMoney(line.basePricePaise, "Base price");
  const adjustment = line.type === "DESIGNER_DRESS"
    ? line.sizePremiumPaise ?? 0
    : line.customizationFeePaise;
  if (adjustment === undefined || adjustment === null) {
    throw new RangeError("The product price is incomplete.");
  }
  assertMoney(adjustment, line.type === "DESIGNER_DRESS" ? "Size premium" : "Customization fee");
  const unitPrice = line.basePricePaise + adjustment;
  if (!Number.isSafeInteger(unitPrice)) throw new RangeError("Product price exceeds the supported range.");
  return unitPrice;
}

export function calculateSubtotalPaise(lines: PricedLine[]): number {
  const subtotal = lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new RangeError("Quantity must be a positive whole number.");
    }
    const lineTotal = priceUnit(line) * line.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(sum + lineTotal)) {
      throw new RangeError("Cart subtotal exceeds the supported range.");
    }
    return sum + lineTotal;
  }, 0);
  return subtotal;
}

export function calculateShippingFeePaise(
  subtotalPaise: number,
  settings: PaymentPricingSettings,
): number {
  assertMoney(subtotalPaise, "Subtotal");
  assertMoney(settings.shippingFeePaise, "Shipping fee");
  assertMoney(settings.shippingFreeThresholdPaise, "Free shipping threshold");
  return subtotalPaise < settings.shippingFreeThresholdPaise
    ? settings.shippingFeePaise
    : 0;
}

export function calculateTotalPaise(
  subtotalPaise: number,
  settings: PaymentPricingSettings,
  paymentMethod?: "ONLINE" | "COD",
): { subtotalPaise: number; shippingFeePaise: number; codSurchargePaise: number; totalPaise: number } {
  assertMoney(subtotalPaise, "Subtotal");
  if (paymentMethod !== undefined && paymentMethod !== "ONLINE" && paymentMethod !== "COD") {
    throw new RangeError("Choose a supported payment method.");
  }
  const shippingFeePaise = calculateShippingFeePaise(subtotalPaise, settings);
  const totalPaise = subtotalPaise + shippingFeePaise;
  if (!Number.isSafeInteger(totalPaise)) throw new RangeError("Order total exceeds the supported range.");
  return {
    subtotalPaise,
    shippingFeePaise,
    codSurchargePaise: 0,
    totalPaise,
  };
}