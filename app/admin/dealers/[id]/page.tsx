import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";


function getSubscriptionBadge(status: string | null): {
  label: string;
  classes: string;
} {
  switch (status) {
    case "active":
      return { label: "Active", classes: "bg-green-100 text-green-800" };
    case "past_due":
      return { label: "Past Due", classes: "bg-red-100 text-red-800" };
    case "canceled":
      return { label: "Canceled", classes: "bg-gray-100 text-gray-600" };
    case "trialing":
      return { label: "Trialing", classes: "bg-blue-100 text-blue-800" };
    default:
      return { label: "No Sub", classes: "bg-yellow-100 text-yellow-800" };
  }
}

function getScrapeStatusPill(status: string) {
  switch (status) {
    case "complete":
      return { classes: "bg-green-100 text-green-800" };
    case "pending":
      return { classes: "bg-yellow-100 text-yellow-800" };
    case "failed":
      return { classes: "bg-gray-100 text-gray-600" };
    default:
      return { classes: "bg-gray-100 text-gray-600" };
  }
}

export default async function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { id },
    include: {
      vehicles: {
        orderBy: { createdAt: "desc" },
      },
      listings: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!dealer) {
    notFound();
  }

  const { label: subLabel, classes: subClasses } = getSubscriptionBadge(
    dealer.subscriptionStatus
  );

  const totalVehicles = dealer.vehicles.length;
  const completeVehicles = dealer.vehicles.filter((v) => v.isComplete).length;

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL}/feeds/${dealer.slug}.csv`;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-900">
          CIAfeeds Admin
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full">
          ADMIN ONLY
        </span>
      </div>

      <main className="max-w-[960px] mx-auto px-6 py-8">
        <Link
          href="/admin"
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-5 inline-block"
        >
          &larr; Back to All Dealers
        </Link>

        {/* Profile card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 flex gap-6 items-start">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-3xl text-gray-400 shrink-0">
            {dealer.profileImageUrl ? (
              <img
                src={dealer.profileImageUrl}
                alt={dealer.name}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              "🏢"
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {dealer.name}
            </h2>
            <p className="text-sm text-gray-500">{dealer.email}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Slug: <strong>{dealer.slug}</strong> &nbsp;|&nbsp; Vertical:{" "}
              <strong className="capitalize">{dealer.vertical}</strong>
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              Joined:{" "}
              <strong>
                {new Date(dealer.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </strong>
            </p>
            <span
              className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mt-2 ${subClasses}`}
            >
              {subLabel}
            </span>
            {dealer.stripeCustomerId && (
              <p className="text-xs text-gray-400 mt-1">
                Stripe Customer: {dealer.stripeCustomerId}
              </p>
            )}
            {dealer.stripeSubscriptionId && (
              <p className="text-xs text-gray-400">
                Stripe Subscription: {dealer.stripeSubscriptionId}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 ml-auto">
            <a
              href={feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-semibold text-center hover:bg-gray-50"
            >
              ↗ View Feed
            </a>
          </div>
        </div>

        {/* Vehicles section */}
        {dealer.vertical === "automotive" && (
          <>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-6 mb-3">
              Vehicles ({totalVehicles} total · {completeVehicles} complete)
            </h3>
            {totalVehicles === 0 ? (
              <p className="text-sm text-gray-400">No vehicles yet.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {[
                        "Make / Model / Year",
                        "VIN",
                        "Price",
                        "Scrape",
                        "Complete",
                        "Added",
                        "Archived",
                      ].map((col) => (
                        <th
                          key={col}
                          className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dealer.vehicles.map((v) => {
                      const pill = getScrapeStatusPill(v.scrapeStatus);
                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-gray-50 ${v.archivedAt ? "opacity-50" : ""}`}
                        >
                          <td className="px-4 py-3 text-gray-700">
                            {[v.make, v.model, v.year]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                            {v.vin || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {v.price != null
                              ? `$${v.price.toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${pill.classes}`}
                            >
                              {v.scrapeStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {v.isComplete ? "✓" : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(v.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {v.archivedAt
                              ? new Date(v.archivedAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  }
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Listings section (non-automotive) */}
        {dealer.vertical !== "automotive" && (
          <>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-6 mb-3">
              Listings ({dealer.listings.length} total)
            </h3>
            {dealer.listings.length === 0 ? (
              <p className="text-sm text-gray-400">No listings yet.</p>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {[
                        "Title",
                        "Price",
                        "Complete",
                        "Added",
                        "Archived",
                      ].map((col) => (
                        <th
                          key={col}
                          className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dealer.listings.map((l) => (
                      <tr
                        key={l.id}
                        className={`hover:bg-gray-50 ${l.archivedAt ? "opacity-50" : ""}`}
                      >
                        <td className="px-4 py-3 text-gray-700">{l.title}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {l.price != null
                            ? `$${l.price.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {l.isComplete ? "✓" : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(l.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {l.archivedAt
                            ? new Date(l.archivedAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
