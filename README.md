# Florangi

Florangi is a mobile-first storefront and owner-operated admin application for designer and made-to-measure dresses. The implementation follows [Florangi_Completed_Requirements.md](Florangi_Completed_Requirements.md); the build architecture and delivery sequence are in [Florangi_AI_Agent_Build_Prompt.md](Florangi_AI_Agent_Build_Prompt.md).

## Local setup

Prerequisites: Node.js 20.9 or newer, npm, and Docker with Compose.

1. Copy `.env.example` to `.env`; set a unique `SESSION_SECRET` of at least 32 characters and an admin email/password.
2. Start the development database with `docker compose up -d`. Florangi uses host port `5433` to avoid colliding with an existing local database.
3. Install packages with `npm ci`.
4. Generate the client and apply migrations with `npm run db:generate` and `npm run db:migrate`.
5. Create the initial admin and development settings with `npm run db:seed`.
6. Start the app with `npm run dev` and open `http://localhost:3000`.
7. For local email processing, open `/dev` and use **Run jobs now**. Vercel Cron runs only on the production deployment.

Customers shop and check out as guests; no customer account or login is available. Checkout saves first name, last name, phone number, email and delivery address directly on the order. Anyone can open `/track-order` and enter the displayed order number (for example, `FLR-2026-000001`) to view limited order status, items, totals and shipping progress. Private order details and payment/replacement actions at `/orders/[id]` require the order-specific secure link delivered by email; activating it grants access in that browser without creating a customer session. Public tracking never reveals buyer contact details, addresses, measurements, private notes or carrier tracking URLs.

Open `/admin` to sign in with the predefined `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured before seeding. Only admin identities can use this login. Change development credentials before deployment.

Development transactional emails are encrypted in the database outbox and can be opened at `/dev/emails`. The default payment driver is `mock`; successful test capture is available from the order confirmation/details page.

### Provider setup

Keep credentials in `.env`, never in `.env.example` or source control. Rotate credentials if they have been exposed. Set `SESSION_SECRET` to the existing secret used for this database: changing it invalidates sessions and makes existing encrypted email jobs unreadable.

- **Razorpay:** Set `PAYMENT_DRIVER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Start with matching test-mode keys. Configure a Razorpay webhook at the publicly accessible `APP_URL/api/razorpay/webhook` using the same webhook secret, and subscribe to `payment.captured`, `order.paid`, `payment.failed`, and `refund.processed`. The key ID is returned to checkout by the server; no separate public-key variable is required. Verify payment capture, webhooks and refunds in a test environment before using live keys.
- **Cloudinary:** Set `STORAGE_DRIVER=cloudinary` and the three `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` values. New catalog images use public delivery; replacement photos use authenticated storage and are served through application-authorized expiring links. Existing local files remain local until explicitly migrated; see [storage migration](docs/storage-migration.md). Validate authenticated delivery and access controls on a staging account before production.
- **Resend:** Set `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` to a sender on a domain verified with Resend. Set `EMAIL_REPLY_TO` to a suitable reply address. A Gmail sender is not a substitute for domain verification. Queued order emails are sent by the scheduled cron, not by the web process alone.

Restart the app after configuration changes. Do not switch a database with pending mock payments to Razorpay without reconciling those orders first. Provider configuration alone does not establish production readiness.

### Deploying on Vercel

In the Vercel project, open **Settings > Environment Variables** and configure the Production environment. Do not import the development defaults from `.env.example` unchanged.

- Set `PAYMENT_DRIVER=razorpay` and provide `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as described above. An unset `PAYMENT_DRIVER` defaults to `mock`, which is deliberately forbidden in production. Do not change `NODE_ENV` to bypass this safeguard.
- Set `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_REPLY_TO` for a verified sender. The default `dev` email driver is also forbidden in production.
- Set `DATABASE_URL` to a Vercel-accessible PostgreSQL database, `SESSION_SECRET` to a secure secret of at least 32 characters, `CRON_SECRET` to a separate secure secret, and `APP_URL` to the public HTTPS address. Do not use the example's localhost database or URL.
- Configure Cloudinary as described above for persistent uploads; local filesystem storage is not suitable for Vercel functions. Treat credentials and `SESSION_SECRET` as secrets and never commit or share them.

Select Preview separately if it needs its own configuration and isolated test providers/database. Save the variables and redeploy: changes do not affect existing deployments. Apply the committed database migrations to the intended database with `npm run db:deploy` from a properly configured environment; do not reset an existing database. Check runtime logs after opening the new deployment. A successful build alone does not verify runtime configuration.

For pre-launch testing, Razorpay test-mode keys can be used without enabling mock payments. Use an isolated test database and test provider accounts, and make it clear that orders are not real. The current Production-branch deployment uses Production-scoped Vercel variables even when it is only being used for testing. A Preview deployment uses Preview-scoped variables; check Deployment Protection if testers or Razorpay webhooks cannot access its URL. Treat an unprotected URL as public, not private.

Vercel Cron calls `GET /api/cron/tick` daily at 01:00 UTC (06:30 IST), using `Authorization: Bearer <CRON_SECRET>`. On Hobby, the call can occur at any time during that hour. Cron runs only on the production deployment, is best-effort, and is not automatically retried on failure; monitor Vercel logs and the admin email queue. Email delivery and retries may be delayed by a day or longer, and COD reminders are queued at least 24 hours after the initial confirmation email is processed. Each run processes at most 100 jobs. To run it manually, send an authenticated GET request to the production endpoint. Never expose the secret in client code or logs. Stop any previously deployed standalone worker or old scheduler when switching; old processes can still expire orders.

Resend's free plan currently allows 100 emails per UTC day and 3,000 per month. Set `EMAIL_DAILY_QUOTA` to 100 or lower; use a lower value if the Resend account also sends email outside this database. The application does not track Resend's monthly quota or external sends. Review provider usage and failed jobs; quota exhaustion or a missed cron can delay emails and confirmation links.

Unpaid orders are not automatically expired. Review pending payments and cancel unwanted orders using the admin **Cancel and release stock** action; do not edit inventory or statuses directly. Test providers, scheduled processing and cancellation before accepting real orders; review [open decisions](docs/open-decisions.md) before launch.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm run db:validate`
- `node --conditions=react-server --import tsx --test tests/cron-email.test.mjs`
- Use `/dev` to run email jobs locally; check Vercel Cron logs after deployment.

## Migration history

The pre-production dry-run migrations are consolidated into `prisma/migrations/20261103010000_init/migration.sql`, including all 25 custom integrity checks and the optional category-image table. Local development databases have been aligned with this baseline without resetting owner-entered data.

Apply this baseline to new databases with `npm run db:deploy`. Once deployed to production, keep applied migrations immutable and add incremental migrations for schema changes. Never reset a production database.

The current build includes admin-only authentication, catalog/admin inventory, local guest carts and checkout, authoritative quotes, COD and pending-online orders, payment reconciliation/refunds, public order tracking and token-protected order management, fulfillment/shipping/COD collection, replacement requests, signed COD confirmation/reminder jobs, encrypted email delivery, a Resend driver, and Vercel Cron email processing. Remaining release work includes owner policy approvals, live provider verification, Cloudinary credentialed validation, operational recovery/backup exercises, and accessibility and workflow acceptance checks.

## Development-only defaults

Admin products can be archived and activated again, subject to normal image/category requirements. Unused products can be permanently deleted; products referenced by orders or stock history must be archived instead. Each category supports two optional, replaceable image slots, displayed on its public collection page. Admins can delete a category only when no products are linked to it, including draft, hidden and archived products; deletion also removes its category images.

Shipping is payment-independent: `shipping_fee_paise` applies below `shipping_free_threshold_paise`, and shipping is free at or above the threshold. There is no separate COD fee input or new COD surcharge. Existing order amounts and policy snapshots are preserved; their saved legacy delivery charges are displayed together under Shipping. Any existing COD policy settings in the local development databases were migrated into versioned shipping settings without seeding missing policies.

Seeded measurement ranges and policy settings are marked `DEV DEFAULT`. They are not approved launch policy. Review [docs/open-decisions.md](docs/open-decisions.md) before enabling production checkout. Demo merchandise must never be seeded into production.
