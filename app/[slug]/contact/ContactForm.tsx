"use client";

import { useState } from "react";

/**
 * Client-side lead form for the storefront contact page.
 *
 * Submits to the existing /api/leads endpoint (already rate-limited and
 * audit-friendly). Pre-fills the message with vehicle/listing context when
 * the user clicked through from a VDP.
 */
export default function ContactForm({
  dealerId,
  context,
  successCtaUrl,
}: {
  dealerId: string;
  context: { kind: "vehicle" | "listing"; id: string; label: string } | null;
  successCtaUrl: string;
}) {
  const [state, setState] = useState<"idle" | "submitting" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setErrMsg(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      dealerId,
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
      vehicleId: context?.kind === "vehicle" ? context.id : undefined,
      source: "storefront",
    };
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrMsg(data.error ?? "Submission failed. Please try again.");
        setState("err");
        return;
      }
      setState("ok");
    } catch {
      setErrMsg("Network error. Please try again.");
      setState("err");
    }
  }

  if (state === "ok") {
    return (
      <div className="sf-card" style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          Thanks — we received your message.
        </div>
        <p style={{ opacity: 0.7, marginBottom: 18 }}>
          We&apos;ll get back to you shortly.
        </p>
        <a href={successCtaUrl} className="sf-btn-outline">
          Back to home
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {context && (
        <div
          className="sf-card"
          style={{ padding: 12, fontSize: 13, opacity: 0.8 }}
        >
          Inquiring about: <strong>{context.label}</strong>
        </div>
      )}

      <Field
        label="Name"
        name="name"
        required
        autoComplete="name"
        type="text"
      />
      <Field
        label="Email"
        name="email"
        required
        autoComplete="email"
        type="email"
      />
      <Field
        label="Phone (optional)"
        name="phone"
        autoComplete="tel"
        type="tel"
      />
      <TextArea
        label="Message"
        name="message"
        required
        defaultValue={
          context ? `Hi, I'm interested in the ${context.label}.` : ""
        }
      />

      {state === "err" && errMsg && (
        <div style={{ color: "#C8102E", fontSize: 14 }}>{errMsg}</div>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="sf-btn"
        style={{
          alignSelf: "flex-start",
          opacity: state === "submitting" ? 0.6 : 1,
        }}
      >
        {state === "submitting" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <input
        {...rest}
        style={{
          padding: "10px 14px",
          borderRadius: "var(--brand-radius)",
          border: "1px solid var(--brand-border)",
          background: "var(--brand-bg)",
          color: "var(--brand-fg)",
          fontSize: 15,
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

function TextArea({
  label,
  ...rest
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <textarea
        {...rest}
        rows={5}
        style={{
          padding: "10px 14px",
          borderRadius: "var(--brand-radius)",
          border: "1px solid var(--brand-border)",
          background: "var(--brand-bg)",
          color: "var(--brand-fg)",
          fontSize: 15,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
    </label>
  );
}
