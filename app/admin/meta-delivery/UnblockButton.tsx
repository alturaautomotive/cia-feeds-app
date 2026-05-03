"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnblockButton({ dealerId }: { dealerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/meta-delivery/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      const data = await res.json();
      setSuccess(`Unblocked ${data.unblockedCount} jobs`);
      setTimeout(() => {
        setSuccess(null);
        router.refresh();
      }, 3000);
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "..." : "Unblock"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {success && <span className="text-xs text-green-600">{success}</span>}
    </div>
  );
}
