"use client";

import { useState } from "react";

function normalizeUrl(url: string | null): string | null {
  if (!url || url.trim() === "") return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const SERVICE_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  price: "Price",
  category: "Category",
  address: "Location",
  url: "URL",
  image_url: "Image",
  availability: "Availability",
  brand: "Brand",
  condition: "Condition",
  fb_product_category: "Meta Category",
};

function labelFor(fieldKey: string): string {
  return SERVICE_FIELD_LABELS[fieldKey] ?? fieldKey;
}

const FIELD_SOURCE_COLORS: Record<string, string> = {
  scraped: "bg-green-50 text-green-700",
  user_entered: "bg-blue-50 text-blue-700",
  fallback: "bg-gray-100 text-gray-600",
  fallback_low_confidence: "bg-amber-50 text-amber-700",
};

const FIELD_SOURCE_LABELS: Record<string, string> = {
  scraped: "Scraped",
  user_entered: "Entered",
  fallback: "Auto-filled",
  fallback_low_confidence: "Auto-filled ⚠️",
};

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
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<
    { source: "validate" | "publish"; message: string } | null
  >(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const res = await fetch(`/api/listings/${id}/validate-url`, { method: "POST" });
      if (res.ok) {
        onDelete?.();
      } else {
        let errorMessage = `Validation failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          if (body?.error || body?.message) {
            errorMessage = body.error ?? body.message ?? errorMessage;
          }
        } catch {
          // response body was not JSON — fall through with status-based message
        }
        setActionError({ source: "validate", message: errorMessage });
        setTimeout(() => setActionError(null), 6000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error while validating URL";
      setActionError({ source: "validate", message });
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setValidatingId(null);
    }
  }

  async function handlePublish(id: string) {
    setPublishingId(id);
    setActionError(null);

    const target = listings.find((l) => l.id === id);
    if (target?.data?.isHighQuality === false) {
      if (
        !confirm(
          "Some fields (description, price, or image) are auto-filled with placeholder values.\nYour listing will be published but these fields should be updated for best results.\n\nPublish anyway?"
        )
      ) {
        setPublishingId(null);
        return;
      }
    }

    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishStatus: "published" }),
      });
      if (res.ok) {
        onDelete?.();
      } else {
        let errorMessage = `Publish failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string; message?: string };
          if (body?.error || body?.message) {
            errorMessage = body.error ?? body.message ?? errorMessage;
          }
        } catch {
          // response body was not JSON — fall through with status-based message
        }
        setActionError({ source: "publish", message: errorMessage });
        setTimeout(() => setActionError(null), 6000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error while publishing";
      setActionError({ source: "publish", message });
      setTimeout(() => setActionError(null), 6000);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
        >
          <span>
            {actionError.source === "publish"
              ? "Publish failed"
              : "URL validation failed"}
            : {actionError.message}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}
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

              const fieldSources =
                listing.data && typeof listing.data === "object"
                  ? ((listing.data as Record<string, unknown>).fieldSources as
                      | Record<string, string>
                      | undefined)
                  : undefined;
              const hasFieldSources =
                fieldSources && Object.keys(fieldSources).length > 0;
              const isExpanded = expandedId === listing.id;

              return (
                <tr key={listing.id} data-element-id={`listing-row-${listing.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-2">
                      {listing.imageUrls[0] && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={listing.imageUrls[0]}
                          alt=""
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate max-w-xs">
                          {listing.title}
                        </div>
                        {listing.missingFields.length > 0 && (
                          <ul className="text-xs text-red-500 mt-1 list-disc list-inside">
                            {listing.missingFields.map((f) => (
                              <li key={f}>Missing {labelFor(f)}</li>
                            ))}
                          </ul>
                        )}
                        {listing.data?.isHighQuality === false && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⚠️ Some fields are auto-filled and should be reviewed before publishing.
                          </p>
                        )}
                        {hasFieldSources && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : listing.id)
                              }
                              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer mt-1"
                            >
                              {isExpanded ? "Hide details" : "Show details"}
                            </button>
                            {isExpanded && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(fieldSources!).map(
                                  ([field, source]) => (
                                    <span
                                      key={field}
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        FIELD_SOURCE_COLORS[source] ??
                                        "bg-gray-50 text-gray-700"
                                      }`}
                                    >
                                      {labelFor(field)}: {FIELD_SOURCE_LABELS[source] ?? source}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 align-top">
                    {category || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 align-top">
                    {brand || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 align-top">
                    {priceDisplay}
                  </td>
                  <td className="px-4 py-3 text-gray-700 truncate max-w-[160px] align-top">
                    {location || "\u2014"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {(() => {
                      const scoreTitle =
                        listing.urlValidationScore != null
                          ? `Match score: ${listing.urlValidationScore.toFixed(0)}%`
                          : undefined;
                      const badgeMap: Record<
                        string,
                        { label: string; classes: string }
                      > = {
                        draft: {
                          label: "Draft",
                          classes: "bg-gray-100 text-gray-800",
                        },
                        validated: {
                          label: "Validated",
                          classes: "bg-blue-100 text-blue-800",
                        },
                        ready_to_publish: {
                          label: "Ready to Publish",
                          classes: "bg-yellow-100 text-yellow-800",
                        },
                        published: {
                          label: "Published",
                          classes: "bg-green-100 text-green-800",
                        },
                        blocked: {
                          label: "Blocked",
                          classes: "bg-red-100 text-red-800",
                        },
                      };
                      const badge =
                        badgeMap[listing.publishStatus] ?? badgeMap.draft;
                      return (
                        <span
                          title={scoreTitle}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {(listing.publishStatus === "ready_to_publish" ||
                        listing.publishStatus === "validated") && (
                        <button
                          type="button"
                          onClick={() => handlePublish(listing.id)}
                          disabled={
                            listing.publishStatus !== "ready_to_publish" ||
                            publishingId === listing.id
                          }
                          title={
                            listing.publishStatus !== "ready_to_publish"
                              ? "Validate the URL first to enable publishing"
                              : undefined
                          }
                          className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {publishingId === listing.id
                            ? "Publishing\u2026"
                            : (
                              <>
                                {listing.data?.isHighQuality === false && listing.publishStatus === "ready_to_publish" && (
                                  <span className="text-amber-500 mr-0.5">⚠</span>
                                )}
                                Publish
                              </>
                            )}
                        </button>
                      )}
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
                    </div>
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
