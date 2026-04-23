"use client";

import { useState } from "react";

interface FeedUrlModeToggleProps {
  feedUrlMode: string;
}

export default function FeedUrlModeToggle({ feedUrlMode: initial }: FeedUrlModeToggleProps) {
  const [mode, setMode] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleChange(newMode: string) {
    if (newMode === mode) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrlMode: newMode }),
      });
      if (res.ok) {
        setMode(newMode);
      }
    } catch {
      // Silently fail — stays at old state
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-7">
      <p className="text-sm font-semibold text-gray-900 mb-1">Feed URL Mode</p>
      <p className="text-[13px] text-gray-500 mb-4">
        Choose which URL appears in your CSV feed for each item.
      </p>
      <div className={`flex flex-col gap-3 ${saving ? "opacity-50 pointer-events-none" : ""}`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="feedUrlMode"
            value="original"
            checked={mode === "original"}
            onChange={() => handleChange("original")}
            className="mt-0.5 accent-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-900">Original VDP URL</span>
            <p className="text-[13px] text-gray-500">
              Links directly to the vehicle/listing page on your website.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="feedUrlMode"
            value="landing"
            onChange={() => handleChange("landing")}
            checked={mode === "landing"}
            className="mt-0.5 accent-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-900">CIA Landing Page</span>
            <p className="text-[13px] text-gray-500">
              Links to your branded CIA landing page with built-in tracking.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
