"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface PresetSummary {
  key: string;
  label: string;
  primary: string;
}

interface Props {
  slug: string;
  name: string;
  initial: {
    themePreset: string;
    themeOverrides: Record<string, string>;
    logoUrl: string | null;
    profileImageUrl: string | null;
  };
  presets: PresetSummary[];
}

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: "primary", label: "Primary (buttons)" },
  { key: "primaryForeground", label: "Primary text" },
  { key: "background", label: "Page background" },
  { key: "foreground", label: "Body text" },
  { key: "surface", label: "Card background" },
  { key: "surfaceForeground", label: "Card text" },
  { key: "accent", label: "Accent / hover" },
  { key: "border", label: "Border" },
];

type BrandColors = {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  surface: string;
  surfaceForeground: string;
  accent: string;
  border: string;
};

export default function BrandingClient({ slug, name, initial, presets }: Props) {
  const [presetKey, setPresetKey] = useState(initial.themePreset);
  const [overrides, setOverrides] = useState<Record<string, string>>(initial.themeOverrides);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Resolved colors for preview (preset + overrides applied client-side too).
  // We only know `primary` from the server-supplied preset summary; the
  // remaining colors fall through to dashboard defaults until the user
  // applies overrides. Good enough for a visual sanity check.
  const preview = useMemo<Record<string, string>>(() => {
    const base = presets.find((p) => p.key === presetKey);
    return { primary: base?.primary ?? "#0A0A0A", ...overrides };
  }, [presetKey, overrides, presets]);

  function setOverride(k: keyof BrandColors, v: string) {
    setOverrides((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/api/dealer/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themePreset: presetKey,
          themeOverrides: presetKey === "custom" ? overrides : null,
          logoUrl,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Save failed");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setErr("Network error");
    } finally {
      setSaving(false);
    }
  }

  const storefrontUrl = `/${slug}`;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 64px" }}>
      <header style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Storefront branding</h1>
          <p style={{ marginTop: 6, opacity: 0.7, fontSize: 14 }}>
            Customize how {name}&apos;s public mini-website looks.
          </p>
        </div>
        <Link
          href={storefrontUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            alignSelf: "flex-start",
            padding: "8px 14px",
            borderRadius: 6,
            border: "1px solid #e5e5e5",
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Open storefront →
        </Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 32, alignItems: "start" }}>
        {/* Settings column */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Logo</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            {(logoUrl || initial.profileImageUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl ?? initial.profileImageUrl ?? ""}
                alt="logo preview"
                style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e5e5", background: "#fff" }}
              />
            )}
            <div style={{ flex: 1 }}>
              <input
                type="url"
                placeholder="https://your-cdn.com/logo.png"
                value={logoUrl ?? ""}
                onChange={(e) => setLogoUrl(e.target.value || null)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #d4d4d4",
                  fontSize: 14,
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                Paste a URL to a wide/landscape logo. Falls back to your profile image if blank.
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Brand preset</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {presets.map((p) => {
              const selected = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  style={{
                    padding: "10px 12px",
                    background: selected ? "#0a0a0a" : "#fff",
                    color: selected ? "#fff" : "#0a0a0a",
                    border: `1px solid ${selected ? "#0a0a0a" : "#e5e5e5"}`,
                    borderRadius: 8,
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: p.primary,
                      flexShrink: 0,
                      border: "1px solid rgba(0,0,0,0.1)",
                    }}
                  />
                  {p.label}
                </button>
              );
            })}
          </div>

          {presetKey === "custom" && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Custom colors</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {COLOR_FIELDS.map((f) => (
                  <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>{f.label}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="color"
                        value={isValidHex(overrides[f.key]) ? overrides[f.key] : "#000000"}
                        onChange={(e) => setOverride(f.key, e.target.value)}
                        style={{ width: 36, height: 36, padding: 0, border: "1px solid #d4d4d4", borderRadius: 6, cursor: "pointer" }}
                      />
                      <input
                        type="text"
                        value={overrides[f.key] ?? ""}
                        placeholder="#000000"
                        onChange={(e) => setOverride(f.key, e.target.value)}
                        style={{
                          flex: 1,
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid #d4d4d4",
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 28, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                padding: "10px 18px",
                background: "#0a0a0a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && <span style={{ color: "#15803d", fontSize: 14 }}>✓ Saved</span>}
            {err && <span style={{ color: "#b91c1c", fontSize: 14 }}>{err}</span>}
          </div>
        </section>

        {/* Live preview column */}
        <aside
          style={{
            position: "sticky",
            top: 24,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", background: "#fafafa", fontSize: 12, fontWeight: 500, borderBottom: "1px solid #e5e5e5" }}>
            Live preview
          </div>
          <div
            style={{
              padding: 24,
              background: preview.background ?? "#fff",
              color: preview.foreground ?? "#0a0a0a",
            }}
          >
            {(logoUrl || initial.profileImageUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl ?? initial.profileImageUrl ?? ""}
                alt=""
                style={{ height: 32, maxWidth: 120, objectFit: "contain", marginBottom: 12 }}
              />
            )}
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{name}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
              Find your next vehicle below.
            </div>
            <button
              type="button"
              style={{
                padding: "10px 18px",
                background: preview.primary ?? "#0a0a0a",
                color: preview.primaryForeground ?? "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                marginRight: 8,
              }}
            >
              View Inventory
            </button>
            <button
              type="button"
              style={{
                padding: "9px 17px",
                background: "transparent",
                color: preview.foreground ?? "#0a0a0a",
                border: `1px solid ${preview.border ?? "#e5e5e5"}`,
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              Contact
            </button>
            <div
              style={{
                marginTop: 20,
                padding: 14,
                background: preview.surface ?? "#f5f5f5",
                color: preview.surfaceForeground ?? "#0a0a0a",
                border: `1px solid ${preview.border ?? "#e5e5e5"}`,
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              Sample card — vehicle title and price would appear here.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function isValidHex(s: string | undefined): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s);
}
