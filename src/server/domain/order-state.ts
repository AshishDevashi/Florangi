export type FulfillmentState =
  | "PENDING_PAYMENT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IN_PRODUCTION"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED";

export type OrderActor = "SYSTEM" | "ADMIN" | "CUSTOMER";

const transitions: Record<FulfillmentState, Partial<Record<FulfillmentState, OrderActor[]>>> = {
  PENDING_PAYMENT: {
    PENDING_APPROVAL: ["SYSTEM"],
    CANCELLED: ["SYSTEM", "ADMIN", "CUSTOMER"],
  },
  PENDING_APPROVAL: {
    APPROVED: ["ADMIN"],
    REJECTED: ["ADMIN"],
    CANCELLED: ["ADMIN"],
  },
  APPROVED: {
    IN_PRODUCTION: ["ADMIN"],
    READY_TO_SHIP: ["ADMIN"],
    CANCELLED: ["ADMIN"],
  },
  IN_PRODUCTION: {
    READY_TO_SHIP: ["ADMIN"],
    CANCELLED: ["ADMIN"],
  },
  READY_TO_SHIP: {
    SHIPPED: ["ADMIN"],
    CANCELLED: ["ADMIN"],
  },
  SHIPPED: { DELIVERED: ["ADMIN"] },
  DELIVERED: {},
  REJECTED: {},
  CANCELLED: {},
};

export class InvalidOrderTransitionError extends Error {
  readonly status = 409;
  constructor(readonly from: FulfillmentState, readonly to: FulfillmentState, readonly actor: OrderActor) {
    super(`The ${actor.toLowerCase()} cannot move an order from ${from} to ${to}.`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertFulfillmentTransition(
  from: FulfillmentState,
  to: FulfillmentState,
  actor: OrderActor,
): void {
  if (!transitions[from][to]?.includes(actor)) {
    throw new InvalidOrderTransitionError(from, to, actor);
  }
}