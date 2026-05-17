import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { getTenantBySlug } from "@/lib/tenant";
import { resolveSegment, storefrontBasePath } from "@/lib/storefront";
import { getSegmentInventory } from "@/lib/storefrontQueries";
import PixelInitializer from "@/app/components/PixelInitializer";

export const revalidate = 60;
const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; segment: string }>;
}): Promise<Metadata> {
  const { slug, segment } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { title: "Not found" };
  const seg = await resolveSegment(tenant.id, segment);
  if (!seg) return { title: "Not found" };
  return {
    title: `${seg.name} — ${tenant.name}`,
    description: `Browse ${seg.name.toLowerCase()} at ${tenant.name}.`,
    openGraph: {
      title: `${seg.name} — ${tenant.name}`,
      siteName: tenant.name,
    },
  };
}

export default async function SegmentPage({
  params,
}: {
  params: Promise<{ slug: string; segment: string }>;
}) {
  const { slug, segment } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  let seg;
  try {
    seg = await resolveSegment(tenant.id, segment);
  } catch (err) {
    console.error({
      event: "segment_resolve_error",
      slug,
      segment,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  if (!seg) notFound();

  // Host-aware link base path — see lib/storefront.storefrontBasePath().
  const reqHeaders = await headers();
  const basePath = storefrontBasePath(reqHeaders.get("host"), tenant.slug);

  let inventory;
  try {
    inventory = await getSegmentInventory({
      dealerId: tenant.id,
      verticals: seg.verticals,
      subAccountIds: seg.subAccountIds,
      take: PAGE_SIZE,
    });
  } catch (err) {
    console.error({
      event: "segment_inventory_error",
      slug,
      segment,
      verticals: seg.verticals,
      subAccountIds: seg.subAccountIds,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const hasVehicles = inventory.vehicles.length > 0;
  const hasListings = inventory.listings.length > 0;
  const isEmpty = !hasVehicles && !hasListings;

  return (
    <div>
      {tenant.metaPixelId && <PixelInitializer pixelId={tenant.metaPixelId} />}

      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "48px 20px 24px",
        }}
      >
        <nav style={{ marginBottom: 12, fontSize: 14, opacity: 0.65 }}>
          <Link href={basePath || "/"} style={{ textDecoration: "underline" }}>
            ← All catalogs
          </Link>
        </nav>
        <h1
          style={{
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800,
            margin: 0,
          }}
        >
          {seg.name}
        </h1>
        {seg.description && (
          <p
            style={{
              fontSize: 16,
              marginTop: 10,
              opacity: 0.75,
              maxWidth: 760,
            }}
          >
            {seg.description}
          </p>
        )}
      </section>

      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "8px 20px 80px",
        }}
      >
        {isEmpty && (
          <div
            className="sf-card"
            style={{
              padding: 48,
              textAlign: "center",
              opacity: 0.7,
              fontSize: 16,
            }}
          >
            Nothing here yet — check back soon.
          </div>
        )}

        {(hasVehicles || hasListings) && (
          <div className="sf-grid">
            {inventory.vehicles.map((v) => {
              const title = [v.year, v.make, v.model, v.trim]
                .filter(Boolean)
                .join(" ");
              const img =
                v.spotlightImageUrl ||
                v.imageUrl ||
                v.images?.[0] ||
                null;
              return (
                <Link
                  key={`v-${v.id}`}
                  href={`${basePath}/vehicles/${v.id}`}
                  className="sf-card"
                  style={{ display: "block" }}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={title}
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        background: "var(--brand-accent)",
                      }}
                    />
                  )}
                  <div style={{ padding: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {title || "Vehicle"}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 14,
                        opacity: 0.7,
                        display: "flex",
                        gap: 10,
                      }}
                    >
                      {v.price != null && (
                        <span>${v.price.toLocaleString()}</span>
                      )}
                      {v.mileageValue != null && (
                        <span>{v.mileageValue.toLocaleString()} mi</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}

            {inventory.listings.map((l) => {
              const img = l.imageUrls?.[0] ?? null;
              const detailKind =
                l.vertical === "realestate" ? "homes" : "services";
              return (
                <Link
                  key={`l-${l.id}`}
                  href={`${basePath}/${detailKind}/${l.id}`}
                  className="sf-card"
                  style={{ display: "block" }}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={l.title}
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4 / 3",
                        background: "var(--brand-accent)",
                      }}
                    />
                  )}
                  <div style={{ padding: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {l.title}
                    </div>
                    {l.price != null && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 14,
                          opacity: 0.7,
                        }}
                      >
                        ${l.price.toLocaleString()}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
.sf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
            `.trim(),
          }}
        />
      </section>
    </div>
  );
}
