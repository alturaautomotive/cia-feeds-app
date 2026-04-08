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

      const { token } = await res.json();
      window.location.href = `/api/admin/impersonate/activate?token=${encodeURIComponent(token)}`;
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
