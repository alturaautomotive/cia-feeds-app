"use client";

import { useState, useRef, FormEvent } from "react";
import { getFieldsForVertical, VERTICAL_LABELS, VERTICAL_REQUIRED_IMAGE, type Vertical } from "@/lib/verticals";

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const fields = getFieldsForVertical(vertical);
  const label = VERTICAL_LABELS[vertical];

  const VERTICAL_ACTION_LABELS: Record<Vertical, { title: string; submit: string }> = {
    automotive: { title: "Add New Vehicle", submit: "Add Vehicle" },
    services: { title: "Add New Service", submit: "Add Service" },
    ecommerce: { title: "Add New Product", submit: "Add Product" },
    realestate: { title: "Add New Listing", submit: "Add Listing" },
  };
  const actionLabels = VERTICAL_ACTION_LABELS[vertical];

  function setField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // Clear field error on change
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validateFields(): boolean {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.required) {
        const val = formData[field.key]?.trim();
        if (!val) {
          errors[field.key] = `${field.label} is required`;
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";

    const remaining = 10 - imageUrls.length;
    if (remaining <= 0) {
      setError("Maximum 10 images allowed.");
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploadingImages(true);
    setError(null);

    try {
      const fd = new FormData();
      for (const file of filesToUpload) {
        fd.append("files", file);
      }

      const res = await fetch("/api/listings/upload-image", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Image upload failed.");
        return;
      }

      const data = await res.json();
      setImageUrls((prev) => [...prev, ...data.urls].slice(0, 10));
      // Clear image field error when images are successfully added
      if (fieldErrors.image_url) {
        setFieldErrors((prev) => { const next = { ...prev }; delete next.image_url; return next; });
      }
    } catch {
      setError("Image upload failed. Please try again.");
    } finally {
      setUploadingImages(false);
    }
  }

  function removeImage(index: number) {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateFields()) return;

    // Enforce image requirement for verticals that need image_url
    if (VERTICAL_REQUIRED_IMAGE[vertical] && imageUrls.length === 0) {
      setFieldErrors((prev) => ({ ...prev, image_url: "At least one image is required" }));
      return;
    }

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
      setFieldErrors({});
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

    let normalizedUrl = urlInput.trim();
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      setError("Please enter a valid URL (e.g. https://example.com)");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/listings/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
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
      setSuccess(`${data.created} listing(s) imported.${data.skipped ? ` ${data.skipped} skipped.` : ""}${data.errors?.length ? ` ${data.errors.length} row(s) had errors.` : ""}`);
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
        <span className="text-sm font-semibold text-gray-900">{actionLabels.title}</span>
        <span className="bg-indigo-50 text-indigo-600 text-xs font-semibold px-2 py-0.5 rounded-full">
          {label}
        </span>
      </div>

      {/* Tabs */}
      {availableTabs.length > 1 && (
        <div className="flex gap-2 mb-4 border-b border-gray-200 pb-2.5">
          {availableTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-element-id={`tab-${t.id}`}
              onClick={() => { setTab(t.id); setError(null); setSuccess(null); setFieldErrors({}); }}
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
      )}

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
              const hasError = !!fieldErrors[field.key];
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
                      className={`w-full border rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-vertical ${
                        hasError ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                  ) : field.type === "select" ? (
                    <select
                      data-element-id={`field-${field.key}`}
                      value={formData[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={`w-full border rounded-md px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                        hasError ? "border-red-400" : "border-gray-300"
                      }`}
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
                      className={`w-full border rounded-md px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                        hasError ? "border-red-400" : "border-gray-300"
                      }`}
                    />
                  )}
                  {hasError && (
                    <p className="text-xs text-red-500 mt-0.5">{fieldErrors[field.key]}</p>
                  )}
                </div>
              );
            })}

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Images (up to 10)
              </label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
              {imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="w-16 h-16 rounded object-cover border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div
                data-element-id="field-images"
                className={`border-2 border-dashed rounded-lg p-4 text-center text-sm cursor-pointer ${
                  fieldErrors.image_url
                    ? "border-red-400 text-red-400 hover:border-red-500"
                    : "border-gray-300 text-gray-400 hover:border-gray-400"
                }`}
                onClick={() => !uploadingImages && imageInputRef.current?.click()}
              >
                {uploadingImages
                  ? "Uploading\u2026"
                  : imageUrls.length > 0
                    ? `${imageUrls.length} image(s) added. Click to add more.`
                    : "Click to upload images"}
              </div>
              {fieldErrors.image_url && (
                <p className="text-xs text-red-500 mt-0.5">{fieldErrors.image_url}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              data-element-id="submit-btn"
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Adding\u2026" : actionLabels.submit}
            </button>
          </div>
        </form>
      )}

      {/* URL scrape tab */}
      {tab === "url" && (
        <form onSubmit={handleUrlSubmit} className="flex gap-2.5">
          <input
            data-element-id="url-input"
            type="text"
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
