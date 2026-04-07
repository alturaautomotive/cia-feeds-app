"use client";

import { useState, useRef } from "react";
import Link from "next/link";

const VERTICALS = [
  { id: "automotive", icon: "\u{1F697}", title: "Automotive", desc: "Vehicle listings" },
  { id: "services", icon: "\u{1F527}", title: "Services", desc: "Local service businesses" },
  { id: "ecommerce", icon: "\u{1F4E6}", title: "E-commerce", desc: "Physical or digital products" },
  { id: "realestate", icon: "\u{1F3E0}", title: "Real Estate", desc: "Property listings for sale or rent" },
] as const;

interface Props {
  profileImageUrl: string | null;
  currentVertical: string;
}

export default function ProfileClient({ profileImageUrl: initialPhotoUrl, currentVertical: initialVertical }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [vertical, setVertical] = useState(initialVertical);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setError(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/profile/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed.");
        return;
      }
      const data = await res.json();
      setPhotoUrl(data.profileImageUrl);
    } catch {
      setError("Network error during upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileImageUrl: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Remove failed.");
        return;
      }
      setPhotoUrl(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  async function handleConfirmSwitch() {
    if (!switchTarget) return;
    setSwitching(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical: switchTarget }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to switch vertical.");
        setSwitchTarget(null);
        return;
      }

      setVertical(switchTarget);
      setSwitchTarget(null);
      window.location.href = "/dashboard";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSwitching(false);
    }
  }

  const currentVerticalInfo = VERTICALS.find((v) => v.id === vertical);
  const targetVerticalInfo = VERTICALS.find((v) => v.id === switchTarget);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-indigo-500 hover:text-indigo-600">
            &larr; Dashboard
          </Link>
          <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
        </div>
      </div>

      <div className="max-w-[560px] mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Profile &amp; Settings</h1>

        {error && (
          <div className="rounded-md bg-red-50 p-3 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Profile Photo */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Profile Photo
          </h2>

          <div className="mb-4">
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoUrl}
                alt="Sales manager profile"
                style={{ width: 100, height: 140, objectFit: "cover", borderRadius: 8, display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: 100, height: 140, borderRadius: 8,
                  border: "2px dashed #d1d5db",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "#f9fafb",
                }}
              >
                <span className="text-xs text-gray-400 text-center px-2">Full-body photo here</span>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-indigo-400 text-indigo-600 rounded-md py-2 text-sm cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          >
            {uploading ? "Uploading\u2026" : "Upload Photo"}
          </button>

          {photoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="w-full border border-red-300 text-red-600 bg-white rounded-md py-2 text-sm cursor-pointer hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
            >
              {removing ? "Removing\u2026" : "Remove Photo"}
            </button>
          )}

          <p className="text-xs text-gray-400 mt-2">
            Best results: standing pose, plain background, good lighting. Max 5 MB.
          </p>
        </div>

        {/* Business Vertical */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Business Vertical</h2>
          <p className="text-xs text-gray-400 mb-4">Your vertical determines how your Meta feed CSV is formatted.</p>

          <div className="space-y-2">
            {VERTICALS.map((v) => {
              const isCurrent = v.id === vertical;
              return (
                <button
                  key={v.id}
                  type="button"
                  data-element-id={`vertical-${v.id}`}
                  onClick={() => { if (!isCurrent) setSwitchTarget(v.id); }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    isCurrent ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300 cursor-pointer"
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{v.icon} {v.title}</div>
                    <div className="text-xs text-gray-500">{isCurrent ? "Currently active" : v.desc}</div>
                  </div>
                  {isCurrent && <span className="text-indigo-500 text-base">&check;</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Switch confirmation modal */}
      {switchTarget && targetVerticalInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div data-element-id="switch-modal" className="bg-white rounded-xl p-6 max-w-[400px] w-full mx-4">
            <div className="text-3xl mb-3">{"\u26A0\uFE0F"}</div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Switch to {targetVerticalInfo.title}?</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              You&apos;re switching from <strong>{currentVerticalInfo?.title}</strong> to{" "}
              <strong>{targetVerticalInfo.title}</strong>. Your current inventory will be hidden
              from your feed while you&apos;re on the {targetVerticalInfo.title} vertical.
            </p>
            <div className="bg-amber-50 rounded-md p-3 text-xs text-amber-800 mb-5">
              Your inventory is not deleted. If you switch back, all your items will be restored automatically.
            </div>
            <div className="flex gap-2.5">
              <button
                data-element-id="cancel-switch"
                type="button"
                onClick={() => setSwitchTarget(null)}
                disabled={switching}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Keep {currentVerticalInfo?.title}
              </button>
              <button
                data-element-id="confirm-switch"
                type="button"
                onClick={handleConfirmSwitch}
                disabled={switching}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {switching ? "Switching\u2026" : `Switch to ${targetVerticalInfo.title}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
