# Order State Machine

Fulfillment and payment are separate state dimensions. Refund status never moves fulfillment backward.

```mermaid
stateDiagram-v2
  [*] --> PENDING_PAYMENT: Online checkout
  [*] --> PENDING_APPROVAL: COD checkout
  PENDING_PAYMENT --> PENDING_APPROVAL: Verified captured payment
  PENDING_PAYMENT --> CANCELLED: 30-minute expiry / customer cancel / admin cancel
  PENDING_APPROVAL --> APPROVED: Admin approve
  PENDING_APPROVAL --> REJECTED: Admin reject
  PENDING_APPROVAL --> CANCELLED: Admin cancel
  APPROVED --> IN_PRODUCTION: Custom dress after 12h and COD confirmation
  APPROVED --> READY_TO_SHIP: Designer lines packed
  APPROVED --> CANCELLED: Admin cancel
  IN_PRODUCTION --> READY_TO_SHIP: Every line ready and custom QC complete
  IN_PRODUCTION --> CANCELLED: Admin cancel with production warning
  READY_TO_SHIP --> SHIPPED: Admin enters courier and AWB
  READY_TO_SHIP --> CANCELLED: Admin cancel
  SHIPPED --> DELIVERED: Admin records delivery
  DELIVERED --> [*]
  REJECTED --> [*]
  CANCELLED --> [*]
```

Payment status progresses independently: online `UNPAID`/`FAILED` → verified `PAID`; rejected/cancelled captured orders → `REFUND_REQUIRED` → provider-verified `REFUNDED`. COD progresses `COD_PENDING` → explicit admin `COD_COLLECTED` after delivery. A late capture after cancellation leaves fulfillment `CANCELLED` and sets payment `REFUND_REQUIRED` without re-reserving stock.