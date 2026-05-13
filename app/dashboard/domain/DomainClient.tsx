"use client";

import { useEffect, useState } from "react";

interface DomainStatus {
  verified: boolean;
  hasCertificate?: boolean;
  verification?: Array<{ type: string; domain: string; value: string; reason?: string }>;
}

export default function DomainClient({
  slug,
  initialDomain,
  subdomainUrl,
}: {
  slug: string;
  initialDomain: string | null;
  subdomainUrl: string;
}) {
  const [domain, setDomain] = useState<string | null>(initialDomain);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [vercelError, setVercelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch current status on mount + whenever domain changes
  useEffect(() => {
    if (!domain) {
      setStatus(null);
      return;
    }
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/dealer/domain");
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status ?? null);
      if (data.customDomain !== domain) setDomain(data.customDomain ?? null);
    } catch {
      /* ignore */
    }
  }

  async function addDomain() {
    setErr(null);
    setVercelError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/dealer/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Could not add domain.");
      } else {
        setDomain(data.customDomain);
        setStatus(data.status ?? null);
        setVercelError(data.vercelError ?? null);
        setInput("");
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function removeDomain() {
    if (!confirm("Remove your custom domain? Visitors will be redirected to the .ciafeed.com subdomain instead.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/dealer/domain", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "Could not remove domain.");
      } else {
        setDomain(null);
        setStatus(null);
        setVercelError(null);
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 64px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Custom domain</h1>
      <p style={{ marginTop: 6, opacity: 0.7, fontSize: 14 }}>
        Point your own domain at your CIA Feeds storefront. Free
        subdomain {subdomainUrl.replace("https://", "")} always works as well.
      </p>

      {/* Default subdomain card */}
      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          background: "#fafafa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 2 }}>Default subdomain</div>
          <a
            href={subdomainUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontSize: 16, fontWeight: 600, textDecoration: "underline" }}
          >
            {subdomainUrl}
          </a>
        </div>
        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>● Active</span>
      </div>

      {/* Custom domain section */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>
        Your custom domain
      </h2>

      {domain ? (
        <div>
          <div
            style={{
              padding: 16,
              border: "1px solid #e5e5e5",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 2 }}>Custom domain</div>
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ fontSize: 16, fontWeight: 600, textDecoration: "underline" }}
                >
                  {domain}
                </a>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusPill status={status} />
                <button
                  type="button"
                  onClick={() => refreshStatus()}
                  disabled={busy}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d4d4d4", background: "#fff", fontSize: 13, cursor: "pointer" }}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={removeDomain}
                  disabled={busy}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fca5a5", color: "#b91c1c", background: "#fff", fontSize: 13, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          {status && !status.verified && status.verification && status.verification.length > 0 && (
            <div
              style={{
                padding: 16,
                border: "1px solid #fbbf24",
                borderRadius: 10,
                background: "#fffbeb",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                DNS records required
              </div>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
                Add these records at your domain registrar. Verification + SSL
                provisioning happen automatically once DNS propagates (5–60 min).
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#78716c" }}>
                      <th style={{ padding: "6px 8px" }}>Type</th>
                      <th style={{ padding: "6px 8px" }}>Host</th>
                      <th style={{ padding: "6px 8px" }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.verification.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #fde68a" }}>
                        <td style={{ padding: "8px 8px", fontFamily: "ui-monospace, monospace" }}>{r.type}</td>
                        <td style={{ padding: "8px 8px", fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{r.domain}</td>
                        <td style={{ padding: "8px 8px", fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vercelError === "vercel_api_not_configured" && (
            <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13, color: "#7f1d1d" }}>
              Heads up: this server is not configured to auto-attach domains.
              Your domain is saved, but an admin needs to attach it in Vercel
              manually for traffic to route here.
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 10,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Domain or subdomain</span>
            <input
              type="text"
              placeholder="inventory.yourdealership.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #d4d4d4",
                fontSize: 14,
              }}
            />
          </label>
          <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              onClick={addDomain}
              disabled={busy || !input.trim()}
              style={{
                padding: "10px 18px",
                background: "#0a0a0a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
                cursor: busy ? "default" : "pointer",
                opacity: busy || !input.trim() ? 0.5 : 1,
              }}
            >
              {busy ? "Adding…" : "Add domain"}
            </button>
            {err && <span style={{ color: "#b91c1c", fontSize: 13 }}>{err}</span>}
          </div>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>
            Tip: subdomains (like inventory.yourdealership.com) verify faster
            than apex domains. Both work.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DomainStatus | null }) {
  if (!status) {
    return <span style={{ fontSize: 12, color: "#78716c" }}>● Unknown</span>;
  }
  if (status.verified && status.hasCertificate) {
    return <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>● Live</span>;
  }
  if (status.verified) {
    return <span style={{ fontSize: 12, color: "#a16207", fontWeight: 500 }}>● Verified · awaiting SSL</span>;
  }
  return <span style={{ fontSize: 12, color: "#a16207", fontWeight: 500 }}>● Pending DNS</span>;
}
