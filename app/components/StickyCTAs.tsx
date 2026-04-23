"use client";

interface Props {
  dealer: {
    phone: string | null;
    fbPageId: string | null;
    ctaPreference: string | null;
  };
}

interface CTAButton {
  href: string;
  label: string;
  target?: string;
}

export default function StickyCTAs({ dealer }: Props) {
  const ctaMap: Record<string, { ok: boolean } & CTAButton> = {
    sms: {
      ok: !!dealer.phone,
      href: `sms:${dealer.phone ?? ""}?body=${encodeURIComponent("Hi, I'm interested in your inventory")}`,
      label: "Text Us",
    },
    whatsapp: {
      ok: !!dealer.phone,
      href: `https://wa.me/${(dealer.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I'm interested in your inventory")}`,
      label: "WhatsApp Us",
    },
    messenger: {
      ok: !!dealer.fbPageId,
      href: `https://m.me/${dealer.fbPageId ?? ""}`,
      label: "Message on Messenger",
      target: "_blank",
    },
  };

  const buttons: CTAButton[] = [];
  const pref = dealer.ctaPreference;

  if (pref && ctaMap[pref] && ctaMap[pref].ok) {
    buttons.push(ctaMap[pref]);
  } else {
    (["sms", "whatsapp", "messenger"] as const).forEach((k) => {
      if (ctaMap[k].ok) buttons.push(ctaMap[k]);
    });
  }

  if (buttons.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 md:p-6 z-50">
      <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-3">
        {buttons.map((b, i) => (
          <a
            key={b.label}
            href={b.href}
            target={b.target}
            rel={b.target ? "noopener noreferrer" : undefined}
            className={`inline-block px-6 py-3 rounded-lg font-semibold text-sm transition-colors ${
              i === 0
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50"
            }`}
          >
            {b.label}
          </a>
        ))}
      </div>
    </div>
  );
}
