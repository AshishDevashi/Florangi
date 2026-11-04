# Operations Recovery

All recovery actions must preserve the database as the source of truth. Do not edit `reserved`, payment status, or fulfillment status directly to make a dashboard look correct.

## Stuck or ambiguous payment

1. Locate the order by order number and inspect fulfillment/payment status, provider order ID, payment attempts and webhook events.
2. Query Razorpay by the saved provider order/payment ID. Confirm captured state, INR currency and exact paise amount.
3. If capture is verified, use the normal callback/webhook reconciliation path; replayed events are deduplicated.
4. If the order expired/cancelled before capture was reconciled, leave fulfillment `CANCELLED`, preserve the stock release, and keep `REFUND_REQUIRED`. Never re-reserve inventory.
5. For authorization-only or ambiguous provider responses, do not mark `PAID`; reconcile provider state and alert the owner.

## Failed or ambiguous refund

1. Keep the order at `REFUND_REQUIRED` until provider lookup confirms a full refund of the original captured amount.
2. Check the stored refund ID, provider status, captured payment ID and exact amount.
3. Retry only after resolving an ambiguous request. Refund idempotency uses an order-scoped key; never submit a partial amount or infer success from a dashboard checkbox.
4. Record externally initiated refunds through a provider-verified reconciliation path before marking `REFUNDED`.

## Email backlog

1. Check worker health and database connectivity, then run `npm run worker` or the secret-protected `/api/cron/tick` scheduler.
2. Inspect queued/deferred/failed jobs, attempt counts, provider quota and sender verification. `EMAIL_DAILY_QUOTA` defers excess jobs to the next UTC day.
3. Retry only `FAILED` jobs from the admin order page after correcting provider configuration. Event/template/recipient uniqueness prevents duplicate sends.
4. Use `/dev/emails` only outside production; it shows encrypted development outbox messages and one-time links.

## Reservation mismatch

1. Compare variant `on_hand`/`reserved` with open order lines and stock movements.
2. Check whether a reject, cancel, expiry, shipment or replacement allocation transaction committed; each action should have one movement record.
3. Do not decrement `reserved` manually. Correct through a reviewed, audited admin inventory adjustment or an owner-approved repair migration.
4. Alert the owner and preserve order/audit identifiers for investigation.