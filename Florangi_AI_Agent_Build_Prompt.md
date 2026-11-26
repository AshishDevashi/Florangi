# Prompt: Build the Florangi E-commerce Website (Next.js + PostgreSQL)

> **How to use:** Paste this whole prompt into your AI coding agent (Claude Code, Cursor, etc.) and attach or paste `Florangi_Completed_Requirements.docx` (v3.0) with it. The document is the source of truth for business rules. This prompt adds the tech stack, architecture, and development-phase decisions.

---

## 1. Your role and goal

You are a senior full-stack engineer. Build the complete Florangi storefront and admin panel as a working application that runs locally, following the attached requirements document (v3.0). It sells women's designer dresses (DD) and custom made-to-measure dresses (CD) in India. The owner approves and ships every order by hand. Customers pay through Razorpay or Cash on Delivery.

**Priority for this phase: every workflow must work end to end.** The UI should be clean, plain, functional and mobile-first. The whole visual design will be replaced later, so do not spend time on polish. Structure the code so the UI layer can be swapped without touching business logic.

Rules for working:
- Treat the requirements document as authoritative. Keep its requirement IDs (PRC-1, LIF-5, PGW-3, and so on) in code comments and commit messages so they can be traced.
- Do **not** build anything in the "Deferred" column (SCP-3, DEL-5): no search, filters, reviews, wishlist, coupons, saved carts, guest checkout, courier API, SMS/WhatsApp, partial refunds, wallets, or staff roles.
- If a material behavior is not specified, do not silently invent it. Pick the simplest safe option, mark it with `// DECISION-NEEDED:` and list it in `docs/open-decisions.md`.
- Work in phases (section 11). After each phase, validate changes, fix failures, and give a short summary before moving on.

---

## 2. Tech stack (fixed)

| Concern | Choice |
| --- | --- |
| Framework | Next.js (latest stable, App Router), TypeScript in strict mode |
| Database | Local PostgreSQL (use `DATABASE_URL`; provide an optional `docker-compose.yml` with only Postgres for convenience) |
| ORM / migrations | Prisma (migrations committed). Use raw SQL (`$queryRaw`) inside transactions where row locks are needed (`SELECT ... FOR UPDATE`) |
| Styling | Tailwind CSS, with a small set of reusable base components in `src/components/ui` |
| Validation | Zod, shared by client forms and server handlers. The server always re-validates |
| Auth | Email + password with verified email and reset links (Q9 default). Database-backed sessions, secure httpOnly cookies, bcrypt or argon2 hashing. Build this one method only |
| Payments | Razorpay Standard Checkout (test mode in development) |
| Email | Provider abstraction (section 5) |
| Images / files | Storage abstraction (section 4) |
| Background jobs | Database-backed job queue plus a worker process (section 7). No Redis |

---

## 3. Architecture rules

1. **Layering.**
   - `src/server/domain/*`: pure business logic (pricing, state machine, validation rules). No framework imports.
   - `src/server/services/*`: orchestration with the database (orders, inventory, payments, refunds, replacements, settings, email).
   - `src/app/**`: route handlers, server actions and pages. These stay thin and only call services.
   - `src/components/**`: UI only. It contains no business rules and never calculates prices.
2. **Server is the source of truth** for every price, fee, status and permission. The browser only displays values. Never trust client totals (CHK-4, PAY-3).
3. **Money** is stored and calculated as **integer paise** everywhere (PAY-3). Use one helper module for formatting to ₹ and for parsing. Reject negatives and invalid precision.
4. **Time.** Store UTC. Display in Asia/Kolkata with an explicit timezone label (LIF-7). All time-dependent logic goes through an injectable `Clock` service so dev tools can control time.
5. **Order state machine** is one module with an explicit transition table, covering fulfillment status and payment status as separate fields (LIF-1 to LIF-4, ORD-1 to ORD-16). Every transition:
   - runs in a DB transaction that locks the order row,
   - re-checks the current state,
   - writes a timeline event and an audit log entry,
   - is idempotent where the requirements say so.
6. **Concurrency and idempotency.**
   - Stock reservation is atomic with order creation (LIF-5). Use DB `CHECK` constraints: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`.
   - Create-order requires an idempotency key (CHK-10). Same key and same payload returns the same order. Same key with a different payload returns HTTP 409.
   - Expiry, webhook reconciliation and browser-callback reconciliation lock the same order row (LIF-6).
   - Stock release, payment acceptance, refund and email send must each be safe to run twice (OPS-5).
7. **Authorization on every server operation** (SEC-1). Create reusable guards `requireCustomer()`, `requireAdmin()` and `assertOwnsOrder()`. Hiding a button is never authorization. Return 403 or 404 without leaking private data.
8. **Audit log** for every admin create, update, delete and status change (ADM-3, section 9).
9. Do not log passwords, tokens, measurement data, payment secrets or full request bodies (SEC-3, SEC-6, CRT-8). Add correlation IDs to structured logs (OPS-2).
10. **Settings** are versioned with an effective time (section 9). Each order stores a snapshot of the shipping fee, COD surcharge and threshold, and replacement window (DAT-3).

---

## 4. File storage: local now, Cloudinary later

Build a `StorageProvider` interface and select the implementation with `STORAGE_DRIVER=local|cloudinary`.

```ts
interface StorageProvider {
  put(input: { buffer: Buffer; mimeType: string; originalName: string;
               visibility: 'public' | 'private'; folder: string }): Promise<StoredFile>;
  getPublicUrl(file: StoredFile): string;                       // public assets
  getSignedUrl(file: StoredFile, expiresInSec: number): Promise<string>; // private assets
  delete(file: StoredFile): Promise<void>;
}
// StoredFile = { provider, key, mimeType, size, width?, height? }
```

- **`LocalStorageProvider` (implement fully now).**
  - Public files (product images) go to `public/uploads/...`.
  - Private files (replacement photos) go to `storage/private/...`, outside `public/`, and are served only through an authenticated route handler. That route checks ownership or admin role, and supports expiring signed URLs (HMAC token plus expiry).
  - Both folders are git-ignored. Generate random file names, never use the user's file name for the path, and block path traversal (SEC-5).
- **`CloudinaryProvider` (scaffold only).** Implement the interface with the Cloudinary SDK, behind env vars `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. Private photos must use Cloudinary's `authenticated` or `private` delivery type with signed URLs. Mark it untested if you cannot test it. Switching drivers must require no code change outside configuration.
- **Database stores only `StoredFile` references** (provider, key, mime, size, dimensions), never absolute URLs or local paths. URLs are produced at read time through the provider.
- **Upload validation (SEC-4, Q11).** Allow JPEG, PNG and WebP only, max 5 MB each. Verify actual content by magic bytes, not just the extension or MIME header. Product images: 1 to 8 per product, at least 1 before activation. Replacement photos: up to 3 per request.
- Add a short `docs/storage-migration.md` describing how to move existing local files to Cloudinary later, with a script skeleton `scripts/migrate-storage-to-cloudinary.ts`.

---

## 5. Email: provider abstraction

Select the driver with `EMAIL_DRIVER=dev|resend|brevo`.

- **`dev` driver (default in development).** Does not send anything. It stores every email in an `EmailOutbox`/log table and prints it to the console, and shows it in a dev-only page `/dev/emails` so links (verification, reset, COD confirm) can be clicked during testing.
- **`resend` and `brevo` drivers.** Implement at least one real driver completely and scaffold the other. Credentials, sender address and reply-to come from environment variables (EML-15).
- Implement all templates EML-1 to EML-10, plus the 24-hour COD reminder (EML-3, EML-16). Plain, simple HTML is fine. Content rules are in EML-15: never include secrets or internal admin notes, and measurement emails contain only that customer's measurements.
- **Email jobs (EML-11, EML-12, EML-14).**
  - One job per event + template + recipient, enforced by a unique key.
  - Bounded retries with exponential backoff and a visible FAILED state.
  - A failed send must never roll back or block the order flow.
  - The admin order page shows email attempts with an admin **Retry** action.
  - Configurable daily quota (`EMAIL_DAILY_QUOTA`); warn the admin at 80% and defer extra jobs to the next window without losing them.
- Replayed payment events must not resend confirmations.

---

## 6. Razorpay integration

Follow section 6 of the document exactly (PGW-1 to PGW-12, REF-1 to REF-6). Highlights:

- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Only the key ID reaches the browser.
- Server creates the Razorpay order (amount in paise, INR, receipt = order number) and stores `razorpay_order_id`. If provider order creation fails after the local order exists, keep the local order UNPAID and allow a safe retry without duplicating the order or reservation (CHK-14).
- `POST /api/payments/verify`: verify HMAC SHA256 of `order_id|payment_id`, then **fetch the payment from Razorpay** and confirm it belongs to the saved order, is captured, and has the right amount and currency. Only then mark PAID.
- `POST /api/razorpay/webhook`: verify the signature on the **raw body** (return 400 if invalid). Persist the event before acknowledging (PGW-12). Dedupe on event ID. Return 200 quickly. Handle `payment.captured`, `order.paid`, `payment.failed` and `refund.processed` as in the document's table.
- The browser callback and the webhook call the **same idempotent reconciliation function** (PGW-3).
- Track payment attempts in their own table (PGW-11). FAILED never downgrades PAID or REFUNDED. Late capture on a CANCELLED order creates REFUND_REQUIRED and alerts the admin (LIF-6, PGW-10).
- Admin refund action calls the Razorpay Refunds API for the full captured amount, idempotently (REF-5). Mark REFUNDED only after verified completion. Support the fallback of entering a dashboard refund ID, which the server verifies with the provider (REF-3).
- **Payment driver for development:** `PAYMENT_DRIVER=razorpay|mock`.
  - `razorpay` uses real Razorpay test keys. Document using a tunnel (ngrok or cloudflared) for webhooks locally.
  - `mock` is a dev-only fake gateway so the full flow can be tested without keys or a tunnel. It must go through the **same** reconciliation code path, producing signed fake callbacks and webhooks. It must be impossible to enable when `NODE_ENV=production`.

---

## 7. Background jobs and scheduled work

Run a worker as a separate process (`npm run worker`) that polls the database job table every few seconds, and runs scheduled tasks at least every minute (OPS-1). Also expose a secret-protected `/api/cron/tick` route so a hosted scheduler can trigger the same work later. Tasks:

1. Expire unpaid PENDING_PAYMENT orders older than 30 minutes by **server time**, release stock once, and set CANCELLED (CHK-9, PGW-10). Skip any order that was paid.
2. Send queued and retry failed emails.
3. Send the single 24-hour COD confirmation reminder if still unconfirmed and eligible (EML-16, ORD-14).
4. Reconcile pending or ambiguous payments with Razorpay and alert on mismatches (PGW-12).
5. Alert the admin on job failures and reservation mismatches (OPS-1, OPS-2).

All tasks must be safe to repeat and safe after a worker restart (OPS-5).

**Dev-only tools (disabled in production):** a `/dev` page with (a) a clock offset control so the 30-minute expiry, 12-hour production freeze, 24-hour reminder and 96-hour replacement window can be tested without waiting, (b) a "run jobs now" button, (c) the email viewer, and (d) mock payment controls. Everything must go through the injectable `Clock`.

---

## 8. Data model

Create a Prisma schema covering every record in section 9 of the document. Minimum entities:

`User` (role, emailVerifiedAt), `Session`, `VerificationToken`/`PasswordResetToken` (hashed, expiring, single-use), `Address`, `Category`, `Product`, `ProductImage`, `ProductVariant` (DD size, premium, onHand, reserved), `StockMovement` (audited adjustments and reservations), `Cart`, `CartLine` (with last accepted quote version), `Order` (fulfillment status, payment status, totals in paise, address/contact snapshot, settings snapshot, payment deadline, idempotency key, confirmedAt for COD), `OrderLine` (immutable product and price snapshot, readiness, QC fields), `MeasurementVersion`, `PaymentAttempt`, `PaymentEvent` (unique provider event ID), `Refund`, `OrderTimelineEvent` (public) and `OrderNote` (private admin), `AuditLog`, `Shipment`, `ReplacementRequest`, `ReplacementRequestLine`, `ReplacementPhoto`, `Setting` (versioned), `EmailJob`, `Job`.

Constraints to enforce in the database where possible: unique slugs, unique size per product, `reserved <= on_hand`, CD quantity = 1, unique order number, unique idempotency key per customer, unique event/template/recipient email job, unique provider event ID. Order numbers should be human-friendly (for example `FLR-2026-000123`) and generated safely under concurrency.

Hard deletes are blocked for orders, audit logs and any product that has orders (PRD-5, DAT-1).

---

## 9. Features to implement (all must work)

Implement every requirement in the document. The list below is a checklist, not a replacement.

### Storefront (Part A)
- Pages: `/`, `/collections/[slug]`, `/products/[slug]`, `/cart`, `/checkout`, `/orders/[id]/confirmation`, `/account`, `/account/orders`, `/account/orders/[id]`, plus `/login`, `/register`, `/verify-email`, `/forgot-password` and `/reset-password`. Static policy pages (shipping, replacement, privacy, terms, contact) with clearly labeled **placeholder text**.
- Catalog shows only ACTIVE products in visible categories, and hidden/draft/archived products return 404 on direct URLs (CAT-1, CAT-6). Product cards, sold-out sizes, DD size buttons with size prices, CD measurement form with fee and 7 to 10 day note, and dispatch and 4-day replacement notes (CAT-2 to CAT-5).
- CD measurement form validated on client and server using ranges from settings (MEA-1 to MEA-4). Height as feet + inches (inches 0 to under 12).
- Cart: guest cart in browser storage, merged on login (CRT-5, CRT-6, CRT-8). Server re-validates price, status and stock on every cart load and at checkout, flags changes, and requires acceptance (CRT-4, CRT-7). CD lines are always quantity 1.
- Checkout: verified email and phone required, India-only address validation (6-digit PIN, phone format), saved addresses, payment choice, instant COD surcharge display from the server, CD+COD notice (CHK-1 to CHK-15).
- Razorpay flow, retry payment, closed-dialog handling that shows the true server status (PGW-9, CHK-14, CHK-15).
- Order history and detail: status timeline, measurements, address, price breakdown, tracking info, customer cancel only while PENDING_PAYMENT, replacement request form with photos while the window is open (OHS-1 to OHS-5, REQ-5, REQ-6).
- Account: name, phone, address book (ACC-2).
- Signed, expiring COD confirmation link page: opening the link changes nothing, a deliberate form submit confirms (ORD-14).

### Admin (Part B) at `/admin`
- Dashboard counts: awaiting approval (with a 24h+ highlight), in production, ready to ship, open replacements, low stock (available <= 2).
- Categories: create, rename, reorder, hide.
- Products: create/edit/archive, DD/CD type, images upload/reorder/remove, DD variants and premiums, CD fee within settings limits, status rules (needs 1+ image to activate).
- Inventory: set on_hand per size, show reserved and available, block lowering on_hand below reserved, record movements (PRD-6).
- Orders: list with filters (status, payment mode), order detail with all actions: approve, reject (reason), start production (blocked until 12h passed, plus COD confirmation tick), measurement correction (versioned), per-line QC checklist (+/-0.5 inch, QC card), mark ready (mixed-order rules), ship (courier, AWB, optional HTTPS tracking URL), mark delivered (with `delivered_at` validation), COD collected, cancel (reason, production warning), full refund, internal notes, timeline, and email attempts with retry.
- Replacement requests: list, view photos, accept/reject/resolve, record logistics, DD exchange stock allocation, create on behalf of a customer (REQ-1 to REQ-8).
- Customers: read-only list and detail with their orders.
- Settings: shipping fee, COD surcharge and threshold, customization fee limits, measurement ranges, replacement window hours, low-stock threshold. Versioned and audited.
- Admin pages must also work at 360px width (NFR-1).

### Seed data and first admin
- `npm run seed` creates: default settings, a few categories, several DD and CD **sample products clearly named as demo** (use generated placeholder images), stock, and one admin created from env vars `ADMIN_EMAIL` and `ADMIN_PASSWORD` (SEC-8). Public signup can never set a role.
- Seed with development values for undecided policy items (Q1, Q8, Q13) and label them `DEV DEFAULT` in code and the settings screen. For measurement ranges use clearly marked placeholder inclusive ranges, editable by the admin. The seed script must refuse to run these demo products in production.

---

## 10. Security and quality

- Implement SEC-1 to SEC-8: ownership checks, CSRF protection for state-changing requests, rate limiting on login, verification, checkout and replacement submission (simple DB- or memory-based limiter is fine now), secure cookies, HTTPS-only tracking URLs, escaped output, security headers.
- Accessibility basics (NFR-1, NFR-2): labels, focus states, field-specific errors, loading/empty/error/success states, double-submit prevention, preserved form values after recoverable errors.
- Verify critical order, payment, stock, security and accessibility workflows in an isolated environment before release.
- Run type checking and lint before declaring a phase complete.

---

## 11. Delivery phases (follow DEL-1 / DEL-2)

1. **Foundation:** project setup, Prisma schema and migrations, env validation, auth (register/verify/login/reset), role guards, settings, audit log, Clock, storage and email abstractions with dev drivers.
2. **Catalog and admin catalog:** categories, products, images, variants, inventory, storefront browse pages, seed data.
3. **Cart and pricing:** measurement validation, server pricing, guest cart merge, quote revalidation.
4. **Checkout and orders:** address, atomic reservation, order creation with idempotency, COD flow, state machine, order history and detail.
5. **Payments:** Razorpay (and mock driver), verify endpoint, webhook, reconciliation, retry, expiry job, refunds.
6. **Fulfillment:** approval, production freeze, measurement correction, QC, readiness, shipping, delivery, COD collected, cancel and reject.
7. **Replacements and emails:** replacement requests and admin handling, all email templates, email queue with retries and quota, COD confirmation link and reminder.
8. **Hardening:** dev tools, security review, responsive and accessibility pass, workflow validation, docs.

---

## 12. Deliverables

- Complete source code and committed Prisma migrations.
- `README.md` with: prerequisites, local Postgres setup, `.env` setup, migrate, seed, run web app, run worker, Razorpay test setup with a tunnel, and how to use the dev tools to validate time-based flows.
- `.env.example` with every variable and no secrets, including: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `STORAGE_DRIVER`, `CLOUDINARY_*`, `EMAIL_DRIVER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY` / `BREVO_API_KEY`, `EMAIL_DAILY_QUOTA`, `ADMIN_ALERT_EMAIL`, `PAYMENT_DRIVER`, `RAZORPAY_*`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- `docs/` with: architecture overview, order state diagram (Mermaid), storage migration to Cloudinary, open decisions list (Q1 to Q14 status plus any `DECISION-NEEDED` items), backup and restore notes (OPS-3), and a recovery procedure for stuck payments, failed refunds and email backlog (OPS-2).
- A final report listing: what is implemented, what is scaffolded but unverified (for example Cloudinary), validation results, and any requirements you could not meet and why.

Start with Phase 1 now. Before writing code, reply with a short plan (folder structure, key libraries, and any questions that truly block progress), then proceed.
