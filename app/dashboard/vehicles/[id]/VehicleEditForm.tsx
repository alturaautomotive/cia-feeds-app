"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Vehicle {
  id: string;
  url: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  bodyStyle: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  imageUrl: string | null;
  description: string | null;
  isComplete: boolean;
  missingFields: string[];
}

interface Props {
  vehicle: Vehicle;
}

export default function VehicleEditForm({ vehicle: initialVehicle }: Props) {
  const router = useRouter();
  const originalForm = {
    url: initialVehicle.url ?? "",
    vin: initialVehicle.vin ?? "",
    make: initialVehicle.make ?? "",
    model: initialVehicle.model ?? "",
    year: initialVehicle.year ?? "",
    bodyStyle: initialVehicle.bodyStyle ?? "",
    stateOfVehicle: initialVehicle.stateOfVehicle ?? "Used",
    price: initialVehicle.price !== null ? String(initialVehicle.price) : "",
    mileageValue:
      initialVehicle.mileageValue !== null
        ? String(initialVehicle.mileageValue)
        : "",
    exteriorColor: initialVehicle.exteriorColor ?? "",
    description: initialVehicle.description ?? "",
    imageUrl: initialVehicle.imageUrl ?? "",
  };

  const [formData, setFormData] = useState(originalForm);
  const [missingFields, setMissingFields] = useState<string[]>(
    initialVehicle.missingFields
  );
  const [imageUrlInput, setImageUrlInput] = useState(
    initialVehicle.imageUrl ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function isMissing(field: string): boolean {
    return missingFields.includes(field);
  }

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleUseImageUrl() {
    setFormData((prev) => ({ ...prev, imageUrl: imageUrlInput }));
    setSaved(false);
  }

  function handleCancel() {
    setFormData(originalForm);
    setImageUrlInput(initialVehicle.imageUrl ?? "");
    setSaved(false);
    setSaveError(null);
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Are you sure you want to delete this vehicle? This cannot be undone."
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/vehicles/${initialVehicle.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Delete failed. Please try again.");
      }
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const updates: Record<string, unknown> = {
      url: formData.url || null,
      vin: formData.vin || null,
      make: formData.make || null,
      model: formData.model || null,
      year: formData.year || null,
      bodyStyle: formData.bodyStyle || null,
      stateOfVehicle: formData.stateOfVehicle || null,
      price: formData.price ? parseFloat(formData.price) : null,
      mileageValue: formData.mileageValue
        ? parseInt(formData.mileageValue, 10)
        : null,
      exteriorColor: formData.exteriorColor || null,
      description: formData.description || null,
      imageUrl: formData.imageUrl || null,
    };

    try {
      const res = await fetch(`/api/vehicles/${initialVehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Save failed.");
        return;
      }

      const data = await res.json();
      setMissingFields(data.missingFields ?? []);
      setSaved(true);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = [initialVehicle.year, initialVehicle.make, initialVehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-indigo-500 hover:text-indigo-600"
          >
            ← Back
          </Link>
          <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1.5">
          {title || "Unknown Vehicle"}
        </h1>
        <p className="text-sm text-gray-500 mb-6 truncate">
          VDP:{" "}
          <a
            href={formData.url || initialVehicle.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-500 hover:underline"
          >
            {formData.url || initialVehicle.url}
          </a>
        </p>

        {/* Missing fields alert */}
        {missingFields.length > 0 && (
          <div
            data-element-id="missing-fields-alert"
            className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-800 mb-5"
          >
            ⚠️ Missing required fields:{" "}
            <strong>{missingFields.join(", ")}</strong>. Please fill them in
            below.
          </div>
        )}

        {/* Save success */}
        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800 mb-5">
            ✓ Changes saved successfully.
          </div>
        )}

        {/* Save error */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-800 mb-5">
            <strong>Error:</strong> {saveError}
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* Vehicle Details card */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              Vehicle Details
            </h2>
            <div className="col-span-2 flex flex-col gap-1 mb-4">
              <label className="text-xs font-semibold text-gray-500">
                VDP URL
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => handleChange("url", e.target.value)}
                placeholder="https://…"
                className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isMissing("url")
                    ? "border-red-400 bg-red-50"
                    : "border-gray-300"
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Year
                </label>
                <input
                  type="text"
                  value={formData.year}
                  onChange={(e) => handleChange("year", e.target.value)}
                  placeholder="e.g. 2023"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("year")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Make
                </label>
                <input
                  type="text"
                  value={formData.make}
                  onChange={(e) => handleChange("make", e.target.value)}
                  placeholder="e.g. Honda"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("make")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Model
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => handleChange("model", e.target.value)}
                  placeholder="e.g. Civic"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("model")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Body Style
                </label>
                <input
                  type="text"
                  value={formData.bodyStyle}
                  onChange={(e) => handleChange("bodyStyle", e.target.value)}
                  placeholder="e.g. SUV"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  VIN
                </label>
                <input
                  type="text"
                  value={formData.vin}
                  onChange={(e) => handleChange("vin", e.target.value)}
                  placeholder="17-character VIN"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Condition
                </label>
                <select
                  value={formData.stateOfVehicle}
                  onChange={(e) =>
                    handleChange("stateOfVehicle", e.target.value)
                  }
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("state_of_vehicle")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                >
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                  <option value="Certified Used">Certified Used</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Price ($)
                </label>
                <input
                  data-element-id="price-input"
                  type="number"
                  value={formData.price}
                  onChange={(e) => handleChange("price", e.target.value)}
                  placeholder="Enter price…"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("price")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Mileage
                </label>
                <input
                  data-element-id="mileage-input"
                  type="number"
                  value={formData.mileageValue}
                  onChange={(e) => handleChange("mileageValue", e.target.value)}
                  placeholder="Enter mileage…"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("mileageValue")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Exterior Color
                </label>
                <input
                  data-element-id="color-input"
                  type="text"
                  value={formData.exteriorColor}
                  onChange={(e) =>
                    handleChange("exteriorColor", e.target.value)
                  }
                  placeholder="Enter color…"
                  className={`border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isMissing("exteriorColor")
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  rows={3}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 resize-vertical focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Image card */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              Image
            </h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                formData.imageUrl ||
                "https://placehold.co/800x180?text=No+Image+Scraped"
              }
              alt={formData.imageUrl ? "Vehicle" : "No image"}
              className="w-full max-h-48 object-cover rounded-md border border-gray-200 mb-3"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://placehold.co/800x180?text=Image+Not+Found";
              }}
            />
            <div className="flex gap-2">
              <input
                data-element-id="image-url-input"
                type="url"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="Paste image URL…"
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleUseImageUrl}
                className="bg-white border border-gray-300 text-gray-700 px-3.5 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-50"
              >
                Use This URL
              </button>
            </div>
          </div>

          {/* Delete error */}
          {deleteError && (
            <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-800 mb-5">
              <strong>Error:</strong> {deleteError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto border border-red-500 text-red-600 bg-white px-4 py-2 rounded-md text-sm cursor-pointer hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting…" : "Delete Vehicle"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              data-element-id="save-btn"
              type="submit"
              disabled={saving}
              className="bg-indigo-500 text-white border-none px-6 py-2 rounded-md text-sm font-semibold cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
