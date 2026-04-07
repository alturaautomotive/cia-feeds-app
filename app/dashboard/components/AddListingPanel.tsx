"use client";

import { useState, useRef, FormEvent } from "react";
import { getFieldsForVertical, VERTICAL_LABELS, type Vertical } from "@/lib/verticals";

interface Props {
  vertical: Vertical;
  onListingAdded: () => void;
}

type Tab = "manual" | "url" | "csv";

export function AddListingPanel({ vertical, onListingAdded }: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = getFieldsForVertical(vertical);
  const label = VERTICAL_LABELS[vertical];

  function setField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, imageUrls }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add listing.");
        return;
      }

      setFormData({});
      setImageUrls([]);
      setSuccess("Listing added successfully!");
      onListingAdded();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch("/api/listings/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to scrape URL.");
        return;
      }

      setUrlInput("");
      setSuccess("URL submitted for scraping!");
      onListingAdded();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/listings/upload", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "CSV upload failed.");
        return;
      }

      const data = await res.json();
      setSuccess(`${data.created} listing(s) imported.${data.errors?.length ? ` ${data.errors.length} row(s) had errors.` : ""}`);
      onListingAdded();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const availableTabs: { id: Tab; label: string }[] = [
    { id: "manual", label: "Manual Entry" },
  ];
  if (vertical === "ecommerce") {
    availableTabs.push({ id: "url", label: "Paste URL" });
  }
  if (vertical !== "services") {
    availableTabs.push({ id: "csv", label: "Upload CSV" });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-gray-900">Add New Listing</span>
        <span className="bg-indigo-50 text-indigo-600 text-xs font-semibold px-2 py-0.5 rounded-full">
          {label}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 pb-2.5">
        {availableTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            data-element-id={`tab-${t.id}`}
            onClick={() => { setTab(t.id); setError(null); setSuccess(null); }}
            className={`text-xs px-2.5 py-1 rounded-md ${
              tab === t.id
                ? "bg-indigo-600 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 mb-4">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Manual entry form */}
      {tab === "manual" && (
        <form onSubmit={handleManualSubmit}>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => {
              const isFullWidth = field.type === "textarea" || field.key === "name" || field.key === "title";
              return (
                <div key={field.key} className={isFullWidth ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      data-element-id={`field-${field.key}`}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-vertical"
                    />
                  ) : field.type === "select" ? (
                    <select
                      data-element-id={`field-${field.key}`}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select...</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      data-element-id={`field-${field.key}`}
                      type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  )}
                </div>
              );
            })}

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Images (up to 10)
              </label>
              <div
                data-element-id="field-images"
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 text-sm cursor-pointer hover:border-gray-400"
                onClick={() => {
                  const url = prompt("Enter image URL:");
                  if (url?.trim()) {
                    setImageUrls((prev) => [...prev.slice(0, 9), url.trim()]);
                  }
                }}
              >
                {imageUrls.length > 0
                  ? `${imageUrls.length} image(s) added. Click to add more.`
                  : "Click to add image URLs"}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              data-element-id="submit-btn"
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adding\u2026" : "Add Listing"}
            </button>
          </div>
        </form>
      )}

      {/* URL scrape tab */}
      {tab === "url" && (
        <form onSubmit={handleUrlSubmit} className="flex gap-2.5">
          <input
            data-element-id="url-input"
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste product URL to scrape\u2026"
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !urlInput.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Scraping\u2026" : "Scrape URL"}
          </button>
        </form>
      )}

      {/* CSV upload tab */}
      {tab === "csv" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="w-full border-2 border-dashed border-indigo-400 text-indigo-600 rounded-md py-4 text-sm cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Uploading\u2026" : "Click to upload CSV file"}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Upload a CSV with columns matching Meta&apos;s catalog format for your vertical.
          </p>
        </div>
      )}
    </div>
  );
}
