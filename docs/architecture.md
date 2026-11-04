# Architecture

## Guest checkout and admin access

Customer registration, login, password reset, profile editing and saved-address endpoints are retired. Checkout accepts buyer contact and India delivery address details without login. It creates a random internal guest identity rather than claiming an identity by submitted email, and establishes a browser session after successful order creation. Subsequent purchases reuse that guest identity. Order access remains scoped to the session identity, never the email entered at checkout. Contact snapshots drive customer notifications and admin contact displays independently of the internal guest alias. `/admin` uses a dedicated admin-only login backed by the predefined seeded credentials.

Public `/track-order` accepts a human-readable order number without requiring a session. Its database query selects only order status, dates, item names/sizes/quantities, totals and courier shipment dates. It never loads buyer contact/address snapshots, measurements, private timeline notes, carrier tracking URLs or payment identifiers. Private details and mutations remain ownership-scoped at `/orders/[id]` and their existing APIs. `/account` and `/account/orders` redirect to the tracking page; the old private detail route remains compatible with existing bookmarks.

The phase notes below record the original implementation milestones; the guest flow above supersedes their customer-authentication requirements.

## Boundaries

- `src/server/domain` holds framework-independent rules such as money representation and the injectable clock.
- `src/server/services` will orchestrate persistence and external providers as each workflow is implemented.
- `src/app` contains thin App Router pages and route handlers.
- `src/components` contains presentation-only UI.
- `prisma/schema.prisma` and committed migrations define persistent records and database constraints.

The browser is not authoritative for price, inventory, fulfillment state or access control. Monetary values are integer paise. Order, address, measurement and policy values are snapshotted for historical stability. Database sessions store only token hashes; verification and reset tokens are also stored as hashes. Development email payloads are encrypted using a key derived from `SESSION_SECRET`.

## Phase 1 status

The initial schema, local Postgres Compose service, environment validation, Argon2id password helpers, database-backed sessions and role/ownership guards are present. Authentication API routes support account creation, email verification, login, logout and password reset. The local storage provider validates JPEG/PNG/WebP bytes, limits uploads to 5 MB and signs private file URLs. The email outbox currently implements the encrypted development driver only. Payment, fulfillment, worker and storefront business workflows follow in later phases.

## Phase 2 status

Public collection and product queries require an active product in a visible category; hidden products return not found on direct routes. Admin category and product changes require an admin session and are audited. Product activation requires an image and a visible category, DD products require variants, CD fees use the effective settings range, and local image uploads are validated and access-controlled as appropriate. Inventory adjustments lock the variant row, preserve `reserved <= on_hand`, and record stock movements and audit entries. The seed includes two clearly named development-only products and skips demo settings/catalog data in production.

## Phase 3 and 4 status

Cart quotes re-read active catalog, stock, measurement ranges and shipping settings on the server. Guest and account lines preserve separate custom measurement sets; changed prices require acceptance. Checkout uses integer paise, validates India address and verified customer ownership, snapshots contact/address/settings/items, and creates COD or pending-online orders. Order creation locks product/variant rows, allocates human-readable numbers from a database counter, reserves DD stock with the order in one transaction, and enforces a customer-scoped idempotency key. COD cart lines clear only on successful placement; online lines remain until verified payment. Customer order queries are ownership-scoped; pending-payment cancellation locks the order and releases reservations once. Real-Postgres integration tests cover stock races, idempotency, and cancellation release.

## Phase 5 and 6 status

Payment-provider order creation reuses the saved provider order, and browser callbacks and signed webhooks use the same capture reconciliation path. Amount, currency, provider order ownership and captured status are checked before payment is accepted. Webhook events are persisted/deduplicated with sensitive fields omitted; failed attempts do not downgrade a paid order. Late capture after expiry/cancellation sets `REFUND_REQUIRED` without re-reserving stock. Full refunds use provider idempotency and are marked complete only after provider verification. Unpaid expiry and email processing run in the database worker; a secret-protected cron tick is also available.

Admin fulfillment includes approval/rejection/cancellation, the 12-hour custom-production freeze, COD phone confirmation evidence, per-line QC/readiness, manual shipment, delivered-time checks, explicit COD collection, private notes, audit/timeline, and transactional status emails. Integration tests exercise order/stock races, expiry/late capture, capture replay, refund idempotency, and email job dedupe.

## Phase 7 status

Customer replacement requests enforce ownership, the order's snapshotted 96-hour window, line-specific DD/CD choices, duplicate/prior-request blocking, private photo validation, and admin stock allocation for accepted DD exchanges. Admin decisions send transactional update jobs. The email outbox encrypts payloads, deduplicates event/template/recipient, retries with backoff, defers at quota, and has a visible admin retry action. Resend is implemented as the real driver; Brevo remains configured but scaffold-only.