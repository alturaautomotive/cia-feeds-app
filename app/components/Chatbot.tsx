"use client";

import { useState, useRef, useEffect } from "react";

interface ChatbotTranslations {
  scripts?: string[];
  header?: string;
  namePlh?: string;
  emailPlh?: string;
  phonePlh?: string;
  sendBtn?: string;
  sendingBtn?: string;
  openBtn?: string;
  closeBtn?: string;
  thanksCarfax?: string;
  thanksNoCarfax?: string;
  error?: string;
  networkError?: string;
  ended?: string;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

interface Props {
  vehicleId: string;
  dealerId: string;
  vin?: string;
  pixelId?: string;
  price?: number | null;
  translations?: ChatbotTranslations;
}

interface Message {
  from: "bot" | "user";
  text: string;
}

const DEFAULT_SCRIPTS: string[] = [
  "Hi there! Someone nearby was just looking at this vehicle. Want a free Carfax report?",
  "Just drop your name and contact info below and we'll send it right over!",
];

export default function Chatbot({ vehicleId, dealerId, vin, pixelId, price, translations: t }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scriptIdx, setScriptIdx] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showForm]);

  function handleOpen() {
    if (!open) {
      setOpen(true);
      if (messages.length === 0) {
        const scripts = t?.scripts || DEFAULT_SCRIPTS;
        // Drip script messages with delays
        scripts.forEach((text, i) => {
          setTimeout(() => {
            setMessages((prev) => [...prev, { from: "bot", text }]);
            setScriptIdx(i + 1);
            if (i === scripts.length - 1) {
              setTimeout(() => setShowForm(true), 400);
            }
          }, (i + 1) * 800);
        });
      }
    } else {
      setOpen(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);

    setMessages((prev) => [
      ...prev,
      { from: "user", text: `${form.name}${form.email ? ` | ${form.email}` : ""}${form.phone ? ` | ${form.phone}` : ""}` },
    ]);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          vehicleId,
          dealerId,
        }),
      });

      if (res.ok) {
        const carfaxUrl = vin
          ? `https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=${vin}`
          : null;

        let thankMsg: string;
        if (carfaxUrl) {
          thankMsg = (t?.thanksCarfax || "Thanks {name}! Here's the Carfax report: {url}")
            .replace("{name}", form.name)
            .replace("{url}", carfaxUrl);
        } else {
          thankMsg = (t?.thanksNoCarfax || "Thanks {name}! A team member will reach out shortly.")
            .replace("{name}", form.name);
        }

        if (pixelId && typeof window.fbq === "function") {
          window.fbq("track", "Lead", {
            content_ids: [vehicleId],
            content_category: "vehicle_lead",
            value: price || 0,
            currency: "USD",
          });
        }

        setMessages((prev) => [
          ...prev,
          { from: "bot", text: thankMsg },
        ]);
        setDone(true);
        setShowForm(false);
      } else {
        setMessages((prev) => [
          ...prev,
          { from: "bot", text: t?.error || "Oops, something went wrong. Please try again." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: t?.networkError || "Network error. Please try again." },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={handleOpen}
        className="fixed bottom-20 right-4 z-50 bg-indigo-600 text-white rounded-full px-5 py-3 shadow-lg hover:bg-indigo-700 transition-colors font-semibold text-sm md:bottom-24 md:right-6"
      >
        {open ? (t?.closeBtn || "Close") : (t?.openBtn || "Chat Now")}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />

          {/* Chat window */}
          <div className="relative w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[80vh] md:max-h-[500px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="font-semibold text-gray-900 text-sm">{t?.header || "Vehicle Inquiry"}</span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm break-words ${
                      m.from === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Form */}
            {showForm && !done && (
              <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 space-y-2">
                <input
                  type="text"
                  placeholder={t?.namePlh || "Your name *"}
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="email"
                  placeholder={t?.emailPlh || "Email"}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="tel"
                  placeholder={t?.phonePlh || "Phone"}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? (t?.sendingBtn || "Sending...") : (t?.sendBtn || "Send")}
                </button>
              </form>
            )}

            {done && (
              <div className="border-t border-gray-200 p-4 text-center text-sm text-gray-500">
                {t?.ended || "Conversation ended"}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
