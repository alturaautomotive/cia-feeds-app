"use client";

import { useRouter } from "next/navigation";
import type { Vehicle } from "@prisma/client";

type VehicleRow = Vehicle & {
  scrapeStatus: string;
  urlStatus: string;
  urlLastCheckedAt: string | Date | null;
  urlCheckFailed: boolean;
};

interface Props {
  vehicles: VehicleRow[];
}

function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "Never";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function urlStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Live", className: "bg-green-100 text-green-800" },
    sold_or_removed: { label: "Sold / Removed", className: "bg-red-100 text-red-800" },
    redirect: { label: "Redirected", className: "bg-amber-100 text-amber-800" },
    error: { label: "Check Error", className: "bg-gray-100 text-gray-600" },
  };
  const info = map[status];
  if (!info) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "—";
  return price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatMileage(mileage: number | null): string {
  if (mileage === null || mileage === undefined) return "—";
  return mileage.toLocaleString();
}

export function VehiclesTable({ vehicles }: Props) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Year
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Make
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Model
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Price
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Mileage
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Condition
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Color
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Image
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Status
            </th>
            <th className="text-left px-3.5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              URL Status
            </th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => {
            const isPending = vehicle.scrapeStatus === "pending";
            const isFailed = vehicle.scrapeStatus === "failed";

            return (
              <tr
                key={vehicle.id}
                data-element-id={`vehicle-row-${vehicle.id}`}
                onClick={() => {
                  if (!isPending) router.push(`/dashboard/vehicles/${vehicle.id}`);
                }}
                className={`border-t border-gray-100 ${isPending ? "opacity-60 cursor-default" : "hover:bg-gray-50 cursor-pointer"} ${vehicle.urlCheckFailed ? "opacity-50 line-through" : ""}`}
              >
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : (vehicle.year ?? "—")}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : (vehicle.make ?? "—")}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : (vehicle.model ?? "—")}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : formatPrice(vehicle.price)}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : formatMileage(vehicle.mileageValue)}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : (vehicle.stateOfVehicle ?? "—")}
                </td>
                <td className="px-3.5 py-3 text-sm text-gray-700">
                  {isPending ? "—" : (vehicle.exteriorColor ?? "—")}
                </td>
                <td className="px-3.5 py-3 text-sm">
                  {isPending ? (
                    "—"
                  ) : vehicle.imageUrl ? (
                    <span className="badge badge-img-yes">✓ Image</span>
                  ) : (
                    <span className="badge badge-img-no">No Image</span>
                  )}
                </td>
                <td className="px-3.5 py-3 text-sm">
                  {isPending ? (
                    <span className="animate-pulse text-indigo-500 text-sm">Scraping…</span>
                  ) : isFailed ? (
                    <span className="badge badge-incomplete" style={{ backgroundColor: "#fee2e2", color: "#b91c1c" }}>Failed</span>
                  ) : vehicle.isComplete ? (
                    <span className="badge badge-complete">Complete</span>
                  ) : (
                    <span className="badge badge-incomplete">Incomplete</span>
                  )}
                </td>
                <td className="px-3.5 py-3 text-sm">
                  {isPending ? (
                    "—"
                  ) : (
                    <div>
                      {urlStatusBadge(vehicle.urlStatus)}
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Last checked: {formatRelativeTime(vehicle.urlLastCheckedAt)}
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
