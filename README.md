# CIAfeeds — Automotive Inventory Ads

SaaS platform that enables automotive dealers to generate Meta-compatible catalog feed CSVs from Vehicle Detail Pages (VDPs).

## Prerequisites

- Node.js 18.17.0+
- PostgreSQL (local or managed, e.g. Supabase or Railway)
- A [Firecrawl](https://firecrawl.dev) API key

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@localhost:5432/ciafeeds`) |
| `NEXTAUTH_SECRET` | Random secret string for NextAuth JWT signing |
| `NEXTAUTH_URL` | App base URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | Publicly accessible base URL used to construct feed links (e.g. `http://localhost:3000`) |
| `FIRECRAWL_API_KEY` | Your Firecrawl API key |

### 3. Run database migrations

```bash
npx prisma migrate dev
```

### 4. Start the development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Verify the CSV Feed

After signing up and adding vehicles, verify the feed with:

```bash
curl http://localhost:3000/feeds/test-dealer.csv
```

`test-dealer` is the slug generated when signing up with the name "Test Dealer" during local development. Replace it with your dealer's slug for other accounts.

## Run Tests

```bash
npm test
```

## Deployment

**Prerequisites:** Node 18+, PostgreSQL (Supabase or Railway recommended)

1. Push repo to GitHub.
2. Import the project in the Vercel dashboard.
3. Add the following environment variables in Vercel:
   - `DATABASE_URL` — production PostgreSQL connection string
   - `NEXTAUTH_SECRET` — random secret string
   - `NEXTAUTH_URL` — production domain (e.g. `https://www.ciafeed.com`)
   - `NEXT_PUBLIC_APP_URL` — production domain (e.g. `https://www.ciafeed.com`)
   - `FIRECRAWL_API_KEY` — your Firecrawl API key
4. Run `npx prisma migrate deploy` against the production DB (one-time, from local with production `DATABASE_URL`).
5. Deploy — Vercel will automatically run `prisma generate && next build`.

## Project Structure

```
app/
  api/           # API routes (auth, vehicles, feeds)
  dashboard/     # Protected dealer dashboard
  login/         # Sign-in page
  signup/        # Sign-up page
  feeds/         # Public CSV feed route
lib/
  auth.ts        # NextAuth configuration
  prisma.ts      # Prisma client singleton
  scrape.ts      # Firecrawl scraping service
  vehicleMapper.ts  # Maps Firecrawl output to Vehicle schema
  csv.ts         # CSV serialization
  slug.ts        # Unique slug generation
  logger.ts      # Structured logging utilities
  checkSubscription.ts  # Stripe stub (always true in v1)
prisma/
  schema.prisma  # Database schema
  migrations/    # Migration history
```

## Feed URL Format

```
https://www.ciafeed.com/feeds/{dealer-slug}.csv
```

Compatible with Meta Catalog Manager → Automotive Inventory Ads.

## Operator Runbook: Dealer Meta Delivery Method Cutover

This section covers enabling, monitoring, and rolling back the `metaDeliveryMethod` transition from CSV to API for a dealer.

### Supported Verticals

API delivery is only supported for **automotive** and **services** verticals. Attempting to enable API mode for other verticals (e.g. realestate, ecommerce) will be rejected by both the profile and admin endpoints.

### Go / No-Go Checklist

Before switching a dealer to `api` mode, **every** item below must pass. If any item fails, do **not** proceed.

| # | Check | How to verify | Pass threshold |
|---|---|---|---|
| 1 | Vertical is supported | `GET /api/meta/inventory/status` — `readiness.supportedVertical` | `true` |
| 2 | Meta token present & valid | `readiness.tokenPresent` AND `readiness.tokenValid` | Both `true` |
| 3 | Token expiry headroom | `metaTokenExpiresAt` (from profile or status endpoint) | > 14 days from now |
| 4 | Catalog selected | `readiness.catalogSelected` | `true` |
| 5 | Pushable inventory exists | `inventoryCount` from status endpoint | > 0 |
| 6 | Circuit breaker clear | `circuit.blocked` from status endpoint | `false` |
| 7 | No active blocked jobs | `circuit.needsReconnect` from status endpoint | `false` |
| 8 | Queue healthy | `queue` from status endpoint — no stuck `processing` jobs | `queue` is `null` or `status` is `queued`/`retry` |
| 9 | CSV feed healthy | `GET /feeds/{dealer-slug}.csv` returns valid CSV with rows | HTTP 200, non-empty body |
| 10 | Refresh cron running | Check `/api/cron/refresh-meta-tokens` recent execution logs | Last success < 24h ago |

### Enablement

Switch the dealer to API mode via the admin endpoint:

```
PATCH /api/admin/dealers/{dealerId}/meta-delivery
Content-Type: application/json

{ "metaDeliveryMethod": "api" }
```

Alternatively, use the toggle button in the admin dashboard (visible per-dealer).

### Post-Enablement Verification

1. **Trigger a manual push** to confirm the pipeline works end-to-end:
   ```
   POST /api/meta/inventory/push
   ```
   This is a queue trigger. The response returns job acceptance metadata (`summary.accepted`, `summary.jobId`), not immediate delivery results. If a job is already pending, the trigger is coalesced and the response includes `summary.coalescedCount`.
2. **Verify outcomes via the status endpoint** — Check delivery results through:
   ```
   GET /api/meta/inventory/status
   ```
   Key fields to inspect:
   - `queue` — current job state (`queued`, `processing`, `retry`, or `null` when idle).
   - `lastRun` — most recent execution results including `lastRunStatus`, `itemsSucceeded`, `itemsFailed`, `deleteFailed`.
   - `circuit` — circuit breaker state (`blocked`, `needsReconnect`).
3. **Monitor observability signals** — After the first push, check:
   - `delivery_job_enqueued` — job was enqueued successfully (`outcome: "queued"`).
   - `queue` field — job transitions through `queued` → `processing` → `success`.
   - `lastRun.lastRunStatus` should be `"success"`, `lastRun.itemsFailed` should be `0`.
   - `circuit.blocked` — must remain `false`.
4. **Verify failure counts** — In the status endpoint response:
   - `lastRun.itemsFailed` must be `0`.
   - `lastRun.deleteFailed` must be `0` (or absent for first push).
   - If either is > 0, investigate before proceeding.

### Rollback

To revert a dealer back to CSV mode:

```
PATCH /api/admin/dealers/{dealerId}/meta-delivery
Content-Type: application/json

{ "metaDeliveryMethod": "csv" }
```

This immediately stops API pushes. The CSV feed at `/feeds/{dealer-slug}.csv` continues to serve inventory and Meta will resume pulling from it on its next scheduled fetch.

#### Emergency Rollback Verification Checklist

After issuing a rollback, verify each point before closing the incident:

| # | Verification step | Expected result |
|---|---|---|
| 1 | `PATCH` response | `{ "ok": true, "dealer": { "metaDeliveryMethod": "csv" } }` |
| 2 | `GET /api/meta/inventory/status` | `readiness.deliveryModeApi` is `false`, `deliveryMethod` is `"csv"` |
| 3 | Queue drain idle | `queue` is `null` (no active jobs) — existing in-flight jobs will be skipped on next drain since dealer mode is now CSV |
| 4 | CSV feed serving | `GET /feeds/{dealer-slug}.csv` returns HTTP 200 with valid inventory rows |
| 5 | Circuit breaker state | If `circuit.blocked` is `true`, the block is stale post-rollback and does not affect CSV mode. No action required unless re-enabling API later |
| 6 | No new delivery errors | Monitor logs for 15 minutes — no new `delivery_job_enqueue_exception` events for this dealer |

### Disconnect Recovery

If a dealer disconnects Meta entirely (`POST /api/fb/disconnect`), all Meta credentials are cleared and `metaDeliveryMethod` is automatically reset to `csv`. The dealer must re-complete the Meta Business Integration wizard before API mode can be re-enabled.

### Ownership & Workflow Notes

| Responsibility | Owner | Notes |
|---|---|---|
| Preflight checks & enablement | **Admin** (via admin dashboard or `PATCH /api/admin/dealers/{id}/meta-delivery`) | Requires `manage_delivery` capability via `adminGuard`: checked against `AdminAllowlist` (role-based), with legacy `ADMIN_EMAIL` env var as fallback. |
| Post-switch monitoring | **Admin / Support** | Check `/api/meta/inventory/status` `lastRun` and `circuit` fields within the first 24 hours after cutover. |
| Rollback decision | **Admin / Support** | If `lastRun.itemsFailed` > 0 on the manual push, `circuit.blocked` is `true`, or batch status shows errors, revert immediately to `csv`. |
| Token refresh monitoring | **Admin** | The cron at `/api/cron/refresh-meta-tokens` must be running. If tokens expire, API pushes will fail and the circuit breaker will block after 3 consecutive auth failures — requiring a rollback to CSV until the dealer re-authenticates. |
| Dealer self-service | **Dealer (Profile UI)** | Dealers on supported verticals (automotive, services) can toggle their own delivery method from Profile & Settings. Unsupported verticals see CSV-only with an explanatory message. Changes are audit-logged. |
