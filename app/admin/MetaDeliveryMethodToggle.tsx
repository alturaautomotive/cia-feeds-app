"use client";

import { useState } from "react";

export function MetaDeliveryMethodToggle({
  dealerId,
  currentMethod,
}: {
  dealerId: string;
  currentMethod: string;
}) {
  const [method, setMethod] = useState(currentMethod);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = method === "api" ? "csv" : "api";
    const confirmed = window.confirm(
      `Switch delivery method to ${next.toUpperCase()} for this dealer?`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dealers/${dealerId}/meta-delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaDeliveryMethod: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update delivery method");
        return;
      }
      setMethod(next);
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50 ${
        method === "api"
          ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {loading ? "..." : method.toUpperCase()}
    </button>
  );
}
