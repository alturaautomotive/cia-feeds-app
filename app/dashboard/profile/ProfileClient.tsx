"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface Props {
  profileImageUrl: string | null;
}

export default function ProfileClient({ profileImageUrl: initialPhotoUrl }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-indigo-500 hover:text-indigo-600">
            ← Dashboard
          </Link>
          <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
        </div>
      </div>

      <div className="max-w-[560px] mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Sales Manager Profile</h1>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
            Profile Photo
          </h2>

          {/* Photo preview */}
          <div className="mb-4">
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoUrl}
                alt="Sales manager profile"
                style={{
                  width: 100,
                  height: 140,
                  objectFit: "cover",
                  borderRadius: 8,
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{
                  width: 100,
                  height: 140,
                  borderRadius: 8,
                  border: "2px dashed #d1d5db",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f9fafb",
                }}
              >
                <span className="text-xs text-gray-400 text-center px-2">
                  Full-body photo here
                </span>
              </div>
            )}
          </div>

          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-indigo-400 text-indigo-600 rounded-md py-2 text-sm cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          >
            {uploading ? "Uploading…" : "⬆ Upload Photo"}
          </button>

          {/* Remove button */}
          {photoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="w-full border border-red-300 text-red-600 bg-white rounded-md py-2 text-sm cursor-pointer hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
            >
              {removing ? "Removing…" : "Remove Photo"}
            </button>
          )}

          {/* Tip text */}
          <p className="text-xs text-gray-400 mt-2">
            Best results: standing pose, plain background, good lighting. Max 5 MB.
          </p>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
