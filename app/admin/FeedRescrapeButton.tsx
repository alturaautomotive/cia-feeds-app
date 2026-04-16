"use client";

import { useState } from "react";

export function FeedRescrapeButton({
  dealerId,
  vertical,
  className,
}: {
  dealerId?: string;
  vertical: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!dealerId) {
      const confirmed = window.confirm(
        `This will re-scrape ALL ${vertical} feeds. Continue?`
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/feed-rescrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId, vertical }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to start re-scrape");
        setLoading(false);
        return;
      }

      const data = await res.json();
      alert(
        `Re-scrape started: ${data.vehicleCount} vehicles across ${data.dealerCount} dealer(s)`
      );
    } catch {
      alert("Network error");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        "text-emerald-700 hover:text-emerald-900 font-medium text-xs whitespace-nowrap"
      }
    >
      {loading
        ? "Re-scraping..."
        : dealerId
          ? "Re-scrape Feed"
          : "Bulk Re-scrape Automotive"}
    </button>
  );
}
