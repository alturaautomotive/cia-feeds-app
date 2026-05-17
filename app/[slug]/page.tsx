import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getTenantBySlug, getStorefrontCta } from "@/lib/tenant";
import PixelInitializer from "@/app/components/PixelInitializer";

export const revalidate = 60; // ISR: regenerate at most every 60s

function storefrontLabel(vertical: string): string {
  if (vertical === "automotive") return "Vehicle Inventory";
  if (vertical === "realestate") return "Property Listings";
  if (vertical === "ecommerce") return "Products";
  return "Services";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { title: "Not found" };
  const titleSuffix = storefrontLabel(tenant.vertical);
  return {
    title: `${tenant.name} — ${titleSuffix}`,
    description: `Browse the latest ${titleSuffix.toLowerCase()} from ${tenant.name}.`,
    openGraph: {
      title: `${tenant.name} — ${titleSuffix}`,
      siteName: tenant.name,
      images: tenant.logoUrl || tenant.profileImageUrl ? [tenant.logoUrl || tenant.profileImageUrl!] : undefined,
    },
  };
}

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const isAutomotive = tenant.vertical === "automotive";
  const cta = getStorefrontCta(tenant);

  // Pull the 6 most-recent active inventory items for the hero grid.
  const [vehicles, listings] = await Promise.all([
    isAutomotive
      ? prisma.vehicle.findMany({
          where: {
            dealerId: tenant.id,
            archivedAt: null,
            urlStatus: "active",
            scrapeStatus: { not: "failed" },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
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
    !isAutomotive
      ? prisma.listing.findMany({
          where: {
            dealerId: tenant.id,
            archivedAt: null,
            publishStatus: { in: ["published", "ready_to_publish", "validated"] },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            price: true,
            imageUrls: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      {/* Meta Pixel — fires PageView on every storefront visit, with no
          contentId since this is the homepage (no single item to attribute). */}
      {tenant.metaPixelId && (
        <PixelInitializer pixelId={tenant.metaPixelId} />
      )}
      {/* Hero */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "64px 20px 40px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {isAutomotive
            ? `Find your next vehicle at ${tenant.name}`
            : tenant.vertical === "realestate"
            ? `Find your next home with ${tenant.name}`
            : `${tenant.name}`}
        </h1>
        <p
          style={{
            fontSize: 18,
            marginTop: 16,
            opacity: 0.75,
            maxWidth: 640,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {isAutomotive
            ? "Browse our current inventory below or get in touch and we'll help you find the right one."
            : tenant.vertical === "realestate"
            ? "Browse the latest property listings below or get in touch to schedule a tour."
            : `Explore our services and reach out anytime.`}
        </p>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/${tenant.slug}/${isAutomotive ? "vehicles" : "services"}`}
            className="sf-btn"
          >
            View {isAutomotive ? "Inventory" : tenant.vertical === "realestate" ? "Listings" : "Services"}
          </Link>
          <Link href={`/${tenant.slug}/contact`} className="sf-btn-outline">
            {cta.label}
          </Link>
        </div>
      </section>

      {/* Featured grid */}
      <section
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 20px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            {isAutomotive
              ? "Latest vehicles"
              : tenant.vertical === "realestate"
              ? "Latest listings"
              : "Featured"}
          </h2>
          <Link
            href={`/${tenant.slug}/${isAutomotive ? "vehicles" : "services"}`}
            style={{
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "underline",
              opacity: 0.8,
            }}
          >
            See all →
          </Link>
        </div>

        {isAutomotive ? (
          vehicles.length === 0 ? (
            <EmptyState message="No vehicles in inventory yet — check back soon." />
          ) : (
            <div className="sf-grid">
              {vehicles.map((v) => {
                const title = [v.year, v.make, v.model, v.trim]
                  .filter(Boolean)
                  .join(" ");
                const img =
                  v.spotlightImageUrl ||
                  v.imageUrl ||
                  (v.images && v.images[0]) ||
                  null;
                return (
                  <Link
                    key={v.id}
                    href={`/${tenant.slug}/vehicles/${v.id}`}
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
                        {v.price != null && <span>${v.price.toLocaleString()}</span>}
                        {v.mileageValue != null && (
                          <span>{v.mileageValue.toLocaleString()} mi</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : listings.length === 0 ? (
          <EmptyState
            message={
              tenant.vertical === "realestate"
                ? "No listings yet — check back soon."
                : "No services listed yet — check back soon."
            }
          />
        ) : (
          <div className="sf-grid">
            {listings.map((l) => {
              const img = l.imageUrls?.[0] ?? null;
              return (
                <Link
                  key={l.id}
                  href={`/${tenant.slug}/services/${l.id}`}
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
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{l.title}</div>
                    {l.price != null && (
                      <div
                        style={{ marginTop: 6, fontSize: 14, opacity: 0.7 }}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="sf-card"
      style={{
        padding: 48,
        textAlign: "center",
        opacity: 0.7,
        fontSize: 16,
      }}
    >
      {message}
    </div>
  );
}
