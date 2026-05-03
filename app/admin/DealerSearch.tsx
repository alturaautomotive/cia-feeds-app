"use client";

import { useState } from "react";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";
import { FeedRescrapeButton } from "./FeedRescrapeButton";
import { MetaDeliveryMethodToggle } from "./MetaDeliveryMethodToggle";

type Row = {
  id: string;
  name: string;
  email: string;
  slug: string;
  vertical: string;
  subscriptionStatus: string | null;
  totalVehicles: number;
  completeCount: number;
  listingCount: number;
  metaDeliveryMethod: string;
  deliveryHealth: "green" | "amber" | "red";
  deliveryHealthTitle: string;
  joinedISO: string;
  feedUrl: string;
};

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

const healthDotColor: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function DealerSearch({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");

  const q = query.toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q)
      )
    : rows;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            All Dealers
          </h2>
          <span className="text-xs text-gray-400">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search by name, email, or slug..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm w-72"
          />
          <FeedRescrapeButton
            vertical="automotive"
            className="border border-emerald-300 text-emerald-700 bg-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-emerald-50"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                "Dealer",
                "Email",
                "Subscription",
                "Vehicles",
                "Listings",
                "Complete",
                "Delivery",
                "Health",
                "Joined",
                "Feed",
                "Actions",
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                  No dealers match &ldquo;{query}&rdquo;
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const { label, classes } = getSubscriptionBadge(
                  row.subscriptionStatus
                );

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <strong className="text-gray-900">{row.name}</strong>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${classes}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.totalVehicles}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.listingCount}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.totalVehicles === 0
                        ? "\u2014"
                        : `${row.completeCount} / ${row.totalVehicles}`}
                    </td>
                    <td className="px-4 py-3">
                      <MetaDeliveryMethodToggle
                        dealerId={row.id}
                        currentMethod={row.metaDeliveryMethod}
                        vertical={row.vertical}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${healthDotColor[row.deliveryHealth]}`}
                        title={row.deliveryHealthTitle}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.joinedISO).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={row.feedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        &uarr; Feed
                      </a>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <Link
                        href={`/admin/dealers/${row.id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        View Data
                      </Link>
                      <ImpersonateButton dealerId={row.id} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
