import { describe, expect, it } from "vitest";
import { assertFulfillmentTransition, InvalidOrderTransitionError } from "@/server/domain/order-state";

describe("LIF-2/3 and ORD-11: fulfillment transitions", () => {
  it("allows verified payment to move online orders to approval", () => {
    expect(() => assertFulfillmentTransition("PENDING_PAYMENT", "PENDING_APPROVAL", "SYSTEM")).not.toThrow();
  });

  it("requires admin approval and prevents skipped or backward steps", () => {
    expect(() => assertFulfillmentTransition("PENDING_APPROVAL", "APPROVED", "ADMIN")).not.toThrow();
    expect(() => assertFulfillmentTransition("PENDING_APPROVAL", "SHIPPED", "ADMIN")).toThrow(InvalidOrderTransitionError);
    expect(() => assertFulfillmentTransition("SHIPPED", "APPROVED", "ADMIN")).toThrow(InvalidOrderTransitionError);
    expect(() => assertFulfillmentTransition("DELIVERED", "CANCELLED", "ADMIN")).toThrow(InvalidOrderTransitionError);
  });

  it("allows customers to cancel only while payment is pending", () => {
    expect(() => assertFulfillmentTransition("PENDING_PAYMENT", "CANCELLED", "CUSTOMER")).not.toThrow();
    expect(() => assertFulfillmentTransition("PENDING_APPROVAL", "CANCELLED", "CUSTOMER")).toThrow(InvalidOrderTransitionError);
  });
});