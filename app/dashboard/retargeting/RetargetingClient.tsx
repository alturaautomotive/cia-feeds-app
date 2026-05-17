"use client";

import { useState } from "react";
import Link from "next/link";

interface AudienceRow {
  id: string;
  kind: string;
  metaAudienceId: string;
  metaAdAccountId: string;
  name: string;
  description: string | null;
  estimatedSize: number | null;
  lastRefreshedAt: string | null;
  sourceListingId: string | null;
  sourceVehicleId: string | null;
}

interface Props {
  dealerSlug: string;
  metaConnected: boolean;
  adAccountId: string | null;
  pixelId: string | null;
  audiences: AudienceRow[];
}

const AUDIENCE_KIND_LABELS: Record<string, string> = {
  viewed_any_30d: "All storefront visitors (30d)",
  viewed_listing_30d: "Per-listing audience (30d)",
  lead_no_followup_30d: "Recent leads (30d)",
};

function adsManagerUrl(adAccountId: string, audienceId: string): string {
  // act_<id> -> Ads Manager Audiences page filtered to this audience.
  const cleanAccount = adAccountId.replace(/^act_/, "");
  return `https://business.facebook.com/adsmanager/audiences?act=${encodeURIComponent(cleanAccount)}&selected_audience_ids=${encodeURIComponent(audienceId)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RetargetingClient({
  dealerSlug,
  metaConnected,
  adAccountId,
  pixelId,
  audiences,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookalikeBusy, setLookalikeBusy] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/retargeting/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Refresh failed (HTTP ${res.status})`);
        return;
      }
      // Hard-reload so server-rendered audience rows reflect new sizes.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLookalike(audienceId: string) {
    setLookalikeBusy(audienceId);
    setError(null);
    try {
      const res = await fetch("/api/retargeting/lookalike", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceId, country: "US", ratio: 0.02 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Lookalike creation failed (HTTP ${res.status})`);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookalike creation failed");
    } finally {
      setLookalikeBusy(null);
    }
  }

  if (!metaConnected) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Retargeting Audiences</h1>
        <p className="text-gray-600 mb-6">
          Automatically build Meta Custom Audiences from your storefront
          visitors so you can run targeted Facebook and Instagram ads to
          people who already engaged with your listings.
        </p>
        <div
          style={{
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            padding: 20,
            borderRadius: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#92400e" }}>
            Connect Meta to enable retargeting
          </h3>
          <p style={{ margin: "8px 0 16px", color: "#78350f", fontSize: 14 }}>
            You need a connected Meta account with a Pixel and an Ad Account
            on file. Visit your profile to finish setup.
          </p>
          <Link
            href="/dashboard/profile"
            style={{
              display: "inline-block",
              padding: "8px 16px",
              background: "#111827",
              color: "#fff",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Open profile
          </Link>
        </div>
      </div>
    );
  }

  // Group audiences by kind for cleaner rendering.
  const byKind: Record<string, AudienceRow[]> = {};
  for (const a of audiences) {
    (byKind[a.kind] ??= []).push(a);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 className="text-2xl font-bold mb-1">Retargeting Audiences</h1>
          <p className="text-gray-600">
            Auto-managed Meta Custom Audiences built from your storefront
            traffic and leads. Refreshed daily.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "8px 16px",
            background: "#111827",
            color: "#fff",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            cursor: refreshing ? "not-allowed" : "pointer",
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {audiences.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            padding: 32,
            borderRadius: 12,
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, color: "#6b7280" }}>
            No audiences yet. Click <strong>Refresh now</strong> to build
            your first audiences from the past 30 days of storefront traffic
            and leads.
          </p>
        </div>
      ) : (
        Object.entries(byKind).map(([kind, rows]) => (
          <section key={kind} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "#6b7280",
                marginBottom: 8,
              }}
            >
              {AUDIENCE_KIND_LABELS[kind] ?? kind}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((a) => (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.name}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}
                    >
                      {a.estimatedSize != null
                        ? `≈ ${a.estimatedSize.toLocaleString()} people`
                        : "Building — size will appear after Meta processes."}
                      {" · "}
                      Updated {formatDate(a.lastRefreshedAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {!kind.startsWith("lookalike_of_") && (
                      <button
                        onClick={() => handleLookalike(a.id)}
                        disabled={
                          lookalikeBusy === a.id ||
                          (a.estimatedSize != null && a.estimatedSize < 100)
                        }
                        style={{
                          padding: "6px 12px",
                          background: "#f3f4f6",
                          color: "#111827",
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          border: "1px solid #d1d5db",
                          cursor:
                            lookalikeBusy === a.id ? "not-allowed" : "pointer",
                          opacity: lookalikeBusy === a.id ? 0.6 : 1,
                        }}
                        title={
                          a.estimatedSize != null && a.estimatedSize < 100
                            ? "Need at least 100 people to seed a Lookalike."
                            : "Create a Lookalike audience seeded from this."
                        }
                      >
                        {lookalikeBusy === a.id ? "…" : "+ Lookalike"}
                      </button>
                    )}
                    <a
                      href={adsManagerUrl(a.metaAdAccountId, a.metaAudienceId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "6px 12px",
                        background: "#111827",
                        color: "#fff",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Open in Ads Manager →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <div
        style={{
          marginTop: 32,
          padding: 16,
          background: "#f9fafb",
          borderRadius: 8,
          fontSize: 13,
          color: "#6b7280",
        }}
      >
        <strong style={{ color: "#374151" }}>How this works:</strong>{" "}
        Audiences refresh automatically every day at 5 AM UTC. Visitor
        audiences populate from your Meta Pixel on{" "}
        <code>{dealerSlug}.ciafeed.com</code>. Lead audiences use hashed
        emails and phone numbers from leads submitted in the last 30 days.
        Click <strong>Refresh now</strong> to update immediately. Audiences
        with fewer than 100 people can&apos;t be used to seed a Lookalike
        yet — let traffic accumulate.
      </div>
    </div>
  );
}
