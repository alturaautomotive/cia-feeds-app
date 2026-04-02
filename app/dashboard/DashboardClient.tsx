"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Vehicle } from "@prisma/client";
import { AddVehicleForm } from "./components/AddVehicleForm";
import { VehiclesTable } from "./components/VehiclesTable";
import { SuccessBanner } from "./components/SuccessBanner";
import { ErrorBanner } from "./components/ErrorBanner";

type VehicleRow = Vehicle & { scrapeStatus: string };

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
  vehicles: VehicleRow[];
  dealerName: string;
}

export function DashboardClient({ vehicles: initialVehicles, dealerName }: Props) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>(initialVehicles);
  const [vdpUrl, setVdpUrl] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    autoFilledFields: string[];
    missingFields: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusMapRef = useRef<Map<string, string>>(new Map());

  // Initialize status map from initial vehicles
  useEffect(() => {
    for (const v of initialVehicles) {
      statusMapRef.current.set(v.id, v.scrapeStatus);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling effect: start/stop interval based on whether pending rows exist
  useEffect(() => {
    const hasPending = vehicles.some((v) => v.scrapeStatus === "pending");

    if (hasPending && pollIntervalRef.current === null) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/vehicles");
          if (!res.ok) return;
          const data = await res.json();
          const fresh: VehicleRow[] = data.vehicles ?? [];

          // Detect transitions
          for (const v of fresh) {
            const prev = statusMapRef.current.get(v.id);
            if (prev === "pending" && v.scrapeStatus === "complete") {
              const autoFilledFields = VEHICLE_DATA_FIELDS
                .filter(({ key }) => {
                  const val = v[key];
                  return val !== null && val !== undefined && val !== "";
                })
                .map(({ label }) => label);
              setSuccessInfo({ autoFilledFields, missingFields: v.missingFields ?? [] });
            } else if (prev === "pending" && v.scrapeStatus === "failed") {
              setErrorMsg(`Scrape failed for ${v.url}. Please try again.`);
            }
            statusMapRef.current.set(v.id, v.scrapeStatus);
          }

          setVehicles(fresh);

          // Stop polling if no pending rows remain
          const stillPending = fresh.some((v) => v.scrapeStatus === "pending");
          if (!stillPending && pollIntervalRef.current !== null) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } catch {
          // silently ignore poll errors
        }
      }, 3000);
    } else if (!hasPending && pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      // Cleanup on unmount only — don't clear on every render
    };
  }, [vehicles]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  async function handleAddVehicle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccessInfo(null);
    setErrorMsg(null);

    const tempId = "pending-" + Date.now();
    const submittedUrl = vdpUrl;

    // Immediately append optimistic pending row and clear the input
    const tempRow: VehicleRow = {
      id: tempId,
      url: submittedUrl,
      scrapeStatus: "pending",
      dealerId: "",
      description: null,
      vin: null,
      make: null,
      model: null,
      year: null,
      bodyStyle: null,
      price: null,
      mileageValue: null,
      stateOfVehicle: null,
      exteriorColor: null,
      imageUrl: null,
      images: [],
      spotlightImageUrl: null,
      isComplete: false,
      missingFields: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setVehicles((prev) => [tempRow, ...prev]);
    setVdpUrl("");

    try {
      const res = await fetch("/api/vehicles/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: submittedUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setVehicles((prev) => prev.filter((v) => v.id !== tempId));
        setErrorMsg(data.message || data.error || "Failed to add vehicle.");
        return;
      }

      const { vehicle: returned } = data as { vehicle: { id: string; scrapeStatus: string; url: string } };

      // Replace temp row with real id, keeping pending status.
      // Remove any pre-existing row with the same returned ID (duplicate URL case)
      // so there is always exactly one row per vehicle ID.
      statusMapRef.current.set(returned.id, "pending");
      setVehicles((prev) =>
        prev
          .filter((v) => v.id !== returned.id || v.id === tempId)
          .map((v) => (v.id === tempId ? { ...tempRow, id: returned.id, url: returned.url } : v))
      );
    } catch {
      setVehicles((prev) => prev.filter((v) => v.id !== tempId));
      setErrorMsg("Network error. Please try again.");
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
            isLoading={false}
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
