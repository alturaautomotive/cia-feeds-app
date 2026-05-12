"use client";

import { useState } from "react";

export function ImpersonateButton({ dealerId, className }: { dealerId: string; className?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to impersonate");
        setLoading(false);
        return;
      }

      // The POST above sets the impersonation cookie inline (SECURITY_AUDIT.md F-1.4).
      // No more token-in-URL handoff.
      window.location.href = "/dashboard";
    } catch {
      alert("Network error");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={className ?? "text-amber-700 hover:text-amber-900 font-medium text-xs whitespace-nowrap"}
    >
      {loading ? "Loading..." : "Login as User"}
    </button>
  );
}
