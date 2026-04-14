"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const VERTICALS = [
  { id: "automotive", icon: "\u{1F697}", title: "Automotive", desc: "Vehicle listings" },
  { id: "services", icon: "\u{1F527}", title: "Services", desc: "Local service businesses" },
  { id: "realestate", icon: "\u{1F3E0}", title: "Real Estate", desc: "Property listings for sale or rent" },
] as const;

interface Props {
  profileImageUrl: string | null;
  currentVertical: string;
  websiteUrl: string | null;
  address: string | null;
  phone: string | null;
  fbPageId: string | null;
  isMetaConnected: boolean;
  metaCatalogId: string | null;
  metaFeedId: string | null;
}

type MetaStep =
  | "idle"
  | "pages"
  | "businesses"
  | "catalogs"
  | "feed"
  | "done";

export default function ProfileClient({
  profileImageUrl: initialPhotoUrl,
  currentVertical: initialVertical,
  websiteUrl: initialWebsiteUrl,
  address: initialAddress,
  phone: initialPhone,
  fbPageId: initialFbPageId,
  isMetaConnected: initialIsMetaConnected,
  metaCatalogId: initialMetaCatalogId,
  metaFeedId: initialMetaFeedId,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [vertical, setVertical] = useState(initialVertical);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const [siteUrl, setSiteUrl] = useState(initialWebsiteUrl ?? "");
  const [savingSiteUrl, setSavingSiteUrl] = useState(false);
  const [siteUrlSaved, setSiteUrlSaved] = useState(false);

  const [dealerAddress, setDealerAddress] = useState(initialAddress ?? "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);

  const [phone, setPhone] = useState(initialPhone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Meta Business Integration wizard state
  const [isMetaConnected, setIsMetaConnected] = useState(initialIsMetaConnected);
  const [metaFeedId, setMetaFeedId] = useState<string | null>(initialMetaFeedId);
  const [metaCatalogId, setMetaCatalogId] = useState<string | null>(initialMetaCatalogId);
  const [fbPageId, setFbPageId] = useState<string | null>(initialFbPageId);
  const [metaStep, setMetaStep] = useState<MetaStep>(
    initialMetaFeedId ? "done" : "idle"
  );
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPageId, setSelectedPageId] = useState(initialFbPageId ?? "");
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [selectedBmId, setSelectedBmId] = useState("");
  const [catalogs, setCatalogs] = useState<{ id: string; name: string }[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [newCatalogName, setNewCatalogName] = useState("");
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaTosRequired, setMetaTosRequired] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaMode, setMetaMode] = useState<"existing" | "new">("existing");
  const [disconnecting, setDisconnecting] = useState(false);
  const [businessSkipped, setBusinessSkipped] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/fb/disconnect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMetaError(data.error || "Failed to disconnect Meta.");
        return;
      }
      // Reset all Meta UI state on success
      setIsMetaConnected(false);
      setMetaFeedId(null);
      setMetaCatalogId(null);
      setFbPageId(null);
      setMetaStep("idle");
      setPages([]);
      setBusinesses([]);
      setCatalogs([]);
      setSelectedPageId("");
      setSelectedBmId("");
      setSelectedCatalogId("");
      setNewCatalogName("");
      setMetaError(null);
      setMetaTosRequired(false);
      setBusinessSkipped(false);
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function loadPages() {
    console.log("[Meta Wizard] loadPages — starting");
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/fb/pages");
      const data = await res.json().catch(() => ({}));
      console.log("[Meta Wizard] loadPages — response status:", res.status, "pages count:", (data.pages || []).length);
      if (!res.ok) {
        setMetaError(data.error || "Failed to load Facebook Pages.");
        return;
      }
      setPages(data.pages || []);
      setMetaStep("pages");
      console.log("[Meta Wizard] metaStep -> pages");
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  async function submitPage() {
    if (!selectedPageId) {
      setMetaError("Please pick a Facebook Page.");
      return;
    }
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/fb/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: selectedPageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMetaError(data.error || "Failed to save Facebook Page.");
        return;
      }
      setFbPageId(data.pageId);
      await loadBusinesses();
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadBusinesses() {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/fb/businesses");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMetaError(data.error || "Failed to load businesses.");
        return;
      }
      setBusinesses(data.businesses || []);
      setMetaStep("businesses");
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  async function loadCatalogs(businessId: string) {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch(`/api/fb/catalogs?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMetaError(data.error || "Failed to load catalogs.");
        return;
      }
      setCatalogs(data.catalogs || []);
      setMetaStep("catalogs");
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  async function submitCatalog() {
    setMetaLoading(true);
    setMetaError(null);
    setMetaTosRequired(false);
    try {
      const body: Record<string, string> = { businessId: selectedBmId };
      if (metaMode === "existing") {
        if (!selectedCatalogId) {
          setMetaError("Please pick a catalog.");
          return;
        }
        body.catalogId = selectedCatalogId;
      } else {
        if (!newCatalogName.trim()) {
          setMetaError("Please enter a catalog name.");
          return;
        }
        body.catalogName = newCatalogName.trim();
      }
      const res = await fetch("/api/fb/catalogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "catalog_tos_required") {
          setMetaTosRequired(true);
          setMetaError(
            "Meta requires you to accept the Commerce terms before a catalog can be created."
          );
          return;
        }
        setMetaError(data.error || "Failed to save catalog.");
        return;
      }
      setMetaCatalogId(data.catalogId);
      setMetaStep("feed");
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  async function publishFeed() {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/fb/feed", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const feedErrorMessages: Record<string, string> = {
          add_items_first: "Please add at least one item to your inventory before registering a feed.",
          meta_not_connected: "Please connect your Meta account first.",
          catalog_not_selected: "Please select a catalog before registering a feed.",
        };
        setMetaError(feedErrorMessages[data.error] || data.error || "Failed to register feed.");
        return;
      }
      setMetaFeedId(data.feedId);
      setMetaStep("done");
    } catch {
      setMetaError("Network error. Please try again.");
    } finally {
      setMetaLoading(false);
    }
  }

  function resetWizard() {
    setMetaStep("idle");
    setMetaError(null);
    setMetaTosRequired(false);
    setBusinessSkipped(false);
    setPages([]);
    setBusinesses([]);
    setCatalogs([]);
    setSelectedPageId(initialFbPageId ?? "");
    setSelectedBmId("");
    setSelectedCatalogId("");
    setNewCatalogName("");
  }

  // On mount — if the query param says we just connected, auto-load Pages so
  // the user can explicitly select which Facebook Page to bind to fb_page_id.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fbParam = params.get("fb");
    console.log("[Meta Wizard] mount effect — fb param:", fbParam, "initialMetaFeedId:", initialMetaFeedId);
    if (fbParam === "connected") {
      console.log("[Meta Wizard] fb=connected detected — resetting wizard and loading pages unconditionally");
      setIsMetaConnected(true);
      // Always restart the wizard from pages step — regardless of whether a
      // feed already exists. This lets `?fb=connected` act as a forced
      // recovery/restart mechanism for already-connected users too.
      resetWizard();
      loadPages();
      // Clean the URL so a refresh doesn't re-trigger the wizard.
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount/backout — reset wizard state so re-entry always lands
  // on idle/Continue Setup for incomplete setups (prevents frozen-button UX).
  useEffect(() => {
    return () => {
      console.log("[Meta Wizard] unmount — resetting wizard state");
      setMetaStep("idle");
      setMetaError(null);
      setMetaTosRequired(false);
      setMetaLoading(false);
      setPages([]);
      setBusinesses([]);
      setCatalogs([]);
      setSelectedPageId(initialFbPageId ?? "");
      setSelectedBmId("");
      setSelectedCatalogId("");
      setNewCatalogName("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showWebsiteUrl = vertical === "automotive";

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

        {/* Business Address — visible for all verticals */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            Business Address
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Your address is geocoded and used in your Meta feed.
          </p>
          <div className="flex gap-2.5">
            <input
              data-element-id="business-address-input"
              type="text"
              className="flex-1 border border-gray-400 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="1875 Buford Highway, Cumming, GA 30041"
              value={dealerAddress}
              onChange={(e) => {
                setDealerAddress(e.target.value);
                setAddressSaved(false);
                setAddressError(null);
              }}
            />
            <button
              type="button"
              disabled={savingAddress}
              onClick={async () => {
                setSavingAddress(true);
                setAddressError(null);
                setAddressSaved(false);
                setAddressLat(null);
                setAddressLng(null);
                try {
                  const res = await fetch("/api/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ address: dealerAddress.trim() || null }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setAddressError(
                      data.error === "geocoding_failed"
                        ? "Could not geocode that address. Please try a more specific address."
                        : data.error || "Failed to save address."
                    );
                    return;
                  }
                  const data = await res.json().catch(() => ({}));
                  setAddressSaved(true);
                  if (data?.dealer?.latitude != null && data?.dealer?.longitude != null) {
                    setAddressLat(data.dealer.latitude);
                    setAddressLng(data.dealer.longitude);
                  }
                } catch {
                  setAddressError("Network error. Please try again.");
                } finally {
                  setSavingAddress(false);
                }
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingAddress ? "Saving\u2026" : "Save"}
            </button>
          </div>
          {addressSaved && (
            <p className="text-xs text-green-600 mt-2">Address saved &amp; geocoded.</p>
          )}
          {addressSaved && addressLat != null && addressLng != null && (
            <p className="text-xs text-gray-400 mt-1">
              {"\u{1F4CD}"} {addressLat.toFixed(3)}, {addressLng.toFixed(3)}
            </p>
          )}
          {addressError && (
            <p className="text-xs text-red-600 mt-2">{addressError}</p>
          )}
        </div>

        {/* Business Phone */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            Business Phone
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Your phone number is used for SMS contact in your catalog widget.
          </p>
          <div className="flex gap-2.5">
            <input
              type="tel"
              data-element-id="business-phone-input"
              placeholder="(770) 555-1234"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneSaved(false);
                setPhoneError(null);
              }}
              className="flex-1 border border-gray-400 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              disabled={savingPhone}
              onClick={async () => {
                setSavingPhone(true);
                setPhoneSaved(false);
                setPhoneError(null);
                try {
                  const res = await fetch("/api/profile", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone: phone.trim() || null }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setPhoneError(
                      data.error === "invalid_phone"
                        ? "Please enter a valid phone number."
                        : data.error || "Failed to save phone number."
                    );
                    return;
                  }
                  setPhoneSaved(true);
                } catch {
                  setPhoneError("Network error. Please try again.");
                } finally {
                  setSavingPhone(false);
                }
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingPhone ? "Saving\u2026" : "Save"}
            </button>
          </div>
          {phoneSaved && (
            <p className="text-xs text-green-600 mt-2">Phone number saved.</p>
          )}
          {phoneError && (
            <p className="text-xs text-red-600 mt-2">{phoneError}</p>
          )}
        </div>

        {/* Meta Business Integration */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            Meta Business Integration
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Connect your Meta Business Manager so your CIA feed publishes directly to a product catalog.
          </p>

          {metaError && (
            <div className="rounded-md bg-red-50 p-3 mb-3">
              <p className="text-sm text-red-600">{metaError}</p>
              {metaTosRequired && (
                <a
                  href={
                    selectedBmId
                      ? `https://business.facebook.com/${selectedBmId}/commerce_manager/catalogs/`
                      : "https://business.facebook.com/commerce_manager/catalogs/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-700 underline mt-1 inline-block"
                >
                  Open Meta Commerce Manager to accept terms &rarr;
                </a>
              )}
            </div>
          )}

          {(isMetaConnected || metaFeedId || fbPageId || metaCatalogId) && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full border border-red-300 text-red-600 bg-white rounded-md py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {disconnecting ? "Disconnecting\u2026" : "Disconnect Meta"}
            </button>
          )}

          {metaStep === "done" && metaFeedId && (
            <div>
              <div className="rounded-md bg-green-50 border border-green-200 p-3">
                <p className="text-sm text-green-700 font-medium">
                  {"\u2705"} Feed connected to Meta
                </p>
                {fbPageId && (
                  <p className="text-xs text-green-600 mt-1 break-all">
                    Page ID: {fbPageId}
                  </p>
                )}
                <p className="text-xs text-green-600 mt-1 break-all">
                  Feed ID: {metaFeedId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { resetWizard(); loadPages(); }}
                disabled={metaLoading}
                className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 underline disabled:opacity-50"
              >
                Reconnect / Change Setup
              </button>
            </div>
          )}

          {metaStep === "idle" && !isMetaConnected && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Step 1 of 5</div>
              <button
                type="button"
                data-element-id="meta-connect"
                onClick={() => { window.location.href = "/api/fb/oauth"; }}
                className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700"
              >
                Connect Meta Business &rarr;
              </button>
            </div>
          )}

          {metaStep === "idle" && isMetaConnected && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Meta account connected.</p>
              <button
                type="button"
                onClick={loadPages}
                disabled={metaLoading}
                className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {metaLoading ? "Loading\u2026" : "Continue Setup"}
              </button>
            </div>
          )}

          {metaStep === "pages" && (
            <div>
              <div className="text-xs text-gray-500 mb-2">
                Step 2 of 5 — Select Facebook Page
              </div>
              <p className="text-xs text-gray-500 mb-2">
                This Page&apos;s id will be written to every row of your Meta
                feed CSV as <code className="font-mono">fb_page_id</code>.
              </p>
              {pages.length === 0 ? (
                <p className="text-sm text-gray-500 mb-2">
                  No Facebook Pages found for your account.
                </p>
              ) : (
                <select
                  data-element-id="meta-page-select"
                  className="w-full border border-gray-400 bg-white rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                >
                  <option value="">-- Choose a Facebook Page --</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={!selectedPageId || metaLoading}
                onClick={submitPage}
                className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {metaLoading ? "Saving\u2026" : "Next \u2192"}
              </button>
              <button type="button" onClick={resetWizard} className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline">
                Start Over
              </button>
            </div>
          )}

          {metaStep === "businesses" && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Step 3 of 5 — Select Business Manager</div>
              {businesses.length === 0 ? (
                <div className="mb-3">
                  {(() => { console.log("[Meta Wizard] businesses.length === 0 — no Business Managers found"); return null; })()}
                  <p className="text-sm text-gray-500 mb-2">
                    No Business Managers found for your account.
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    No Business Managers?{" "}
                    <a
                      href="https://business.facebook.com/overview"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-700 underline"
                    >
                      Create one
                    </a>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={metaLoading}
                      onClick={loadBusinesses}
                      className="flex-1 border border-gray-300 text-gray-700 bg-white rounded-md py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      {metaLoading ? "Loading\u2026" : "Retry"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        console.log("[Meta Wizard] User skipped business selection — falling back to pages step");
                        setBusinessSkipped(true);
                        setMetaStep("pages");
                      }}
                      className="flex-1 border border-gray-300 text-gray-700 bg-white rounded-md py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  data-element-id="meta-business-select"
                  className="w-full border border-gray-400 bg-white rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={selectedBmId}
                  onChange={(e) => setSelectedBmId(e.target.value)}
                >
                  <option value="">-- Choose a business --</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              {businesses.length > 0 && (
                <button
                  type="button"
                  disabled={!selectedBmId || metaLoading}
                  onClick={() => loadCatalogs(selectedBmId)}
                  className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {metaLoading ? "Loading\u2026" : "Next \u2192"}
                </button>
              )}
              <button type="button" onClick={resetWizard} className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline">
                Start Over
              </button>
            </div>
          )}

          {metaStep === "catalogs" && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Step 4 of 5 — Select or Create Catalog</div>

              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setMetaMode("existing")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${
                    metaMode === "existing"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-300 bg-white text-gray-600"
                  }`}
                >
                  Use Existing
                </button>
                <button
                  type="button"
                  onClick={() => setMetaMode("new")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${
                    metaMode === "new"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-300 bg-white text-gray-600"
                  }`}
                >
                  + Create New
                </button>
              </div>

              {metaMode === "existing" ? (
                catalogs.length === 0 ? (
                  <p className="text-xs text-gray-500 mb-3">
                    No existing catalogs in this business. Switch to &quot;Create New&quot;.
                  </p>
                ) : (
                  <select
                    data-element-id="meta-catalog-select"
                    className="w-full border border-gray-400 bg-white rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedCatalogId}
                    onChange={(e) => setSelectedCatalogId(e.target.value)}
                  >
                    <option value="">-- Choose a catalog --</option>
                    {catalogs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )
              ) : (
                <input
                  data-element-id="meta-catalog-name"
                  type="text"
                  placeholder="e.g. CIA Automotive Catalog"
                  value={newCatalogName}
                  onChange={(e) => setNewCatalogName(e.target.value)}
                  className="w-full border border-gray-400 bg-white rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}

              <button
                type="button"
                disabled={metaLoading}
                onClick={submitCatalog}
                className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {metaLoading ? "Saving\u2026" : metaTosRequired ? "Retry" : "Next \u2192"}
              </button>
              <button type="button" onClick={resetWizard} className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline">
                Start Over
              </button>
            </div>
          )}

          {metaStep === "feed" && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Step 5 of 5 — Register Feed</div>
              <div className="rounded-md bg-gray-50 border border-gray-200 p-3 mb-3">
                <p className="text-xs text-gray-500 mb-1">Feed URL</p>
                <p className="text-xs text-gray-700 break-all font-mono">
                  https://www.ciafeed.com/feeds/&#123;your-slug&#125;.csv
                </p>
                {metaCatalogId && (
                  <p className="text-xs text-gray-400 mt-2">Catalog: {metaCatalogId}</p>
                )}
              </div>
              <button
                type="button"
                disabled={metaLoading}
                onClick={publishFeed}
                className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {metaLoading ? "Publishing\u2026" : "Publish Feed to Meta \u2192"}
              </button>
              <button type="button" onClick={resetWizard} className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline">
                Start Over
              </button>
            </div>
          )}
        </div>

        {/* Website URL — only for automotive/ecommerce */}
        {showWebsiteUrl && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Website URL
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Your website URL is used to crawl and discover inventory listings.
            </p>
            <div className="flex gap-2.5">
              <input
                data-element-id="website-url-input"
                type="url"
                className="flex-1 border border-gray-400 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="https://yourwebsite.com"
                value={siteUrl}
                onChange={(e) => {
                  setSiteUrl(e.target.value);
                  setSiteUrlSaved(false);
                }}
              />
              <button
                type="button"
                disabled={savingSiteUrl}
                onClick={async () => {
                  setSavingSiteUrl(true);
                  setError(null);
                  setSiteUrlSaved(false);
                  try {
                    const res = await fetch("/api/profile", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ websiteUrl: siteUrl.trim() || null }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error || "Failed to save website URL.");
                      return;
                    }
                    setSiteUrlSaved(true);
                  } catch {
                    setError("Network error. Please try again.");
                  } finally {
                    setSavingSiteUrl(false);
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingSiteUrl ? "Saving\u2026" : "Save"}
              </button>
            </div>
            {siteUrlSaved && (
              <p className="text-xs text-green-600 mt-2">Website URL saved.</p>
            )}
          </div>
        )}

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
            <h3 className="text-base font-bold text-gray-900 mb-2">Permanently switch to {targetVerticalInfo.title}?</h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Switching from <strong>{currentVerticalInfo?.title}</strong> to{" "}
              <strong>{targetVerticalInfo.title}</strong> will <strong>permanently delete</strong> all
              inventory, crawl jobs, and crawl snapshots. This <strong>cannot be undone</strong>. A new
              empty CSV feed will be created when you add your first item.
            </p>
            {isMetaConnected && (
              <div className="bg-red-50 rounded-md p-3 text-xs text-red-700 mb-5">
                Your existing Meta catalog will be replaced with a new one created for the{" "}
                {targetVerticalInfo.title} vertical. You&apos;ll need to re-publish your feed after adding items.
              </div>
            )}
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
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {switching ? "Switching\u2026" : "Permanently Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
