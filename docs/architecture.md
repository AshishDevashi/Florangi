# Architecture

## Guest checkout and admin access

Customer registration, login, password reset, profiles, saved addresses and customer sessions do not exist. Checkout is guest-only and stores first name, last name, phone number, email and India delivery address directly on each order. Private order details and actions require a high-entropy, order-specific access token; the token is stored hashed, delivered in secure email links, and exchanged for an order-scoped HttpOnly cookie. The email or order number alone never grants private access. `/admin` retains a separate admin-only login backed by the predefined seeded credentials.

Public `/track-order` accepts a human-readable order number without requiring authentication. Its database query selects only order status, dates, item names/sizes/quantities, totals and courier shipment dates. It never loads buyer contact/address, measurements, private timeline notes, carrier tracking URLs or payment identifiers. Private details and mutations at `/orders/[id]` and their APIs require valid order-specific access. Customer account routes are removed.

The phase notes below record the original implementation milestones; the guest flow above supersedes their customer-authentication requirements.

## Boundaries

- `src/server/domain` holds framework-independent rules such as money representation and the injectable clock.
- `src/server/services` will orchestrate persistence and external providers as each workflow is implemented.
- `src/app` contains thin App Router pages and route handlers.
- `src/components` contains presentation-only UI.
- `prisma/schema.prisma` and committed migrations define persistent records and database constraints.

The browser is not authoritative for price, inventory, fulfillment state or access control. Monetary values are integer paise. Order contact, address, measurement and policy values are stored on or snapshotted with each order for historical stability. Admin and guest-order access sessions store only token hashes. Development email payloads are encrypted using a key derived from `SESSION_SECRET`.

## Phase 1 status

The schema, local Postgres Compose service, environment validation, Argon2id password helpers, database-backed admin sessions and admin guards are present. Authentication routes support admin login and logout only. Storage validates JPEG/PNG/WebP bytes, limits uploads to 5 MB and serves private files through authenticated expiring application links. Cloudinary and local storage, Razorpay and mock payments, and Resend and development email drivers are available.

## Phase 2 status

Public collection and product queries require an active product in a visible category; hidden products return not found on direct routes. Admin category and product changes require an admin session and are audited. Product activation requires an image and a visible category, DD products require variants, CD fees use the effective settings range, and local image uploads are validated and access-controlled as appropriate. Inventory adjustments lock the variant row, preserve `reserved <= on_hand`, and record stock movements and audit entries. The seed includes two clearly named development-only products and skips demo settings/catalog data in production.

## Phase 3 and 4 status

Cart quotes re-read active catalog, stock, measurement ranges and shipping settings on the server. The browser stores guest cart lines locally; changed prices require acceptance. Checkout uses integer paise, validates contact and India address details, snapshots address/settings/items and stores contact fields directly on the order. It creates COD or pending-online orders. Order creation locks product/variant rows, allocates human-readable numbers from a database counter, reserves DD stock with the order in one transaction, and enforces an idempotency key. Pending-payment cancellation requires the order's guest access token, locks the order and releases reservations once.

## Phase 5 and 6 status

Payment-provider order creation reuses the saved provider order, and browser callbacks and signed webhooks use the same capture reconciliation path. Amount, currency, provider order ownership and captured status are checked before payment is accepted. Webhook events are persisted/deduplicated with sensitive fields omitted; failed attempts do not downgrade a paid order. Late capture after expiry/cancellation sets `REFUND_REQUIRED` without re-reserving stock. Full refunds use provider idempotency and are marked complete only after provider verification. Unpaid expiry and email processing run in the database worker; a secret-protected cron tick is also available.

Admin fulfillment includes approval/rejection/cancellation, the 12-hour custom-production freeze, COD phone confirmation evidence, per-line QC/readiness, manual shipment, delivered-time checks, explicit COD collection, private notes, audit/timeline, and transactional status emails.

## Phase 7 status

Guest replacement requests require the order-specific access token and enforce the order's snapshotted 96-hour window, line-specific DD/CD choices, duplicate/prior-request blocking, private photo validation, and admin stock allocation for accepted DD exchanges. Admin decisions send transactional update jobs. The email outbox encrypts payloads, deduplicates event/template/recipient, retries with backoff, defers at quota, and has a visible admin retry action. Resend is implemented as the real driver; Brevo remains configured but scaffold-only.