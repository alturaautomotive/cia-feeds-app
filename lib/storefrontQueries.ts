/**
 * Database queries that power the storefront pages. Kept separate so both
 * the dealer-home page (single-segment fallback) and the dedicated
 * /[slug]/[segment] page render off the same data shape.
 */
import { prisma } from "@/lib/prisma";
import type { Vertical } from "@/lib/verticals";

export interface SegmentInventory {
  vehicles: Array<{
    id: string;
    year: string | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    price: number | null;
    mileageValue: number | null;
    imageUrl: string | null;
    spotlightImageUrl: string | null;
    images: string[];
  }>;
  listings: Array<{
    id: string;
    title: string;
    price: number | null;
    imageUrls: string[];
    vertical: string;
  }>;
}

/**
 * Pull inventory for a segment. `take` caps each list; pass a generous
 * number on the segment page and a small number (e.g. 6) for the catalog
 * landing's per-segment preview.
 *
 * Filters mirror the original storefront behaviour: only active +
 * non-archived inventory, listings in a published-ish state.
 */
export async function getSegmentInventory(args: {
  dealerId: string;
  verticals: Vertical[];
  subAccountIds: string[];
  take: number;
}): Promise<SegmentInventory> {
  const { dealerId, verticals, subAccountIds, take } = args;

  const includesAutomotive = verticals.includes("automotive");
  const nonAutoVerticals = verticals.filter((v) => v !== "automotive");

  // For mixed bundles we run both queries; for single-vertical segments
  // one of the two short-circuits to an empty array.
  const [vehicles, listings] = await Promise.all([
    includesAutomotive
      ? prisma.vehicle.findMany({
          where: {
            dealerId,
            archivedAt: null,
            urlStatus: "active",
            scrapeStatus: { not: "failed" },
            ...(subAccountIds.length > 0
              ? { subAccountId: { in: subAccountIds } }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            year: true,
            make: true,
            model: true,
            trim: true,
            price: true,
            mileageValue: true,
            imageUrl: true,
            spotlightImageUrl: true,
            images: true,
          },
        })
      : Promise.resolve([]),
    nonAutoVerticals.length > 0
      ? prisma.listing.findMany({
          where: {
            dealerId,
            vertical: { in: nonAutoVerticals },
            archivedAt: null,
            // Real-estate inventory doesn't run the services publish workflow,
            // so we allow listings with no publishStatus through for those
            // verticals. Services keeps the original published-only filter.
            OR: [
              { vertical: "realestate" },
              { vertical: "ecommerce" },
              {
                vertical: "services",
                publishStatus: { in: ["published", "ready_to_publish", "validated"] },
              },
            ],
            ...(subAccountIds.length > 0
              ? { subAccountId: { in: subAccountIds } }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            title: true,
            price: true,
            imageUrls: true,
            vertical: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return { vehicles, listings };
}
