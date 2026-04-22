"use client";

import { useState } from "react";

interface UrlHealthCheckToggleProps {
  urlHealthCheckEnabled: boolean;
}

export default function UrlHealthCheckToggle({ urlHealthCheckEnabled }: UrlHealthCheckToggleProps) {
  const [healthCheck, setHealthCheck] = useState(urlHealthCheckEnabled);
  const [healthCheckSaving, setHealthCheckSaving] = useState(false);

  async function handleHealthCheckToggle() {
    const newValue = !healthCheck;
    setHealthCheckSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlHealthCheckEnabled: newValue }),
      });
      if (res.ok) {
        setHealthCheck(newValue);
      }
    } catch {
      // Silently fail — toggle stays at old state
    } finally {
      setHealthCheckSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-7">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Daily URL Health Check</p>
          <p className="text-[13px] text-gray-500">
            Automatically checks each vehicle URL daily and removes sold vehicles from your feed.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={healthCheck}
          disabled={healthCheckSaving}
          onClick={handleHealthCheckToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            healthCheck ? "bg-indigo-600" : "bg-gray-200"
          } ${healthCheckSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              healthCheck ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
