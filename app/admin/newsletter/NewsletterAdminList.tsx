"use client";

// Client-side row list for the newsletter admin page. Each row exposes a
// Delete button that calls DELETE /api/admin/newsletter?id=<id>. Confirms
// with the browser's native confirm() since this is admin-only and we
// want zero ceremony.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string;
  interest: string | null;
  locale: string;
  unsubscribedAt: string | null;
  lastEmailedAt: string | null;
  createdAt: string;
}

export default function NewsletterAdminList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(row: Row) {
    if (
      !confirm(
        `Permanently delete ${row.email} from the newsletter list? This bypasses the unsubscribe flow and wipes the row entirely.`
      )
    ) {
      return;
    }
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/newsletter?id=${encodeURIComponent(row.id)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as Record<string, unknown>));
          setError(
            typeof body.error === "string" ? body.error : `Delete failed (${res.status})`
          );
          setBusyId(null);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusyId(null);
      }
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">Email</th>
            <th className="text-left px-3 py-2">Name</th>
            <th className="text-left px-3 py-2">Source</th>
            <th className="text-left px-3 py-2">Interest</th>
            <th className="text-left px-3 py-2">Locale</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Joined</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-12 text-center text-gray-400">
                No subscribers match these filters.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const isUnsub = !!r.unsubscribedAt;
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900 font-mono text-xs">
                    {r.email}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.source}</td>
                  <td className="px-3 py-2 text-gray-700">{r.interest ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.locale}</td>
                  <td className="px-3 py-2">
                    {isUnsub ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        Unsubscribed
                      </span>
                    ) : (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      disabled={busyId === r.id}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
                    >
                      {busyId === r.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
