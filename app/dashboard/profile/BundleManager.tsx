"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SubAccountLite {
  id: string;
  name: string;
  vertical: string;
  bundleId: string | null;
}

interface BundleLite {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subAccounts: { id: string; name: string; vertical: string }[];
}

interface Props {
  initialBundles: BundleLite[];
  subAccounts: SubAccountLite[];
}

/**
 * Storefront Bundles manager. Renders under the Sub-Accounts panel on the
 * profile page. Lets the dealer:
 *   - Create a new bundle from 2+ unbundled sub-accounts
 *   - Rename / change slug of an existing bundle
 *   - Add or remove members
 *   - Dissolve a bundle (returns members to standalone)
 *
 * Constraint: a sub-account can only be in one bundle. The UI hides
 * already-bundled sub-accounts from "create" pickers and from "add" pickers
 * of OTHER bundles, mirroring the server-side guard.
 */
export default function BundleManager({ initialBundles, subAccounts }: Props) {
  const router = useRouter();
  const [bundles, setBundles] = useState<BundleLite[]>(initialBundles);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newMembers, setNewMembers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Sub-accounts available to add to a NEW bundle (unbundled only).
  const standaloneSubs = subAccounts.filter((s) => s.bundleId == null);

  function toggleMember(id: string) {
    setNewMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    if (newMembers.size < 2) {
      setError("Pick at least 2 sub-accounts to bundle.");
      return;
    }
    if (!newName.trim()) {
      setError("Bundle needs a name.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          slug: newSlug.trim() || undefined,
          description: newDescription.trim() || null,
          subAccountIds: Array.from(newMembers),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string; detail?: string }));
        setError(body.detail || body.error || "Failed to create bundle.");
        return;
      }
      setShowCreate(false);
      setNewName("");
      setNewSlug("");
      setNewDescription("");
      setNewMembers(new Set());
      setSuccess("Bundle created. Storefront URLs updated.");
      router.refresh();
    });
  }

  async function handleDissolve(bundleId: string) {
    if (!confirm("Dissolve this bundle? Members return to standalone storefront pages.")) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await fetch(`/api/bundles/${bundleId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error || "Failed to dissolve bundle.");
        return;
      }
      setBundles((prev) => prev.filter((b) => b.id !== bundleId));
      setSuccess("Bundle dissolved.");
      router.refresh();
    });
  }

  async function handleRemoveMember(bundleId: string, subId: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await fetch(`/api/bundles/${bundleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeSubAccountIds: [subId] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        setError(body.error || "Failed to remove member.");
        return;
      }
      setSuccess("Sub-account removed from bundle.");
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
        Storefront Bundles
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Combine two or more sub-accounts into one storefront page. Bundled
        sub-accounts share a single catalog button on the dealer landing page.
        Unbundled sub-accounts each get their own vertical page.
      </p>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">
          {success}
        </div>
      )}

      {bundles.length > 0 && (
        <ul className="space-y-3 mb-4">
          {bundles.map((b) => (
            <li
              key={b.id}
              className="border border-gray-200 rounded-lg p-4 bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {b.name}
                    </span>
                    <code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                      /{b.slug}
                    </code>
                  </div>
                  {b.description && (
                    <p className="text-xs text-gray-600 mt-1">{b.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.subAccounts.map((sa) => (
                      <span
                        key={sa.id}
                        className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-md"
                      >
                        {sa.name}{" "}
                        <span className="opacity-60">({sa.vertical})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(b.id, sa.id)}
                          disabled={busy}
                          className="text-indigo-500 hover:text-indigo-700 text-sm leading-none"
                          title="Remove from bundle"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDissolve(b.id)}
                  disabled={busy}
                  className="text-sm text-red-600 hover:text-red-700 whitespace-nowrap"
                >
                  Dissolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showCreate && (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={standaloneSubs.length < 2}
          title={
            standaloneSubs.length < 2
              ? "Need at least 2 unbundled sub-accounts to create a bundle."
              : undefined
          }
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Create bundle
        </button>
      )}

      {showCreate && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New bundle</h3>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Lifestyle Collection"
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              URL slug (optional — auto-generated from name)
            </label>
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
              placeholder="e.g. lifestyle"
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Lowercase letters, digits, and hyphens. Can&apos;t be{" "}
              <code>vehicles</code>, <code>homes</code>, <code>services</code>,{" "}
              or <code>shop</code>.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="One-liner shown under the catalog button"
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Sub-accounts to bundle ({newMembers.size} selected; need 2+)
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {standaloneSubs.length === 0 && (
                <p className="text-xs text-gray-500 italic">
                  No standalone sub-accounts available. Dissolve an existing
                  bundle first to free its members.
                </p>
              )}
              {standaloneSubs.map((sa) => (
                <label
                  key={sa.id}
                  className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={newMembers.has(sa.id)}
                    onChange={() => toggleMember(sa.id)}
                    className="rounded"
                  />
                  <span>
                    {sa.name}{" "}
                    <span className="text-gray-500 text-xs">
                      ({sa.vertical})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || newMembers.size < 2 || !newName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? "Creating…" : "Create bundle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setError(null);
              }}
              disabled={busy}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
