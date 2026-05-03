const TESTIMONIALS = [
  {
    quote: "We went from zero Meta catalog ads to a full vehicle feed in under 10 minutes. CIAfeeds just works.",
    name: "Marcus T.",
    role: "Used Car Dealer, Atlanta GA",
  },
  {
    quote: "I used to spend hours exporting CSVs manually. Now our listings auto-refresh and Meta always has fresh data.",
    name: "Jennifer L.",
    role: "Real Estate Broker, Miami FL",
  },
  {
    quote: "Setup was dead simple — paste a URL, get a feed. Our ad ROAS improved the first week we switched.",
    name: "David R.",
    role: "Ecommerce Store Owner, Dallas TX",
  },
];

export default function Testimonials() {
  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
          What Dealers & Sellers Are Saying
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="border border-gray-200 rounded-xl p-6"
            >
              <p className="text-sm text-gray-600 mb-4 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="text-sm font-semibold text-gray-900">
                {t.name}
              </div>
              <div className="text-xs text-gray-500">{t.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
