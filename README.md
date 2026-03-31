<<<<<<< HEAD
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
   - `NEXTAUTH_URL` — production domain (e.g. `https://app.ciafeeds.com`)
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
https://app.ciafeeds.com/feeds/{dealer-slug}.csv
```

Compatible with Meta Catalog Manager → Automotive Inventory Ads.
=======
# cia-feeds-app
>>>>>>> 86e0d7806680fc6e32d6905645389be2989badbc
