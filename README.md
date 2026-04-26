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

### Preflight Checklist

Before switching a dealer to `api` mode:

1. **Verify vertical** — Confirm the dealer's vertical is `automotive` or `services`.
2. **Check Meta connection** — Dealer must have a valid `metaAccessToken`, `metaCatalogId`, and `metaBusinessId`. Use the status endpoint:
   ```
   GET /api/meta/inventory/status
   ```
   All `readiness` fields should be `true` before proceeding.
3. **Validate CSV feed** — Ensure the current CSV feed is healthy by fetching:
   ```
   GET /feeds/{dealer-slug}.csv
   ```
   Confirm the feed returns a valid CSV with inventory rows.
4. **Confirm token expiry** — Check `metaTokenExpiresAt` is not imminent (>14 days out). The refresh cron (`/api/cron/refresh-meta-tokens`) handles renewal, but verify it has been running successfully.
5. **Inventory count** — The status endpoint returns `inventoryCount`. Ensure it is > 0.

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
   The response includes a `summary` with `itemsSucceeded`, `itemsFailed`, and batch `handles`.
2. **Poll batch status** — Use the handle(s) returned:
   ```
   GET /api/meta/inventory/status?handle={handle}
   ```
3. **Monitor logs** — Look for `deliver_feed_success` / `deliver_feed_error` structured log events.

### Rollback

To revert a dealer back to CSV mode:

```
PATCH /api/admin/dealers/{dealerId}/meta-delivery
Content-Type: application/json

{ "metaDeliveryMethod": "csv" }
```

This immediately stops API pushes. The CSV feed at `/feeds/{dealer-slug}.csv` continues to serve inventory and Meta will resume pulling from it on its next scheduled fetch.

### Disconnect Recovery

If a dealer disconnects Meta entirely (`POST /api/fb/disconnect`), all Meta credentials are cleared and `metaDeliveryMethod` is automatically reset to `csv`. The dealer must re-complete the Meta Business Integration wizard before API mode can be re-enabled.

### Ownership & Workflow Notes

| Responsibility | Owner | Notes |
|---|---|---|
| Preflight checks & enablement | **Admin** (via admin dashboard or `PATCH /api/admin/dealers/{id}/meta-delivery`) | Only the `ADMIN_EMAIL` account can toggle delivery method for other dealers. |
| Post-switch monitoring | **Admin / Support** | Watch for `deliver_feed_error` log events within the first 24 hours after cutover. |
| Rollback decision | **Admin / Support** | If `itemsFailed` > 0 on the manual push or batch status shows errors, revert immediately to `csv`. |
| Token refresh monitoring | **Admin** | The cron at `/api/cron/refresh-meta-tokens` must be running. If tokens expire, API pushes will fail silently and require a rollback to CSV until the dealer re-authenticates. |
| Dealer self-service | **Dealer (Profile UI)** | Dealers on supported verticals (automotive, services) can toggle their own delivery method from Profile & Settings. Unsupported verticals see CSV-only with an explanatory message. |
