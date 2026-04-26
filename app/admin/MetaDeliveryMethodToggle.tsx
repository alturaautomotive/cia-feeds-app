"use client";

import { useState } from "react";

const API_SUPPORTED_VERTICALS = new Set(["automotive", "services"]);

export function MetaDeliveryMethodToggle({
  dealerId,
  currentMethod,
  vertical,
}: {
  dealerId: string;
  currentMethod: string;
  vertical: string;
}) {
  const [method, setMethod] = useState(currentMethod);
  const [loading, setLoading] = useState(false);

  const canToggleToApi = API_SUPPORTED_VERTICALS.has(vertical);

  async function toggle() {
    const next = method === "api" ? "csv" : "api";

    if (next === "api" && !canToggleToApi) {
      alert(`API delivery is not supported for the "${vertical}" vertical. Only automotive and services are supported.`);
      return;
    }

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
        if (data.error === "api_delivery_not_ready" && Array.isArray(data.issues)) {
          const issueMessages: Record<string, string> = {
            api_delivery_unsupported_vertical: "API delivery is not supported for this vertical.",
            catalog_not_selected: "Dealer has not selected a Meta catalog.",
            meta_token_missing: "Dealer has not connected their Meta account.",
            meta_token_decrypt_failed: "Meta token could not be verified.",
            meta_token_expired: "Meta token has expired.",
          };
          const msgs = (data.issues as string[])
            .map((i: string) => issueMessages[i] || i)
            .join("\n");
          alert(msgs);
        } else {
          alert(data.error ?? "Failed to update delivery method");
        }
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
    <span className="inline-flex items-center gap-1">
      <button
        onClick={toggle}
        disabled={loading || (method === "csv" && !canToggleToApi)}
        title={!canToggleToApi && method === "csv" ? `API mode unavailable for ${vertical} vertical` : undefined}
        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50 ${
          method === "api"
            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        {loading ? "..." : method.toUpperCase()}
      </button>
      {!canToggleToApi && method === "csv" && (
        <span className="text-[10px] text-gray-400" title="API delivery requires automotive or services vertical">CSV only</span>
      )}
    </span>
  );
}
