"use client";

import { useState, useRef, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  images: string[];
  description: string | null;
  isComplete: boolean;
  missingFields: string[];
  spotlightImageUrl?: string | null;
}

interface ImageItem {
  id: string;
  url: string;
}

interface Props {
  vehicle: Vehicle;
  dealerProfileImageUrl: string | null;
}

function makeImageItems(urls: string[]): ImageItem[] {
  return urls.map((url) => ({ id: crypto.randomUUID(), url }));
}

function SortableImageTile({
  id,
  url,
  index,
  total,
  onDelete,
}: {
  id: string;
  url: string;
  index: number;
  total: number;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        aspectRatio: "4/3",
        position: "relative",
        overflow: "hidden",
        borderRadius: "0.375rem",
        border: "1px solid #e5e7eb",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Vehicle"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23d1d5db'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%236b7280'%3EImage not found%3C/text%3E%3C/svg%3E";
        }}
      />
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        style={{
          position: "absolute",
          top: 4,
          left: 4,
          cursor: "grab",
          background: "rgba(0,0,0,0.4)",
          color: "white",
          border: "none",
          borderRadius: "0.25rem",
          padding: "2px 5px",
          fontSize: "14px",
          lineHeight: 1,
        }}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      {/* Delete button */}
      <button
        type="button"
        onClick={onDelete}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          cursor: "pointer",
          background: "rgba(0,0,0,0.5)",
          color: "white",
          border: "none",
          borderRadius: "9999px",
          width: 22,
          height: 22,
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Remove image"
      >
        ✕
      </button>
      {/* Primary badge */}
      {index === 0 && (
        <span
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            background: "#4f46e5",
            color: "white",
            fontSize: "10px",
            fontWeight: 700,
            borderRadius: "0.25rem",
            padding: "1px 5px",
          }}
        >
          Primary
        </span>
      )}
      {/* Required warning badge */}
      {total === 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            background: "#f59e0b",
            color: "white",
            fontSize: "10px",
            fontWeight: 700,
            borderRadius: "0.25rem",
            padding: "1px 5px",
          }}
        >
          ⚠ Required
        </span>
      )}
    </div>
  );
}

export default function VehicleEditForm({ vehicle: initialVehicle, dealerProfileImageUrl }: Props) {
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
  };

  const [formData, setFormData] = useState(originalForm);
  const [missingFields, setMissingFields] = useState<string[]>(
    initialVehicle.missingFields
  );
  const [images, setImages] = useState<ImageItem[]>(() =>
    makeImageItems(
      initialVehicle.images?.length
        ? initialVehicle.images
        : initialVehicle.imageUrl
        ? [initialVehicle.imageUrl]
        : []
    )
  );
  const persistedImagesRef = useRef<string[]>(
    initialVehicle.images?.length
      ? initialVehicle.images
      : initialVehicle.imageUrl
      ? [initialVehicle.imageUrl]
      : []
  );
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageUrlError, setImageUrlError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSaved, setUploadSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [spotlightEnabled, setSpotlightEnabled] = useState(!!initialVehicle.spotlightImageUrl);
  const [signMessage, setSignMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [spotlightUrl, setSpotlightUrl] = useState<string | null>(initialVehicle.spotlightImageUrl ?? null);
  const [spotlightError, setSpotlightError] = useState<string | null>(null);
  const [spotlightAdded, setSpotlightAdded] = useState(false);

  function isMissing(field: string): boolean {
    return missingFields.includes(field);
  }

  function handleChange(field: keyof typeof formData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleCancel() {
    setFormData(originalForm);
    setImages(makeImageItems(persistedImagesRef.current));
    setSaved(false);
    setSaveError(null);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadSaved(false);
    setSaveError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("vehicleId", initialVehicle.id);
    try {
      const res = await fetch("/api/vehicles/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Upload failed.");
        return;
      }
      const data = await res.json();
      persistedImagesRef.current = data.images;
      setImages(makeImageItems(data.images));
      setUploadSaved(true);
      setTimeout(() => setUploadSaved(false), 3000);
    } catch {
      setSaveError("Network error during upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((prev) => {
        const oldIndex = prev.findIndex((img) => img.id === active.id);
        const newIndex = prev.findIndex((img) => img.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
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
      images: images.map((img) => img.url),
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
      if (Array.isArray(data.vehicle?.images)) {
        persistedImagesRef.current = data.vehicle.images;
        setImages(makeImageItems(data.vehicle.images));
      }
      setSaved(true);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSpotlight() {
    setSpotlightUrl(null);
    setSpotlightAdded(false);
    setSpotlightError(null);
    setGenerating(true);

    const currentUrls = images.map((i) => i.url);
    const persistedUrls = persistedImagesRef.current;
    const imagesChanged =
      currentUrls.length !== persistedUrls.length ||
      currentUrls.some((url, idx) => url !== persistedUrls[idx]);
    if (imagesChanged) {
      try {
        const saveRes = await fetch(`/api/vehicles/${initialVehicle.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: currentUrls }),
        });
        if (!saveRes.ok) {
          setSpotlightError("Could not save image changes before generating. Please try again.");
          setGenerating(false);
          return;
        }
        const saveData = await saveRes.json();
        if (Array.isArray(saveData.vehicle?.images)) {
          persistedImagesRef.current = saveData.vehicle.images;
        }
      } catch {
        setSpotlightError("Could not save image changes before generating. Please try again.");
        setGenerating(false);
        return;
      }
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      setGenerating(false);
      setSpotlightError("Generation timed out. Please try again.");
    }, 55000);
    try {
      const res = await fetch(`/api/vehicles/${initialVehicle.id}/spotlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signMessage: signMessage.trim() || undefined }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data.error;
        if (code === "no_profile_image") {
          setSpotlightError("Add a sales manager photo in your Profile to use CIA Spotlight.");
        } else if (code === "no_vehicle_image") {
          setSpotlightError("This vehicle needs at least one image before generating a Spotlight.");
        } else if (code === "generation_failed") {
          setSpotlightError("Image generation failed. Please try again.");
        } else if (code === "upload_failed") {
          setSpotlightError("Failed to save the generated image. Please try again.");
        } else if (code === "db_update_failed") {
          setSpotlightError("The image was generated but could not be saved. Please try again.");
        } else if (code === "misconfigured_gemini") {
          setSpotlightError("Spotlight is temporarily unavailable. Please contact support.");
        } else {
          setSpotlightError("Something went wrong. Please try again.");
        }
        return;
      }
      const data = await res.json();
      setSpotlightUrl(data.spotlightImageUrl);
      setSpotlightAdded(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setSpotlightError("Network error. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  }

  async function handleUseSpotlightImage() {
    if (!spotlightUrl || images.some(i => i.url === spotlightUrl)) return;
    const newImages = [...images.map(i => i.url), spotlightUrl];
    try {
      const res = await fetch(`/api/vehicles/${initialVehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: newImages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data.error;
        if (code === "validation_error") {
          setSpotlightError("The image could not be added due to a validation error. Please try again.");
        } else if (code === "unauthorized") {
          setSpotlightError("You are not authorized to update this listing.");
        } else if (code === "not_found") {
          setSpotlightError("This vehicle listing could not be found. Please refresh and try again.");
        } else {
          setSpotlightError("Failed to add the spotlight image to your listing. Please try again.");
        }
        return;
      }
      const data = await res.json();
      persistedImagesRef.current = data.vehicle.images;
      setImages(makeImageItems(data.vehicle.images));
      setSpotlightAdded(true);
    } catch {
      setSpotlightError("Network error. Please try again.");
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
                    : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                  className="border border-gray-400 bg-white rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="border border-gray-400 bg-white rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                      : "border-gray-400 bg-white"
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
                  className="border border-gray-400 bg-white rounded-md px-3 py-2 text-sm text-gray-900 resize-vertical focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Images card */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              Images
            </h2>

            {/* Empty state */}
            {images.length === 0 && (
              <div className="border-2 border-dashed border-red-400 rounded-lg p-8 text-center text-red-500 text-sm mb-4">
                At least one image is required. Add a URL or upload a photo below.
              </div>
            )}

            {/* Sortable grid */}
            {images.length > 0 && (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {images.map((img, i) => (
                      <SortableImageTile
                        key={img.id}
                        id={img.id}
                        url={img.url}
                        index={i}
                        total={images.length}
                        onDelete={() =>
                          setImages((prev) =>
                            prev.filter((item) => item.id !== img.id)
                          )
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* URL add row */}
            <div className="flex gap-2 mb-3">
              <input
                data-element-id="image-url-input"
                type="url"
                value={imageUrlInput}
                onChange={(e) => {
                  setImageUrlInput(e.target.value);
                  setImageUrlError(null);
                }}
                placeholder="Paste image URL…"
                className={`flex-1 border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${imageUrlError ? "border-red-400" : "border-gray-400 bg-white"}`}
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = imageUrlInput.trim();
                  if (!trimmed) return;
                  let parsed: URL;
                  try {
                    parsed = new URL(trimmed);
                  } catch {
                    setImageUrlError("Please enter a valid URL.");
                    return;
                  }
                  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                    setImageUrlError("Only http and https URLs are allowed.");
                    return;
                  }
                  setImageUrlError(null);
                  setImages((prev) => [...prev, { id: crypto.randomUUID(), url: trimmed }]);
                  setImageUrlInput("");
                }}
                className="bg-white border border-gray-300 text-gray-700 px-3.5 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-50"
              >
                Add URL
              </button>
            </div>
            {imageUrlError && (
              <p className="text-xs text-red-600 mt-1 mb-2">{imageUrlError}</p>
            )}

            {/* Upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-indigo-400 text-indigo-600 rounded-md py-2 text-sm cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading…" : "⬆ Upload Image"}
            </button>
            {uploadSaved && (
              <p className="text-xs text-green-600 mt-1.5 text-center">
                ✓ Image saved
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* CIA Spotlight card */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-5">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                ✨ CIA Spotlight
              </h2>
              <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                AI-POWERED
              </span>
            </div>

            {/* Toggle row */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-700">Enable CIA Spotlight for this listing</span>
              <button
                type="button"
                onClick={() => setSpotlightEnabled((prev) => !prev)}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${
                  spotlightEnabled ? "bg-indigo-500" : "bg-gray-200"
                }`}
                aria-pressed={spotlightEnabled}
              >
                <span
                  className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                    spotlightEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-500 mb-4">
              Generate a composite image of your sales manager standing next to this vehicle, holding a custom sign. The vehicle photo stays untouched.
            </p>

            {/* Conditional content */}
            {spotlightEnabled && (
              <>
                {!dealerProfileImageUrl ? (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-800 mb-4">
                    Add a sales manager photo in your Profile to use CIA Spotlight.
                    <Link href="/dashboard/profile" className="underline ml-1">
                      Go to Profile →
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Sign message input */}
                    <div className="mb-4">
                      <label className="text-xs font-semibold text-gray-500 block mb-1">
                        Sign Message (optional)
                      </label>
                      <input
                        type="text"
                        value={signMessage}
                        onChange={(e) => setSignMessage(e.target.value)}
                        maxLength={100}
                        placeholder="e.g. I&apos;m willing to lose money on this one!"
                        className="border border-gray-400 bg-white rounded-md px-3 py-2 text-sm w-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Leave blank and the manager will give a thumbs up with no sign text.
                      </p>
                    </div>

                    {/* Generate button */}
                    <button
                      type="button"
                      onClick={handleGenerateSpotlight}
                      disabled={generating}
                      className="w-full bg-indigo-500 text-white rounded-md py-2.5 text-sm font-semibold cursor-pointer hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generating ? "Generating your Spotlight image…" : "✨ Generate Spotlight Image"}
                    </button>

                    {/* Error */}
                    {spotlightError && (
                      <p className="text-sm text-red-600 mt-2">{spotlightError}</p>
                    )}

                    {/* Preview */}
                    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                      {spotlightUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            key={spotlightUrl ?? "empty"}
                            src={spotlightUrl}
                            alt="CIA Spotlight"
                            className="w-full object-cover block mx-auto"
                          />
                          <div className="p-3">
                            <button
                              type="button"
                              onClick={handleUseSpotlightImage}
                              disabled={spotlightAdded || images.some(i => i.url === spotlightUrl) || saving}
                              className="mt-3 w-full border border-indigo-500 text-indigo-600 bg-white rounded-md py-2 text-sm font-semibold cursor-pointer hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {spotlightAdded ? "✓ Added to listing" : "✅ Use this image"}
                            </button>
                            {spotlightAdded && (
                              <p className="text-xs text-green-600 mt-1 text-center">✓ Spotlight image added to your listing</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="h-44 bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                          Generated image will appear here
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
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
              disabled={saving || images.length === 0}
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
