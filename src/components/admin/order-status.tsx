export const fulfillmentLabels = {
  PENDING_PAYMENT: "Pending payment", PENDING_APPROVAL: "Awaiting approval", APPROVED: "Approved",
  IN_PRODUCTION: "In production", READY_TO_SHIP: "Ready to ship", SHIPPED: "Shipped",
  DELIVERED: "Delivered", REJECTED: "Rejected", CANCELLED: "Cancelled",
} as const;
const paymentLabels: Record<string, string> = {
  UNPAID: "Unpaid", PAID: "Paid", FAILED: "Payment failed", COD_PENDING: "COD pending",
  COD_COLLECTED: "Cash collected", REFUND_REQUIRED: "Refund required", REFUNDED: "Refunded",
};

export function orderStatusLabel(value: string, kind: "fulfillment" | "payment" = "fulfillment") {
  return (kind === "payment" ? paymentLabels[value] : fulfillmentLabels[value as keyof typeof fulfillmentLabels]) ?? value.replaceAll("_", " ");
}

export function OrderStatusBadge({ value, kind = "fulfillment" }: { value: string; kind?: "fulfillment" | "payment" }) {
  const tone = ["REFUND_REQUIRED", "FAILED", "REJECTED"].includes(value)
    ? "border-danger-border bg-danger-bg text-danger"
    : ["PAID", "COD_COLLECTED", "DELIVERED", "REFUNDED"].includes(value)
      ? "border-success-border bg-success-bg text-success"
      : ["PENDING_APPROVAL", "READY_TO_SHIP", "COD_PENDING", "PENDING_PAYMENT"].includes(value)
        ? "border-border bg-surface-hover text-accent"
        : "border-border bg-surface-muted text-muted";
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{orderStatusLabel(value, kind)}</span>;
}
