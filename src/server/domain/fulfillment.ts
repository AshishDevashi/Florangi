import type { FulfillmentState } from "@/server/domain/order-state";

export function assertCanStartProduction(input: {
  fulfillmentStatus: FulfillmentState;
  containsCustomDress: boolean;
  paymentMethod: "ONLINE" | "COD";
  createdAt: Date;
  now: Date;
  customerConfirmed: boolean;
}): void {
  if (input.fulfillmentStatus !== "APPROVED") throw new RangeError("Production can start only after order approval.");
  if (!input.containsCustomDress) throw new RangeError("Only orders containing custom dresses enter production.");
  if (input.now.getTime() < input.createdAt.getTime() + 12 * 60 * 60 * 1000) {
    throw new RangeError("The 12-hour customer measurement check period has not ended.");
  }
  if (input.paymentMethod === "COD" && !input.customerConfirmed) {
    throw new RangeError("Record customer confirmation before starting COD custom production.");
  }
}

export function areAllOrderLinesReady(lines: Array<{ isReady: boolean }>): boolean {
  return lines.length > 0 && lines.every((line) => line.isReady);
}

export function assertOrderLinesReadyForShipment(lines: Array<{ isReady: boolean }>): void {
  if (!areAllOrderLinesReady(lines)) throw new RangeError("Every order line must be ready before shipment.");
}