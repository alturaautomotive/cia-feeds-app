"use client";

import { useState, type FormEvent } from "react";

interface NewsletterFormProps {
  source: string;
  locale: "en" | "es";
  interest?: string;
  className?: string;
  variant?: "inline" | "sidebar";
}

const copy = {
  en: {
    title: "Get dealership marketing tips every two weeks",
    placeholder: "your@email.com",
    cta: "Subscribe →",
    fine: "No spam. Unsubscribe anytime.",
    success: "You're in — check your inbox.",
  },
  es: {
    title: "Recibe consejos de marketing cada dos semanas",
    placeholder: "tu@correo.com",
    cta: "Suscribirme →",
    fine: "Sin spam. Cancela cuando quieras.",
    success: "¡Listo! Revisa tu bandeja de entrada.",
  },
};

export default function NewsletterForm({
  source,
  locale,
  interest,
  className = "",
  variant = "inline",
}: NewsletterFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const t = copy[locale];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, locale, interest }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className={`text-green-700 font-medium text-sm py-3 ${className}`}>
        ✓ {t.success}
      </p>
    );
  }

  if (variant === "sidebar") {
    return (
      <aside
        className={`bg-blue-50 border border-blue-100 rounded-xl p-5 ${className}`}
      >
        <p className="text-sm font-semibold text-gray-900 mb-3">{t.title}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder={t.placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="sf-btn w-full bg-blue-600 text-white text-sm font-semibold rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {status === "loading" ? "…" : t.cta}
          </button>
          {status === "error" && (
            <p className="text-red-600 text-xs">Something went wrong. Try again.</p>
          )}
          <p className="text-gray-400 text-xs">{t.fine}</p>
        </form>
      </aside>
    );
  }

  // inline variant
  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-xl p-6 sm:p-8 ${className}`}>
      <p className="text-base font-semibold text-gray-900 mb-4">{t.title}</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-3 max-w-md"
      >
        <input
          type="email"
          required
          placeholder={t.placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="sf-btn shrink-0 bg-blue-600 text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {status === "loading" ? "…" : t.cta}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-red-600 text-xs">Something went wrong. Try again.</p>
      )}
      <p className="mt-2 text-gray-400 text-xs">{t.fine}</p>
    </div>
  );
}
