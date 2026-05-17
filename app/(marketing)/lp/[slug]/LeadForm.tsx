"use client";

import { useState, type FormEvent } from "react";
import type { LpCopy } from "./copy";

interface LeadFormProps {
  slug: string;
  locale: "en" | "es";
  labels: LpCopy["labels"];
  formTitle: string;
  formCta: string;
  thankYouTitle: string;
  thankYouBody: string;
}

export default function LeadForm({
  slug,
  locale,
  labels,
  formTitle,
  formCta,
  thankYouTitle,
  thankYouBody,
}: LeadFormProps) {
  const [fields, setFields] = useState({
    name: "",
    email: "",
    phone: "",
    dealership: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.email,
          name: fields.name || undefined,
          phone: fields.phone || undefined,
          source: `lp:${slug}`,
          interest: slug,
          locale,
        }),
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
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <p className="text-2xl mb-3">✓</p>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{thankYouTitle}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{thankYouBody}</p>
      </div>
    );
  }

  const errorMsg =
    locale === "es"
      ? "Algo salió mal. Intenta de nuevo."
      : "Something went wrong. Please try again.";

  return (
    <form
      id="lead-form"
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 sm:p-8 flex flex-col gap-4"
    >
      <h3 className="text-lg font-semibold text-gray-900">{formTitle}</h3>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {labels.name} *
          </label>
          <input
            type="text"
            name="name"
            required
            value={fields.name}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {labels.email} *
          </label>
          <input
            type="email"
            name="email"
            required
            value={fields.email}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {labels.phone}
          </label>
          <input
            type="tel"
            name="phone"
            value={fields.phone}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {labels.dealership} *
          </label>
          <input
            type="text"
            name="dealership"
            required
            value={fields.dealership}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {status === "error" && (
        <p className="text-red-600 text-sm">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="sf-btn w-full bg-blue-600 text-white font-semibold text-sm rounded-lg px-6 py-3 hover:bg-blue-700 transition-colors disabled:opacity-60 mt-1"
      >
        {status === "loading" ? "…" : formCta}
      </button>
    </form>
  );
}
