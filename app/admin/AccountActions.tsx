"use client";

// Action buttons for admin dealer-detail page:
//   - Suspend (soft-delete + Stripe cancel at period end)
//   - Restore (undo suspend, available when account is currently deleted)
//   - Hard Delete (irreversible; requires typing the dealer's slug to confirm)
//
// All three call /api/admin/dealers/[id]/{suspend|restore|hard-delete}.
// We use router.refresh() after a successful action so the dealer page
// re-renders with the new state (suspended badge appears, action set
// changes).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  dealerId: string;
  dealerSlug: string;
  dealerName: string;
  isSuspended: boolean;
}

export function AccountActions({
  dealerId,
  dealerSlug,
  dealerName,
  isSuspended,
}: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [reason, setReason] = useState("");

  function reset() {
    setError(null);
    setSuccess(null);
  }

  function handleSuspend() {
    if (
      !confirm(
        `Suspend ${dealerName}? They lose access immediately. Stripe subscription will cancel at the end of the current billing period. Reversible within 30 days.`
      )
    ) {
      return;
    }
    reset();
    startTransition(async () => {
      const res = await fetch(`/api/admin/dealers/${dealerId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        setError(typeof body.detail === "string" ? body.detail : typeof body.error === "string" ? body.error : "Suspend failed.");
        return;
      }
      setSuccess("Account suspended. Stripe sub set to cancel at period end.");
      setReason("");
      router.refresh();
    });
  }

  function handleRestore() {
    if (!confirm(`Restore ${dealerName}? Access is reinstated. Stripe sub is NOT auto-renewed.`)) return;
    reset();
    startTransition(async () => {
      const res = await fetch(`/api/admin/dealers/${dealerId}/restore`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Restore failed.");
        return;
      }
      setSuccess("Account restored.");
      router.refresh();
    });
  }

  function handleHardDelete() {
    if (confirmSlug !== dealerSlug) {
      setError(
        `Confirmation slug doesn't match. Type "${dealerSlug}" exactly to confirm.`
      );
      return;
    }
    reset();
    startTransition(async () => {
      const res = await fetch(`/api/admin/dealers/${dealerId}/hard-delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmSlug,
          reason: reason.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        setError(
          typeof body.detail === "string"
            ? body.detail
            : typeof body.error === "string"
            ? body.error
            : "Hard delete failed."
        );
        return;
      }
      setSuccess("Account permanently deleted. Redirecting to admin index...");
      setTimeout(() => router.push("/admin"), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
      {success && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
          {success}
        </div>
      )}

      {!isSuspended && (
        <button
          type="button"
          onClick={handleSuspend}
          disabled={busy}
          className="bg-white text-amber-700 border border-amber-300 px-4 py-2 rounded-md text-sm font-semibold text-center hover:bg-amber-50 disabled:opacity-50"
        >
          {busy ? "Working…" : "Suspend Account"}
        </button>
      )}

      {isSuspended && (
        <button
          type="button"
          onClick={handleRestore}
          disabled={busy}
          className="bg-white text-emerald-700 border border-emerald-300 px-4 py-2 rounded-md text-sm font-semibold text-center hover:bg-emerald-50 disabled:opacity-50"
        >
          {busy ? "Working…" : "Restore Account"}
        </button>
      )}

      {!showConfirmDelete ? (
        <button
          type="button"
          onClick={() => setShowConfirmDelete(true)}
          disabled={busy}
          className="bg-white text-red-700 border border-red-300 px-4 py-2 rounded-md text-sm font-semibold text-center hover:bg-red-50 disabled:opacity-50"
        >
          Hard Delete…
        </button>
      ) : (
        <div className="border border-red-300 bg-red-50/40 rounded-md p-3 space-y-2">
          <div className="text-xs font-semibold text-red-800">
            Permanently delete {dealerName}?
          </div>
          <div className="text-[11px] text-red-700">
            Irreversible. Wipes the dealer + all sub-accounts, listings,
            vehicles, leads, SMS conversations, etc. Stripe sub is cancelled
            at period end. Type the slug below to confirm.
          </div>
          <input
            type="text"
            placeholder={dealerSlug}
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            className="w-full border border-red-300 rounded px-2 py-1 text-sm font-mono text-gray-900 placeholder-red-300"
          />
          <input
            type="text"
            placeholder="Reason (optional, audit-logged)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-red-300 rounded px-2 py-1 text-xs text-gray-900 placeholder-red-300"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleHardDelete}
              disabled={busy || confirmSlug !== dealerSlug}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Deleting…" : "Permanently Delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirmDelete(false);
                setConfirmSlug("");
                setReason("");
                setError(null);
              }}
              disabled={busy}
              className="flex-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
