"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Vehicle } from "@prisma/client";
import { AddVehicleForm } from "./components/AddVehicleForm";
import { VehiclesTable } from "./components/VehiclesTable";
import { SuccessBanner } from "./components/SuccessBanner";
import { ErrorBanner } from "./components/ErrorBanner";

// Vehicle data fields (excludes system/metadata fields) used to detect auto-filled values
const VEHICLE_DATA_FIELDS: Array<{ key: keyof Vehicle; label: string }> = [
  { key: "vin", label: "VIN" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year" },
  { key: "bodyStyle", label: "Body Style" },
  { key: "price", label: "Price" },
  { key: "mileageValue", label: "Mileage" },
  { key: "stateOfVehicle", label: "Condition" },
  { key: "exteriorColor", label: "Exterior Color" },
  { key: "imageUrl", label: "Image" },
  { key: "description", label: "Description" },
];

interface Props {
  vehicles: Vehicle[];
  dealerName: string;
}

export function DashboardClient({ vehicles: initialVehicles, dealerName }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [vdpUrl, setVdpUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    autoFilledFields: string[];
    missingFields: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleAddVehicle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccessInfo(null);
    setErrorMsg(null);
    setAdding(true);

    try {
      const res = await fetch("/api/vehicles/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: vdpUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || data.error || "Failed to add vehicle.");
        return;
      }

      const { vehicle, missingFields } = data as { vehicle: Vehicle; missingFields: string[] };

      // Refresh vehicle list from server
      const listRes = await fetch("/api/vehicles");
      if (listRes.ok) {
        const listData = await listRes.json();
        setVehicles(listData.vehicles ?? []);
      } else {
        // Optimistic update
        setVehicles((prev) => [vehicle, ...prev]);
      }

      setVdpUrl("");

      // Derive auto-filled fields: fields with a non-null, non-empty value in the returned payload
      const autoFilledFields = VEHICLE_DATA_FIELDS
        .filter(({ key }) => {
          const val = vehicle[key];
          return val !== null && val !== undefined && val !== "";
        })
        .map(({ label }) => label);

      setSuccessInfo({ autoFilledFields, missingFields: missingFields ?? [] });
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{dealerName}</span>
            <Link href="/dashboard/profile" className="text-sm text-indigo-600 hover:text-indigo-500">
              Profile
            </Link>
            <button
              onClick={async () => {
                setBillingLoading(true);
                const res = await fetch("/api/stripe/portal", { method: "POST" });
                const data = await res.json();
                if (res.ok && data.url) {
                  window.location.href = data.url;
                } else {
                  setBillingLoading(false);
                }
              }}
              disabled={billingLoading}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              {billingLoading ? "Loading…" : "Manage Billing"}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
          <Link
            href="/dashboard/feed"
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            📋 View Feed URL
          </Link>
        </div>

        {/* Add vehicle form */}
        <div className="mb-6">
          <AddVehicleForm
            url={vdpUrl}
            onChange={setVdpUrl}
            onSubmit={handleAddVehicle}
            isLoading={adding}
          />
        </div>

        {/* Status banners */}
        {successInfo && (
          <div className="mb-4">
            <SuccessBanner
              autoFilledFields={successInfo.autoFilledFields}
              missingFields={successInfo.missingFields}
            />
          </div>
        )}
        {errorMsg && (
          <div className="mb-4">
            <ErrorBanner message={errorMsg} />
          </div>
        )}

        {/* Vehicles table */}
        {vehicles.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-gray-500 text-sm">
              No vehicles yet. Paste a VDP URL above to get started.
            </p>
          </div>
        ) : (
          <VehiclesTable vehicles={vehicles} />
        )}
      </div>
    </div>
  );
}
