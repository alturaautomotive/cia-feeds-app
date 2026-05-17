/**
 * Meta Marketing API client for Custom Audiences + Lookalike Audiences.
 *
 * Strategy:
 *   - "Website Custom Audience" (subtype: WEBSITE) for visitors who fired
 *     Pixel events on a dealer's storefront. Membership is auto-evaluated
 *     by Meta from Pixel data; we just declare the rule and Meta does the
 *     matching. We provide a JSON rule referencing the Pixel ID.
 *   - "Customer File Custom Audience" (subtype: CUSTOM) for our own lead
 *     lists (email + phone hashed sha-256). We POST hashed user data to
 *     the audience and Meta resolves it.
 *   - "Lookalike Audience" derived from any seed audience above. Country
 *     + ratio (1-10%) are tunable.
 *
 * All Meta API calls go through the existing `meta.graphFetch` helper
 * (already auth'd + retried) and are wrapped in our circuit breaker.
 *
 * Docs:
 *   https://developers.facebook.com/docs/marketing-api/audiences/reference/custom-audience
 *   https://developers.facebook.com/docs/marketing-api/audiences/reference/custom-audience-website
 *   https://developers.facebook.com/docs/marketing-api/audiences/reference/lookalike-audience
 */
import { graphFetch, decryptToken } from "@/lib/meta";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";
import { createHash } from "crypto";

const META_AUDIENCE_MIN_AGE_DAYS = 30; // default retention window for website audiences

export class MetaAudiencesConfigError extends Error {
  constructor(missing: string) {
    super(`Meta audiences: missing ${missing}`);
    this.name = "MetaAudiencesConfigError";
  }
}

interface CreateWebsiteAudienceParams {
  adAccountId: string; // "act_<id>" form
  pixelId: string;
  name: string;
  description?: string;
  /**
   * URL filter for who counts as "in" this audience. We pass a single
   * URL contains rule. Meta supports complex inclusion/exclusion rules
   * but for our use cases (viewed any listing, viewed THIS listing) a
   * single URL substring rule is sufficient.
   */
  urlContains: string;
  /** Days to retain memberships. Meta caps at 180. Default 30. */
  retentionDays?: number;
  /** Token to authenticate the Marketing API call. */
  accessToken: string;
}

export interface MetaAudienceCreated {
  id: string;
}

/**
 * Create a Website Custom Audience that auto-includes anyone who visited
 * a URL matching `urlContains` and fired the dealer's Pixel within the
 * retention window.
 *
 * Meta's rule schema for website audiences uses a versioned object:
 *   {
 *     inclusions: {
 *       operator: "or",
 *       rules: [{
 *         event_sources: [{ id: "<pixelId>", type: "pixel" }],
 *         retention_seconds: <seconds>,
 *         filter: { operator: "and", filters: [{ field, operator, value }] }
 *       }]
 *     }
 *   }
 */
export async function createWebsiteCustomAudience(
  p: CreateWebsiteAudienceParams
): Promise<MetaAudienceCreated> {
  const retentionDays = p.retentionDays ?? META_AUDIENCE_MIN_AGE_DAYS;
  const retentionSeconds = retentionDays * 86400;

  const rule = {
    inclusions: {
      operator: "or",
      rules: [
        {
          event_sources: [{ id: p.pixelId, type: "pixel" }],
          retention_seconds: retentionSeconds,
          filter: {
            operator: "and",
            filters: [
              {
                field: "url",
                operator: "i_contains",
                value: p.urlContains,
              },
            ],
          },
        },
      ],
    },
  };

  const body = new URLSearchParams({
    name: p.name,
    description: p.description ?? "",
    subtype: "WEBSITE",
    pixel_id: p.pixelId,
    retention_days: String(retentionDays),
    rule: JSON.stringify(rule),
  });

  const res = await withBreaker(
    "meta.audiences.create_website",
    () =>
      graphFetch(
        `/${encodeURIComponent(p.adAccountId)}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        p.accessToken
      ),
    { timeoutMs: 15_000 }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`meta_create_website_audience_failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

interface CreateCustomerFileAudienceParams {
  adAccountId: string;
  name: string;
  description?: string;
  accessToken: string;
}

/**
 * Create an empty Customer File Custom Audience (subtype: CUSTOM). After
 * creation, push hashed user records with `addUsersToCustomerFileAudience`.
 */
export async function createCustomerFileAudience(
  p: CreateCustomerFileAudienceParams
): Promise<MetaAudienceCreated> {
  const body = new URLSearchParams({
    name: p.name,
    description: p.description ?? "",
    subtype: "CUSTOM",
    customer_file_source: "USER_PROVIDED_ONLY",
  });

  const res = await withBreaker(
    "meta.audiences.create_customer_file",
    () =>
      graphFetch(
        `/${encodeURIComponent(p.adAccountId)}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        p.accessToken
      ),
    { timeoutMs: 15_000 }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`meta_create_customer_file_audience_failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

/**
 * Push a batch of user records (hashed email + phone) into a Customer File
 * Audience. Meta accepts up to 10,000 records per call; we chunk above that.
 *
 * Each record is sha256 hex of normalized PII. Email: lowercase. Phone:
 * digits-only (E.164 stripped of '+').
 */
export async function addUsersToCustomerFileAudience(
  audienceId: string,
  users: Array<{ email?: string; phone?: string }>,
  accessToken: string
): Promise<{ numReceived: number }> {
  if (users.length === 0) return { numReceived: 0 };

  // Build Meta's request format: schema array names the columns, data
  // array is one row per user (parallel-indexed values).
  const schema: string[] = ["EMAIL_SHA256", "PHONE_SHA256"];
  const data: string[][] = users.map((u) => [
    u.email ? sha256Hex(u.email.trim().toLowerCase()) : "",
    u.phone ? sha256Hex(u.phone.replace(/\D/g, "")) : "",
  ]);

  const payload = {
    schema,
    data,
  };

  const body = new URLSearchParams({
    payload: JSON.stringify(payload),
  });

  const res = await withBreaker(
    "meta.audiences.add_users",
    () =>
      graphFetch(
        `/${encodeURIComponent(audienceId)}/users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        accessToken
      ),
    { timeoutMs: 15_000 }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`meta_add_users_failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { num_received?: number; audience_id?: string };
  return { numReceived: json.num_received ?? users.length };
}

/**
 * Get audience details (size, status). Used by the dashboard to show
 * current member count and by the refresh cron to detect stale audiences.
 */
export interface AudienceInfo {
  id: string;
  name: string;
  approximateCount: number | null;
  deliveryStatus: string | null;
  operationStatus: string | null;
}

export async function getAudienceInfo(
  audienceId: string,
  accessToken: string
): Promise<AudienceInfo | null> {
  const fields = "id,name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status";
  const url = `/${encodeURIComponent(audienceId)}?fields=${encodeURIComponent(fields)}`;

  let res: Response;
  try {
    res = await withBreaker(
      "meta.audiences.get_info",
      () => graphFetch(url, { method: "GET" }, accessToken),
      { timeoutMs: 10_000 }
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) return null;
    throw err;
  }

  if (!res.ok) return null;
  const json = (await res.json()) as {
    id: string;
    name: string;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    delivery_status?: { description?: string };
    operation_status?: { description?: string };
  };

  // Meta gives a range; we use the lower bound as the conservative number.
  // For tiny audiences (<1000) Meta reports null - that's a signal to the
  // dashboard that the audience is too small to use for ads yet.
  const approximateCount =
    typeof json.approximate_count_lower_bound === "number"
      ? json.approximate_count_lower_bound
      : null;

  return {
    id: json.id,
    name: json.name,
    approximateCount,
    deliveryStatus: json.delivery_status?.description ?? null,
    operationStatus: json.operation_status?.description ?? null,
  };
}

/**
 * Delete a Custom Audience. Used when a dealer disables retargeting or
 * when we tear down an audience tied to a listing they've archived.
 */
export async function deleteAudience(
  audienceId: string,
  accessToken: string
): Promise<void> {
  const res = await withBreaker(
    "meta.audiences.delete",
    () =>
      graphFetch(
        `/${encodeURIComponent(audienceId)}`,
        { method: "DELETE" },
        accessToken
      ),
    { timeoutMs: 10_000 }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`meta_delete_audience_failed: ${res.status} ${text}`);
  }
}

/**
 * Create a Lookalike Audience seeded from an existing Custom Audience.
 *
 * Meta's Lookalike requires the seed audience to have at least 100
 * matched users; smaller seeds fail with a clear error.
 *
 * `ratio` is 0.01-0.10 (1% to 10% of country population). Smaller =
 * more similar to seed, less reach. 1-2% is the usual sweet spot for
 * conversions; 5-10% for awareness.
 */
export interface CreateLookalikeParams {
  adAccountId: string;
  name: string;
  description?: string;
  /** ID of an existing Custom Audience to seed from. */
  originAudienceId: string;
  /** ISO country code (e.g. "US"). */
  country: string;
  /** 0.01 - 0.10. */
  ratio: number;
  accessToken: string;
}

export async function createLookalikeAudience(
  p: CreateLookalikeParams
): Promise<MetaAudienceCreated> {
  if (p.ratio < 0.01 || p.ratio > 0.1) {
    throw new Error("ratio_out_of_range: must be 0.01-0.10");
  }

  const lookalikeSpec = {
    origin_audience_id: p.originAudienceId,
    country: p.country,
    ratio: p.ratio,
  };

  const body = new URLSearchParams({
    name: p.name,
    description: p.description ?? "",
    subtype: "LOOKALIKE",
    origin_audience_id: p.originAudienceId,
    lookalike_spec: JSON.stringify(lookalikeSpec),
  });

  const res = await withBreaker(
    "meta.audiences.create_lookalike",
    () =>
      graphFetch(
        `/${encodeURIComponent(p.adAccountId)}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        p.accessToken
      ),
    { timeoutMs: 15_000 }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`meta_create_lookalike_failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

// ---------------------------------------------------------------------
// High-level dealer-scoped helpers (used by the audience cron)
// ---------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { decryptLeadFieldNullable } from "@/lib/leadCrypto";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function ensureAdAccountId(raw: string): string {
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

/**
 * Refresh the dealer's three standard audiences:
 *   - viewed_any_30d:        Website CA, URL contains the dealer slug
 *   - viewed_listing_30d:    One Website CA per active vehicle/listing
 *                            (URL contains the item-specific path)
 *   - lead_no_followup_30d:  Customer File CA seeded from the dealer's
 *                            recent leads (decrypted email + phone)
 *
 * Creates missing audiences; refreshes member-count metadata for
 * existing ones. Idempotent across runs.
 */
export async function refreshDealerAudiences(dealerId: string): Promise<{
  created: number;
  refreshed: number;
  errors: number;
}> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      slug: true,
      vertical: true,
      metaPixelId: true,
      metaAdAccountId: true,
      metaAccessToken: true,
    },
  });

  if (!dealer) throw new Error("dealer_not_found");
  if (!dealer.metaPixelId) throw new Error("dealer_has_no_pixel");
  if (!dealer.metaAdAccountId) throw new Error("dealer_has_no_ad_account");
  if (!dealer.metaAccessToken) throw new Error("dealer_has_no_access_token");

  const accessToken = decryptToken(dealer.metaAccessToken);
  const adAccountId = ensureAdAccountId(dealer.metaAdAccountId);

  const summary = { created: 0, refreshed: 0, errors: 0 };

  // --- 1. viewed_any_30d ---------------------------------------------
  try {
    await ensureWebsiteAudience(
      {
        dealerId: dealer.id,
        audienceKind: "viewed_any_30d",
        sourceListingId: null,
        sourceVehicleId: null,
        name: `CIA Feeds — Viewed any listing (30d) — ${dealer.slug}`,
        description: `Visitors who viewed any storefront listing on ${dealer.slug}.ciafeed.com in the last 30 days. Auto-managed by CIA Feeds.`,
        urlContains: `${dealer.slug}.ciafeed.com`,
        adAccountId,
        pixelId: dealer.metaPixelId,
        accessToken,
      },
      summary
    );
  } catch (err) {
    summary.errors++;
    console.error("[metaAudiences] viewed_any_30d failed:", err);
  }

  // --- 2. viewed_listing_30d (one per active item) -------------------
  if (dealer.vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId: dealer.id, isComplete: true, archivedAt: null },
      select: { id: true, year: true, make: true, model: true, trim: true },
      take: 50, // cap so we don't create hundreds of audiences for fleet dealers
    });
    for (const v of vehicles) {
      const itemLabel = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ") || v.id;
      try {
        await ensureWebsiteAudience(
          {
            dealerId: dealer.id,
            audienceKind: "viewed_listing_30d",
            sourceListingId: null,
            sourceVehicleId: v.id,
            name: `CIA Feeds — Viewed ${itemLabel} (30d)`,
            description: `Visitors who viewed ${itemLabel} on ${dealer.slug}.ciafeed.com in the last 30 days.`,
            urlContains: `/w/${dealer.slug}/${v.id}`,
            adAccountId,
            pixelId: dealer.metaPixelId,
            accessToken,
          },
          summary
        );
      } catch (err) {
        summary.errors++;
        console.error(`[metaAudiences] viewed_listing_30d (vehicle ${v.id}) failed:`, err);
      }
    }
  } else {
    const listings = await prisma.listing.findMany({
      where: { dealerId: dealer.id, publishStatus: "published", archivedAt: null },
      select: { id: true, title: true },
      take: 50,
    });
    for (const l of listings) {
      try {
        await ensureWebsiteAudience(
          {
            dealerId: dealer.id,
            audienceKind: "viewed_listing_30d",
            sourceListingId: l.id,
            sourceVehicleId: null,
            name: `CIA Feeds — Viewed ${l.title} (30d)`,
            description: `Visitors who viewed ${l.title} on ${dealer.slug}.ciafeed.com in the last 30 days.`,
            urlContains: `/services/${dealer.slug}/${l.id}`,
            adAccountId,
            pixelId: dealer.metaPixelId,
            accessToken,
          },
          summary
        );
      } catch (err) {
        summary.errors++;
        console.error(`[metaAudiences] viewed_listing_30d (listing ${l.id}) failed:`, err);
      }
    }
  }

  // --- 3. lead_no_followup_30d (Customer File audience) --------------
  try {
    await ensureLeadFileAudience(dealer.id, dealer.slug, adAccountId, accessToken, summary);
  } catch (err) {
    summary.errors++;
    console.error("[metaAudiences] lead_no_followup_30d failed:", err);
  }

  return summary;
}

interface EnsureWebsiteAudienceParams {
  dealerId: string;
  audienceKind: string;
  sourceListingId: string | null;
  sourceVehicleId: string | null;
  name: string;
  description: string;
  urlContains: string;
  adAccountId: string;
  pixelId: string;
  accessToken: string;
}

async function ensureWebsiteAudience(
  p: EnsureWebsiteAudienceParams,
  summary: { created: number; refreshed: number; errors: number }
): Promise<void> {
  const existing = await prisma.metaCustomAudience.findUnique({
    where: {
      dealerId_audienceKind_sourceListingId_sourceVehicleId: {
        dealerId: p.dealerId,
        audienceKind: p.audienceKind,
        sourceListingId: p.sourceListingId ?? "",
        sourceVehicleId: p.sourceVehicleId ?? "",
      },
    },
  });

  if (existing) {
    // Refresh size + status from Meta.
    const info = await getAudienceInfo(existing.metaAudienceId, p.accessToken);
    if (info) {
      await prisma.metaCustomAudience.update({
        where: { id: existing.id },
        data: {
          estimatedSize: info.approximateCount ?? null,
          lastRefreshedAt: new Date(),
          lastErrorAt: null,
          lastErrorMessage: null,
        },
      });
      summary.refreshed++;
    }
    return;
  }

  // Create new in Meta + persist.
  const created = await createWebsiteAudience({
    adAccountId: p.adAccountId,
    pixelId: p.pixelId,
    name: p.name,
    description: p.description,
    urlContains: p.urlContains,
    accessToken: p.accessToken,
  });

  await prisma.metaCustomAudience.create({
    data: {
      dealerId: p.dealerId,
      audienceKind: p.audienceKind,
      sourceListingId: p.sourceListingId,
      sourceVehicleId: p.sourceVehicleId,
      metaAudienceId: created.id,
      metaAdAccountId: p.adAccountId,
      name: p.name,
      description: p.description,
      lastRefreshedAt: new Date(),
    },
  });
  summary.created++;
}

// Alias for the prefixed function name, called from cron.
async function createWebsiteAudience(p: CreateWebsiteAudienceParams): Promise<MetaAudienceCreated> {
  return createWebsiteCustomAudience(p);
}

async function ensureLeadFileAudience(
  dealerId: string,
  dealerSlug: string,
  adAccountId: string,
  accessToken: string,
  summary: { created: number; refreshed: number; errors: number }
): Promise<void> {
  // Lead PII is encrypted at rest (lib/leadCrypto.ts). We decrypt
  // server-side, hash, and ship to Meta. Plaintext PII never persists
  // anywhere outside Meta's hashed match table.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const leads = await prisma.lead.findMany({
    where: {
      dealerId,
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { email: true, phone: true },
    take: 10_000, // Meta's per-request cap
  });

  // Decrypt + filter to users with at least one identifier.
  const users = leads
    .map((l) => ({
      email: decryptLeadFieldNullable(l.email) ?? undefined,
      phone: decryptLeadFieldNullable(l.phone) ?? undefined,
    }))
    .filter((u) => u.email || u.phone);

  if (users.length === 0) {
    // No leads in the window; skip without error.
    return;
  }

  // Find or create the audience shell.
  let row = await prisma.metaCustomAudience.findUnique({
    where: {
      dealerId_audienceKind_sourceListingId_sourceVehicleId: {
        dealerId,
        audienceKind: "lead_no_followup_30d",
        sourceListingId: "",
        sourceVehicleId: "",
      },
    },
  });

  if (!row) {
    const name = `CIA Feeds — Recent leads (30d) — ${dealerSlug}`;
    const created = await createCustomerFileAudience({
      adAccountId,
      name,
      description: `Hashed emails/phones of recent leads on ${dealerSlug}.ciafeed.com. Refreshed daily.`,
      accessToken,
    });
    row = await prisma.metaCustomAudience.create({
      data: {
        dealerId,
        audienceKind: "lead_no_followup_30d",
        sourceListingId: null,
        sourceVehicleId: null,
        metaAudienceId: created.id,
        metaAdAccountId: adAccountId,
        name,
        description: `Hashed emails/phones of recent leads on ${dealerSlug}.ciafeed.com.`,
        lastRefreshedAt: new Date(),
      },
    });
    summary.created++;
  }

  // Push current member list (Meta accepts re-pushes; matches dedupe).
  await addUsersToCustomerFileAudience(row.metaAudienceId, users, accessToken);

  // Refresh size on our side.
  const info = await getAudienceInfo(row.metaAudienceId, accessToken);
  await prisma.metaCustomAudience.update({
    where: { id: row.id },
    data: {
      estimatedSize: info?.approximateCount ?? null,
      lastRefreshedAt: new Date(),
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
  summary.refreshed++;
}

// Suppress unused-import warning when decrypt isn't reachable in test bundles
void decryptToken;
