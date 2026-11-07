# Florangi project context

Compact map for future work. Treat the implementation and detailed docs as authoritative; this file is an index, not a substitute for reading the feature code being changed.

## Purpose and stack

Florangi is a mobile-first storefront and owner-operated admin for designer and made-to-measure dresses. Stack: Next.js 16.4 App Router, React 19, strict TypeScript, Prisma 6, PostgreSQL, Zod, Tailwind 4, Vitest and Playwright. `@/*` resolves to `src/*`. Node 20.9+ is expected.

## Source map

- `src/app/`: guest storefront/order/admin pages and API route handlers. Keep pages and route handlers thin.
- `src/components/`: UI grouped by feature (`admin`, `cart`, `catalog`, `checkout`, `orders`, `policies`).
- `src/server/domain/`: framework-independent business rules (money/paise, pricing, measurements, order state, fulfillment, COD confirmation, replacement window, clock).
- `src/server/services/`: persistence and workflow orchestration (catalog, cart quotes, orders, admin orders, replacements, settings, audit, email, tracking, COD).
- `src/server/{auth,payments,email,storage,http}/`: admin and guest-order access control; payment provider/reconciliation/refunds/expiry; encrypted outbox/provider/worker; local and Cloudinary storage; API errors.
- `src/server/db.ts`, `env.ts`, `worker.ts`: Prisma client, validated environment, background processing.
- `prisma/schema.prisma`, `prisma/migrations/`: data model and immutable deployed migration history; `prisma/seed.ts` seeds admin and development fixtures.
- `tests/e2e/`: browser flows. `src/**/*.test.ts` are unit tests; `*.integration.test.ts` use a separate PostgreSQL database.
- `docs/`: architecture, order state, owner decisions, recovery, backup/restore and storage migration procedures.
- `scripts/`: operational migration scripts. `public/`: static assets. Root configs define Next, TypeScript, ESLint, Vitest and Playwright.

## Product behavior and invariants

- Customers shop and check out as guests; no customer accounts or customer sessions exist. First name, last name, phone number, email and delivery address are stored directly on each order. `/track-order` is deliberately public and returns limited fields; private order actions require a secure per-order access token exchanged for an order-scoped cookie. Admin login is separate and admin-only.
- Server recalculates catalog, stock, measurements and shipping quotes. Browser values are not authoritative. Currency amounts are integer INR paise. Order lines, contact/address, measurement and settings snapshots preserve historical values.
- Checkout reserves designer-dress (DD) stock transactionally; maintain `reserved <= onHand`. Release/allocation must follow normal audited service workflows, never manual status or counter edits. Order creation is idempotent and order numbers use a database counter.
- Fulfillment and payment are separate state machines. Online capture is accepted only after provider verification of order ownership, INR amount and captured status. Expiry/cancellation followed by late capture means `REFUND_REQUIRED`, without re-reserving stock. Mark refunds complete only after provider verification. COD collection is explicitly recorded after delivery.
- Custom-dress (CD) production has a 12-hour freeze after approval plus confirmation requirements; replacement requests use the order’s snapshotted 96-hour window. Consult domain rules and `docs/order-state.md` before changing transitions.
- Email jobs are deduplicated, encrypted at rest, retried/deferred, and processed by `npm run worker` (or protected cron tick). Storage rows hold provider/key references; local is default, Cloudinary migration remains unvalidated with real credentials.
- Demo catalog, seeded settings/measurement ranges and policy values are development defaults, not launch approvals. Production readiness still requires owner approvals and provider/backup/recovery exercises; see `docs/open-decisions.md` and `README.md`.

## Configuration and commands

`.env.example` lists configuration names; `.env` contains secrets and must never be copied into context or logs. Key settings cover `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `ADMIN_*`, `PAYMENT_DRIVER`/Razorpay, `EMAIL_DRIVER`/Resend, `STORAGE_DRIVER`/Cloudinary and `CRON_SECRET`. Defaults and validation live in `src/server/env.ts`.

- `npm run dev`, `npm run build`, `npm run start`
- `npm run typecheck`, `npm run lint`, `npm test`
- `npm run db:generate`, `npm run db:validate`, `npm run db:migrate`, `npm run db:deploy`, `npm run db:seed`
- `npm run test:integration` requires `TEST_DATABASE_URL` to a disposable migrated PostgreSQL database. Never aim it at production or owner data. E2E requires Playwright Chromium.
- `npm run worker` runs background expiry/email processing. Docker Compose exposes local Postgres on host port 5433.

## Change guidance

Read the relevant guide under `node_modules/next/dist/docs/` before writing Next.js code (per `AGENTS.md`). Then inspect the target route/component, its service and domain rules, and nearby tests. Put business rules in domain/services, keep access checks server-side, validate inputs with existing Zod patterns, and update tests/docs when behavior changes. Migrations already applied in production are immutable; add incremental migrations and never reset production. For operational incidents follow `docs/operations-recovery.md` rather than editing database state directly.
