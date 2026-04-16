"use client";

import { useState } from "react";

function normalizeUrl(url: string | null): string | null {
  if (!url || url.trim() === "") return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

interface ListingRow {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  isComplete: boolean;
  missingFields: string[];
  data: Record<string, unknown>;
  createdAt: string;
  publishStatus: string;
  urlValidationScore: number | null;
}

interface Props {
  listings: ListingRow[];
  vertical: string;
  onDelete?: () => void;
}

export function ListingsTable({ listings, vertical, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  if (listings.length === 0) {
    return null;
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this listing?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/listings/${id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete?.();
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function handleValidateUrl(id: string) {
    setValidatingId(id);
    try {
      const res = await fetch(`/api/listings/${id}/validate-url`, { method: "POST" });
      if (res.ok) {
        onDelete?.();
      }
    } catch {
      // ignore
    } finally {
      setValidatingId(null);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            {vertical === "services" ? (
              <>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </>
            ) : vertical === "ecommerce" ? (
              <>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </>
            ) : vertical === "realestate" ? (
              <>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Beds/Baths</th>
                <th className="px-4 py-3">City/State</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {listings.map((listing) => {
            if (vertical === "services") {
              const category = String(listing.data?.category ?? "");
              const location = String(listing.data?.address ?? "");
              const brand = String(listing.data?.brand ?? "");
              const priceDisplay = listing.data?.price
                ? String(listing.data.price)
                : listing.price != null
                  ? `$${listing.price.toLocaleString()}`
                  : "\u2014";

              return (
                <tr key={listing.id} data-element-id={`listing-row-${listing.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.imageUrls[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={listing.imageUrls[0]}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {listing.title}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {category || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {brand || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {priceDisplay}
                  </td>
                  <td className="px-4 py-3 text-gray-700 truncate max-w-[160px]">
                    {location || "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const scoreTitle =
                        listing.urlValidationScore != null
                          ? `Match score: ${(listing.urlValidationScore * 100).toFixed(0)}%`
                          : undefined;
                      if (listing.publishStatus === "published") {
                        return (
                          <span
                            title={scoreTitle}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                          >
                            Published
                          </span>
                        );
                      }
                      if (listing.publishStatus === "blocked") {
                        return (
                          <span
                            title={scoreTitle}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                          >
                            Blocked
                          </span>
                        );
                      }
                      return (
                        <span
                          title={scoreTitle}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
                        >
                          Draft
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    {(() => {
                      const normalizedUrl = normalizeUrl(listing.url);
                      return normalizedUrl ? (
                        <a
                          href={normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          Book
                        </a>
                      ) : null;
                    })()}
                    {listing.url && (
                      <button
                        type="button"
                        onClick={() => handleValidateUrl(listing.id)}
                        disabled={validatingId === listing.id}
                        className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        {validatingId === listing.id ? "Validating\u2026" : "Validate"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingId === listing.id ? "Deleting\u2026" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            }

            if (vertical === "ecommerce") {
              const brand = String(listing.data?.brand ?? "\u2014");
              const condition = String(listing.data?.condition ?? "\u2014");
              const priceDisplay = listing.price != null
                ? `$${listing.price.toLocaleString()}`
                : String(listing.data?.price ?? "\u2014");

              return (
                <tr key={listing.id} data-element-id={`listing-row-${listing.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.imageUrls[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={listing.imageUrls[0]}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {listing.title}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{brand}</td>
                  <td className="px-4 py-3 text-gray-700">{priceDisplay}</td>
                  <td className="px-4 py-3 text-gray-700">{condition}</td>
                  <td className="px-4 py-3">
                    {listing.isComplete ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Incomplete
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    {(() => {
                      const normalizedUrl = normalizeUrl(listing.url);
                      return normalizedUrl ? (
                        <a
                          href={normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          View
                        </a>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingId === listing.id ? "Deleting\u2026" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            }

            if (vertical === "realestate") {
              const priceDisplay = listing.price != null
                ? `$${listing.price.toLocaleString()}`
                : String(listing.data?.price ?? "\u2014");
              const bedsBaths = `${listing.data?.num_beds ?? "\u2014"} bd / ${listing.data?.num_baths ?? "\u2014"} ba`;
              const cityState = (`${listing.data?.city ?? ""}${listing.data?.city && listing.data?.region ? ", " : ""}${listing.data?.region ?? ""}`).trim() || "\u2014";

              return (
                <tr key={listing.id} data-element-id={`listing-row-${listing.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.imageUrls[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={listing.imageUrls[0]}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {listing.title}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{priceDisplay}</td>
                  <td className="px-4 py-3 text-gray-700">{bedsBaths}</td>
                  <td className="px-4 py-3 text-gray-700 truncate max-w-[160px]">{cityState}</td>
                  <td className="px-4 py-3">
                    {listing.isComplete ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Incomplete
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    {(() => {
                      const normalizedUrl = normalizeUrl(listing.url);
                      return normalizedUrl ? (
                        <a
                          href={normalizedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          View
                        </a>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingId === listing.id ? "Deleting\u2026" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            }

            // Generic columns for other verticals
            return (
              <tr key={listing.id} data-element-id={`listing-row-${listing.id}`} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {listing.imageUrls[0] && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={listing.imageUrls[0]}
                        alt=""
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <div>
                      <div className="font-medium text-gray-900 truncate max-w-xs">
                        {listing.title}
                      </div>
                      {listing.url && (
                        <div className="text-xs text-gray-400 truncate max-w-xs">
                          {listing.url}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {listing.price != null ? `$${listing.price.toLocaleString()}` : "\u2014"}
                </td>
                <td className="px-4 py-3">
                  {listing.isComplete ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Incomplete
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleDelete(listing.id)}
                    disabled={deletingId === listing.id}
                    className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingId === listing.id ? "Deleting\u2026" : "Delete"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
