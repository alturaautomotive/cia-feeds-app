"use client";

import { useRouter } from "next/navigation";
import type { Vehicle } from "@prisma/client";

type VehicleRow = Vehicle & { scrapeStatus: string };

interface Props {
  vehicles: VehicleRow[];
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
                className={`border-t border-gray-100 ${isPending ? "opacity-60 cursor-default" : "hover:bg-gray-50 cursor-pointer"}`}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
