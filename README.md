# Florangi

Florangi is a mobile-first storefront and owner-operated admin application for designer and made-to-measure dresses. The implementation follows [Florangi_Completed_Requirements.md](Florangi_Completed_Requirements.md); the build architecture and delivery sequence are in [Florangi_AI_Agent_Build_Prompt.md](Florangi_AI_Agent_Build_Prompt.md).

## Local setup

Prerequisites: Node.js 20.9 or newer, npm, and Docker with Compose.

1. Copy `.env.example` to `.env`; set a unique `SESSION_SECRET` of at least 32 characters and an admin email/password.
2. Start the development database with `docker compose up -d`. Florangi uses host port `5433` to avoid colliding with an existing local database.
3. Install packages with `npm ci`.
4. Install the browser used by the mobile journey with `npx playwright install chromium`.
5. Generate the client and apply migrations with `npm run db:generate` and `npm run db:migrate`.
6. Create the initial admin and development settings with `npm run db:seed`.
7. Start the app with `npm run dev` and open `http://localhost:3000`.
8. In another terminal, start scheduled work with `npm run worker`.

Customers shop and check out as guests; no customer account or login is available. Checkout saves first name, last name, phone number, email and delivery address directly on the order. Anyone can open `/track-order` and enter the displayed order number (for example, `FLR-2026-000001`) to view limited order status, items, totals and shipping progress. Private order details and payment/replacement actions at `/orders/[id]` require the order-specific secure link delivered by email; activating it grants access in that browser without creating a customer session. Public tracking never reveals buyer contact details, addresses, measurements, private notes or carrier tracking URLs.

Open `/admin` to sign in with the predefined `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured before seeding. Only admin identities can use this login. Change development credentials before deployment.

Development transactional emails are encrypted in the database outbox and can be opened at `/dev/emails`. The default payment driver is `mock`; successful test capture is available from the order confirmation/details page.

### Provider setup

Keep credentials in `.env`, never in `.env.example` or source control. Rotate credentials if they have been exposed. Set `SESSION_SECRET` to the existing secret used for this database: changing it invalidates sessions and makes existing encrypted email jobs unreadable.

- **Razorpay:** Set `PAYMENT_DRIVER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Start with matching test-mode keys. Configure a Razorpay webhook at the publicly accessible `APP_URL/api/razorpay/webhook` using the same webhook secret, and subscribe to `payment.captured`, `order.paid`, `payment.failed`, and `refund.processed`. The key ID is returned to checkout by the server; no separate public-key variable is required. Verify payment capture, webhooks and refunds in a test environment before using live keys.
- **Cloudinary:** Set `STORAGE_DRIVER=cloudinary` and the three `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` values. New catalog images use public delivery; replacement photos use authenticated storage and are served through application-authorized expiring links. Existing local files remain local until explicitly migrated; see [storage migration](docs/storage-migration.md). Validate authenticated delivery and access controls on a staging account before production.
- **Resend:** Set `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to a sender on a domain verified with Resend. Set `EMAIL_REPLY_TO` to a suitable reply address. A Gmail sender is not a substitute for domain verification. Run `npm run worker` continuously or configure the protected cron tick; queued order emails are not sent by the web process alone.

Restart the app and worker after configuration changes. Do not switch a database with pending mock payments to Razorpay without reconciling those orders first. Provider configuration alone does not establish production readiness.

## Checks

- `npm run test:integration` (requires the separate `TEST_DATABASE_URL` database)
- `npm run test:e2e` (requires Chromium from Playwright)
- `npm run db:validate`
- `npm run worker` (separate process for expiry and email jobs)

## Migration history

The pre-production dry-run migrations are consolidated into `prisma/migrations/20261103010000_init/migration.sql`, including all 25 custom integrity checks and the optional category-image table. Local development databases have been aligned with this baseline without resetting owner-entered data. Integration tests create synthetic fixtures; use a separate disposable database rather than a database containing owner-entered data.

Apply this baseline to new databases with `npm run db:deploy`. Once deployed to production, keep applied migrations immutable and add incremental migrations for schema changes. Never reset a production database.

## PostgreSQL integration tests

Integration tests use a separate disposable database and never target the development database. Create it once with `createdb -h localhost -p 5433 -U florangi florangi_test`, apply migrations with `DATABASE_URL=postgresql://florangi:florangi_dev@localhost:5433/florangi_test?schema=public npm run db:deploy`, then run `TEST_DATABASE_URL=postgresql://florangi:florangi_dev@localhost:5433/florangi_test?schema=public npm run test:integration`. The suite creates synthetic customers, catalog rows and orders in this database; do not point it at production data.

The current build includes admin-only authentication, catalog/admin inventory, local guest carts and checkout, authoritative quotes, COD and pending-online orders, payment reconciliation/refunds/expiry, public order tracking and token-protected order management, fulfillment/shipping/COD collection, replacement requests, signed COD confirmation/reminder jobs, encrypted email delivery, a Resend driver, and the database worker. Remaining release work includes owner policy approvals, live provider verification, Cloudinary credentialed testing, operational recovery/backup exercises, and broader Playwright/accessibility acceptance coverage.

## Development-only defaults

Admin products can be archived and activated again, subject to normal image/category requirements. Unused products can be permanently deleted; products referenced by orders or stock history must be archived instead. Each category supports two optional, replaceable image slots, displayed on its public collection page. Admins can delete a category only when no products are linked to it, including draft, hidden and archived products; deletion also removes its category images.

Shipping is payment-independent: `shipping_fee_paise` applies below `shipping_free_threshold_paise`, and shipping is free at or above the threshold. There is no separate COD fee input or new COD surcharge. Existing order amounts and policy snapshots are preserved; their saved legacy delivery charges are displayed together under Shipping. Any existing COD policy settings in the local development databases were migrated into versioned shipping settings without seeding missing policies.

Seeded measurement ranges and policy settings are marked `DEV DEFAULT`. They are not approved launch policy. Review [docs/open-decisions.md](docs/open-decisions.md) before enabling production checkout. Demo merchandise must never be seeded into production.
