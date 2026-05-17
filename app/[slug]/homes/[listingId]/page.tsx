import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantBySlug } from "@/lib/tenant";

export const revalidate = 60;

/**
 * Real-estate listing detail. Today the detail UI for non-automotive listings
 * lives at /<slug>/services/[listingId] (it was originally services-only and
 * then widened to handle realestate + ecommerce in d498152). Rather than
 * duplicate the component, we render `/homes/<id>` as a 308 redirect to the
 * existing route. Eventually the detail UI gets factored into a per-vertical
 * page \u2014 this keeps the public URL clean (`/homes/<id>`) for now without
 * forking the component.
 */
export default async function HomeListingDetail({
  params,
}: {
  params: Promise<{ slug: string; listingId: string }>;
}) {
  const { slug, listingId } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const exists = await prisma.listing.findFirst({
    where: {
      id: listingId,
      dealerId: tenant.id,
      vertical: "realestate",
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!exists) notFound();

  // 308 = permanent redirect, preserves method (we only handle GET here).
  redirect(`/${slug}/services/${listingId}`);
}
