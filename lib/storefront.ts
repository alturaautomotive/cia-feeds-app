/**
 * Storefront URL resolution for multi-vertical / bundled mini-sites.
 *
 * Mental model
 * ------------
 * A Dealer has 1+ SubAccount rows, each with a vertical (automotive,
 * realestate, services, ecommerce). The Dealer also has 0+ StorefrontBundle
 * rows. A SubAccount is either:
 *
 *   - standalone (bundleId = null) → rendered on its own page
 *   - in exactly one bundle → rendered together with the other members
 *     of that bundle on the bundle's page
 *
 * The dealer's storefront layout is therefore a list of "segments". Each
 * segment is either:
 *
 *   - a single standalone SubAccount, addressed by its vertical slug
 *     (e.g. /beaver-toyota/realestate)
 *   - a Bundle, addressed by its slug (e.g. /beaver-toyota/lifestyle)
 *
 * The visitor lands on /<dealer-slug>. If the dealer has only one segment,
 * we render its inventory directly. If there are multiple segments, we
 * render a catalog landing page with one button per segment.
 *
 * URL builders
 * ------------
 * Each Listing and Vehicle has a `subAccountId`. To get its public URL we:
 *   1. Look up the sub-account's bundleId (null = standalone)
 *   2. Resolve the segment slug:
 *        - bundle → bundle.slug
 *        - standalone → sub-account's vertical name
 *   3. Build `/<dealer-slug>/<segment-slug>/<entity-id>`
 *
 * Storefront URLs use `dealer.customDomain` when set, otherwise
 * `https://<dealer-slug>.ciafeed.com`.
 */
import { prisma } from "@/lib/prisma";
import type { Vertical } from "@/lib/verticals";

// ---------------------------------------------------------------------------
// Segment vocabulary
// ---------------------------------------------------------------------------

/**
 * URL segment slugs we use for standalone sub-accounts. These are reserved
 * across all dealers, so bundles MUST NOT use these slugs. Validated in
 * createBundle().
 */
// Segment slugs match the existing legacy paths for verticals that already
// have detail routes in the storefront (vehicles, services), so deep links
// from old Meta ads keep working. New verticals use whatever feels natural.
export const VERTICAL_SEGMENT_SLUGS: Record<Vertical, string> = {
  automotive: "vehicles",
  realestate: "homes",
  services: "services",
  ecommerce: "shop",
};

/** Reverse map: segment slug → vertical. Used when resolving inbound URLs. */
export const SEGMENT_TO_VERTICAL: Record<string, Vertical> = Object.entries(
  VERTICAL_SEGMENT_SLUGS
).reduce(
  (acc, [vert, seg]) => {
    acc[seg] = vert as Vertical;
    return acc;
  },
  {} as Record<string, Vertical>
);

/**
 * Slugs a dealer can never use for a custom bundle, because they collide
 * with vertical segments or with built-in routes inside the storefront.
 */
export const RESERVED_BUNDLE_SLUGS = new Set<string>([
  ...Object.values(VERTICAL_SEGMENT_SLUGS),
  // Built-in storefront subpages (none today, listed for forward-safety).
  "lead",
  "leads",
  "contact",
  "about",
  "search",
  "api",
]);

// ---------------------------------------------------------------------------
// Storefront layout
// ---------------------------------------------------------------------------

export interface StorefrontSegment {
  /** Path segment after /<dealer-slug>. */
  slug: string;
  /** Visitor-facing label for the catalog button. */
  name: string;
  /**
   * Catalog kind hint for the home grid card. "single" → render a verticals
   * thumbnail; "bundle" → render the bundle's combined label.
   */
  kind: "single" | "bundle";
  /** Verticals included in this segment. */
  verticals: Vertical[];
  /** Sub-accounts that contribute inventory to this segment. */
  subAccountIds: string[];
  /** Optional description rendered under the button (bundles only). */
  description?: string | null;
}

export interface StorefrontLayout {
  dealerId: string;
  segments: StorefrontSegment[];
}

/**
 * Compute the segment list for a dealer. Bundles aggregate their members.
 * Standalone sub-accounts each become their own segment. Sub-accounts that
 * share a vertical AND are not bundled get merged into a single segment so
 * we don't end up with "Autos #1 / Autos #2" buttons — they share a vertical
 * page (the sub-account switcher in the dashboard remains the authoritative
 * way to manage two automotive sub-accounts; the storefront treats them as
 * one combined inventory).
 */
export async function getStorefrontLayout(
  dealerId: string
): Promise<StorefrontLayout> {
  const [subAccounts, bundles] = await Promise.all([
    prisma.subAccount.findMany({
      where: { dealerId },
      select: { id: true, name: true, vertical: true, bundleId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.storefrontBundle.findMany({
      where: { dealerId },
      select: { id: true, slug: true, name: true, description: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const bundleById = new Map(bundles.map((b) => [b.id, b]));
  const bundleMembers = new Map<string, typeof subAccounts>();
  const standaloneByVertical = new Map<Vertical, typeof subAccounts>();

  for (const sa of subAccounts) {
    if (sa.bundleId && bundleById.has(sa.bundleId)) {
      const arr = bundleMembers.get(sa.bundleId) ?? [];
      arr.push(sa);
      bundleMembers.set(sa.bundleId, arr);
    } else {
      const v = sa.vertical as Vertical;
      const arr = standaloneByVertical.get(v) ?? [];
      arr.push(sa);
      standaloneByVertical.set(v, arr);
    }
  }

  const segments: StorefrontSegment[] = [];

  // Emit bundles first (they're explicit groupings).
  for (const b of bundles) {
    const members = bundleMembers.get(b.id) ?? [];
    if (members.length === 0) continue; // empty bundle → skip
    segments.push({
      slug: b.slug,
      name: b.name,
      kind: "bundle",
      verticals: Array.from(
        new Set(members.map((m) => m.vertical as Vertical))
      ),
      subAccountIds: members.map((m) => m.id),
      description: b.description ?? null,
    });
  }

  // Then standalone verticals, in a stable order so the home page doesn't
  // shuffle on every render.
  const orderedVerticals: Vertical[] = ["automotive", "realestate", "services", "ecommerce"];
  for (const v of orderedVerticals) {
    const members = standaloneByVertical.get(v);
    if (!members || members.length === 0) continue;
    segments.push({
      slug: VERTICAL_SEGMENT_SLUGS[v],
      name: verticalDisplayName(v),
      kind: "single",
      verticals: [v],
      subAccountIds: members.map((m) => m.id),
    });
  }

  return { dealerId, segments };
}

function verticalDisplayName(v: Vertical): string {
  switch (v) {
    case "automotive":
      return "Vehicles";
    case "realestate":
      return "Properties";
    case "services":
      return "Services";
    case "ecommerce":
      return "Shop";
  }
}

// ---------------------------------------------------------------------------
// Segment lookup (used by /[slug]/[segment]/page.tsx)
// ---------------------------------------------------------------------------

export interface ResolvedSegment extends StorefrontSegment {
  dealerId: string;
}

/**
 * Resolve a /<dealer-slug>/<segment> URL to the segment it refers to.
 *
 * `segment` may be:
 *   - a bundle slug (matches StorefrontBundle.slug for this dealer)
 *   - a vertical segment slug (autos / homes / services / shop)
 *
 * Returns null if no match \u2014 caller should 404.
 */
export async function resolveSegment(
  dealerId: string,
  segment: string
): Promise<ResolvedSegment | null> {
  const segmentLower = segment.toLowerCase();

  // First try bundles (explicit) so a bundle named "autos" would win, but
  // RESERVED_BUNDLE_SLUGS prevents that on the write path.
  const bundle = await prisma.storefrontBundle.findFirst({
    where: { dealerId, slug: segmentLower },
    include: {
      subAccounts: {
        select: { id: true, vertical: true },
      },
    },
  });
  if (bundle) {
    return {
      dealerId,
      slug: bundle.slug,
      name: bundle.name,
      kind: "bundle",
      verticals: Array.from(
        new Set(bundle.subAccounts.map((s) => s.vertical as Vertical))
      ),
      subAccountIds: bundle.subAccounts.map((s) => s.id),
      description: bundle.description,
    };
  }

  // Otherwise check if it's a vertical segment.
  const vertical = SEGMENT_TO_VERTICAL[segmentLower];
  if (!vertical) return null;

  const standaloneSubs = await prisma.subAccount.findMany({
    where: { dealerId, vertical, bundleId: null },
    select: { id: true, name: true },
  });
  if (standaloneSubs.length === 0) return null;

  return {
    dealerId,
    slug: segmentLower,
    name: verticalDisplayName(vertical),
    kind: "single",
    verticals: [vertical],
    subAccountIds: standaloneSubs.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

export interface StorefrontUrlContext {
  dealerSlug: string;
  customDomain: string | null;
}

/** Returns the base origin for the storefront (custom domain when set). */
export function storefrontOrigin(ctx: StorefrontUrlContext): string {
  if (ctx.customDomain) {
    const clean = ctx.customDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${clean}`;
  }
  return `https://${ctx.dealerSlug}.ciafeed.com`;
}

/**
 * Build the segment URL for a sub-account. If the sub-account is in a
 * bundle, the segment slug is the bundle's slug; otherwise it's the
 * vertical's segment slug.
 *
 * Used everywhere the dashboard needs to deep-link to the storefront
 * (e.g. the "View live site" button when a specific sub-account is active).
 */
export async function buildSegmentUrlForSubAccount(
  subAccountId: string,
  ctx: StorefrontUrlContext
): Promise<string> {
  const sub = await prisma.subAccount.findUnique({
    where: { id: subAccountId },
    select: {
      vertical: true,
      bundle: { select: { slug: true } },
    },
  });
  if (!sub) return storefrontOrigin(ctx);
  const segmentSlug =
    sub.bundle?.slug ?? VERTICAL_SEGMENT_SLUGS[sub.vertical as Vertical];
  return `${storefrontOrigin(ctx)}/${segmentSlug}`;
}

/**
 * Synchronous variant for use when you already have the sub-account's
 * vertical + bundle info loaded. Mirrors buildSegmentUrlForSubAccount.
 */
export function buildSegmentUrlSync(
  ctx: StorefrontUrlContext,
  sub: { vertical: string; bundle: { slug: string } | null }
): string {
  const segmentSlug =
    sub.bundle?.slug ??
    VERTICAL_SEGMENT_SLUGS[sub.vertical as Vertical] ??
    sub.vertical;
  return `${storefrontOrigin(ctx)}/${segmentSlug}`;
}

/**
 * Build the full storefront URL for a single listing/vehicle. This is what
 * gets emitted into Meta catalog feeds as the `url` / `link` column.
 *
 * Pass `subAccount` pre-loaded (with optional bundle.slug) to avoid a
 * round-trip per entity in batch operations like csv serialization.
 */
export function buildListingUrl(
  ctx: StorefrontUrlContext,
  sub: { vertical: string; bundle: { slug: string } | null } | null,
  vertical: string,
  entityKind: "listing" | "vehicle",
  entityId: string
): string {
  const segment =
    sub?.bundle?.slug ??
    VERTICAL_SEGMENT_SLUGS[(sub?.vertical ?? vertical) as Vertical] ??
    vertical;
  // Vehicles and listings keep their existing detail paths under the segment.
  // Detail page resolution stays the same \u2014 only the storefront homepage
  // structure changes \u2014 so we route through the segment then the entity id.
  const kindPath = entityKind === "vehicle" ? "vehicles" : "listings";
  return `${storefrontOrigin(ctx)}/${segment}/${kindPath}/${entityId}`;
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Request-aware link helpers
// ---------------------------------------------------------------------------

/**
 * Determine the base path to prefix on storefront <Link> hrefs based on the
 * incoming request host.
 *
 * The proxy (proxy.ts) rewrites subdomain + custom-domain hosts to
 * /<slug>/<path> internally. So pages always render under /<slug>/* on the
 * server side, but the URL bar shows just /* on the subdomain. If we emit
 * `/${slug}/vehicles` as a link, clicking it from beaver-toyota.ciafeed.com
 * navigates to beaver-toyota.ciafeed.com/beaver-toyota/vehicles — the proxy
 * then re-prepends the slug, producing /beaver-toyota/beaver-toyota/vehicles
 * which 404s.
 *
 * Pass the request host (read via `next/headers` headers().get("host")) and
 * the dealer slug; this returns:
 *   - ""           when the request came in via the subdomain or a custom
 *                  domain (links should be root-relative: /vehicles, /homes)
 *   - "/<slug>"    when the request is on the apex (www.ciafeed.com or
 *                  localhost) and links must include the slug
 */
export function storefrontBasePath(
  host: string | null | undefined,
  dealerSlug: string
): string {
  if (!host) return `/${dealerSlug}`;
  const lowered = host.toLowerCase();
  // Apex / dev hosts — render full /<slug>/<path> links.
  if (
    lowered === "ciafeed.com" ||
    lowered === "www.ciafeed.com" ||
    lowered === "localhost" ||
    lowered.startsWith("localhost:") ||
    lowered.endsWith(".vercel.app")
  ) {
    return `/${dealerSlug}`;
  }
  // Subdomain or custom domain — proxy already adds the slug, so links must
  // be root-relative.
  return "";
}

/** Normalise free-text into a URL slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** True if `slug` is a valid bundle slug (format + not reserved). */
export function isValidBundleSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 50) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return false;
  if (RESERVED_BUNDLE_SLUGS.has(slug)) return false;
  return true;
}
