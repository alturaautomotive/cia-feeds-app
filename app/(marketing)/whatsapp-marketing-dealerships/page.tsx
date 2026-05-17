import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  return {
    title: "WhatsApp Marketing for Car Dealerships: The 2025-2026 Playbook | CIAfeeds",
    description:
      "How US car dealerships use Meta Catalog feeds and Click-to-WhatsApp ads to generate more leads. Real tactics, 2025 data, step-by-step.",
    alternates: {
      canonical: `${origin}/whatsapp-marketing-dealerships`,
      languages: {
        "en-US": `${origin}/whatsapp-marketing-dealerships`,
        "es-US": `${origin}/marketing-whatsapp-concesionarios`,
      },
    },
    openGraph: {
      title: "WhatsApp Marketing for Car Dealerships: The 2025-2026 Playbook",
      description:
        "How US car dealerships use Meta Catalog feeds and Click-to-WhatsApp ads to generate more leads.",
      type: "website",
    },
  };
}

const faqs = [
  {
    q: "Does WhatsApp marketing work for car dealerships in the US?",
    a: "Yes. WhatsApp has over 50 million monthly active users in the US as of 2025, with particularly high penetration among Hispanic, immigrant, and younger demographics — exactly the audiences growing dealerships are targeting. Meta's Click-to-WhatsApp ad format consistently delivers lower cost-per-lead than standard web-form campaigns.",
  },
  {
    q: "What is a Meta Catalog feed and why does a dealer need one?",
    a: "A Meta Catalog feed is a structured file (or URL) that lists every vehicle in your inventory with its photos, price, year, make, model, and availability. Meta reads it to power Dynamic Inventory Ads — ads that automatically show each shopper the vehicles most relevant to them.",
  },
  {
    q: "How often should the inventory feed update?",
    a: "At minimum, twice daily. If you sell a vehicle in the afternoon and the feed doesn't update until midnight, you could pay for clicks on a sold car. CIAfeeds refreshes feeds every 6 hours by default, with hourly updates available on the Pro plan.",
  },
  {
    q: "What is the difference between Click-to-WhatsApp and a web form lead?",
    a: "A web form lead requires the shopper to fill out a form, wait for a confirmation email, and then wait for your BDC to call them — a process that typically takes hours. A Click-to-WhatsApp lead drops the buyer directly into a live conversation with your team. Speed-to-lead is the biggest lever in auto sales, and WhatsApp is instant.",
  },
  {
    q: "How much does it cost to run WhatsApp ads for a dealership?",
    a: "Ad spend varies by market and competition, but dealers typically see cost-per-lead in the $8-$25 range for Click-to-WhatsApp campaigns — lower than traditional display or search in most DMAs. Platform setup costs depend on your tools; CIAfeeds starts at $49/month.",
  },
  {
    q: "Do I need a dedicated WhatsApp Business account?",
    a: "Yes. You need a WhatsApp Business Account (WABA) connected to your Meta Business Manager. CIAfeeds walks you through the verification steps during onboarding.",
  },
];

export default async function WhatsAppMarketingDealershipsPage() {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "WhatsApp Marketing for Car Dealerships",
    description:
      "Meta Catalog feeds and Click-to-WhatsApp lead funnels for US car dealerships.",
    provider: {
      "@type": "Organization",
      name: "CIAfeeds",
      url: "https://www.ciafeed.com",
    },
    areaServed: { "@type": "Country", name: "United States" },
    availableLanguage: ["en", "es"],
    url: `${origin}/whatsapp-marketing-dealerships`,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Lang toggle */}
      <div className="flex justify-end mb-8">
        <Link
          href="/marketing-whatsapp-concesionarios"
          className="text-sm text-blue-600 hover:underline"
        >
          Español
        </Link>
      </div>

      {/* Header */}
      <header className="mb-10">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
          WhatsApp Marketing Guide
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
          WhatsApp Marketing for Car Dealerships: The 2025–2026 Playbook
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          Web forms lose 80% of car shoppers before your BDC calls them back. This guide
          shows how US dealerships are using Meta Catalog feeds and Click-to-WhatsApp ads
          to close leads in real-time conversation — not voicemail.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/lp/whatsapp-marketing-dealerships"
            className="sf-btn bg-blue-600 text-white font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors"
          >
            Get the setup guide →
          </Link>
          <Link
            href="/blog"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-5 py-2.5"
          >
            Read the blog →
          </Link>
        </div>
      </header>

      <hr className="border-gray-100 mb-10" />

      {/* 1. Intro */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Why WhatsApp, Why Now
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          In 2025, WhatsApp surpassed 50 million monthly active US users — and that
          number skews heavily toward the demographics buying cars right now: Hispanic
          households, first-generation immigrants, and buyers under 45. Per{" "}
          <strong>Infobip's 2026 WhatsApp Sales Report</strong>, brands using
          Click-to-WhatsApp ads see 3× higher intent-to-purchase signals compared to
          equivalent click-to-web campaigns.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          For a car dealership, the math is simple: a shopper who taps an ad and opens
          a WhatsApp chat is telling you their phone number, their interest, and their
          intent — all in the first message. Compare that to a web form where the buyer
          types in a fake number and moves on.
        </p>
        <p className="text-gray-700 leading-relaxed">
          According to data from{" "}
          <strong>Lotame's 2025 Auto Audience Report</strong>, 67% of US Hispanic car
          shoppers use WhatsApp as their primary messaging app. If you're advertising in
          markets like Los Angeles, Miami, Houston, or Phoenix, ignoring WhatsApp is
          ignoring your fastest-growing buyer segment.
        </p>
      </section>

      {/* CTA inline */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>Ready to set up Click-to-WhatsApp ads?</strong> CIAfeeds builds your
          Meta Catalog feed and WhatsApp integration in under 24 hours.
        </p>
        <Link
          href="/lp/whatsapp-marketing-dealerships"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Get the playbook →
        </Link>
      </div>

      {/* 2. How it works */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          How the Meta Catalog + WhatsApp Stack Works
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          The setup has three layers:
        </p>
        <ol className="list-decimal pl-6 space-y-4 text-gray-700 mb-4">
          <li>
            <strong>Live inventory feed.</strong> A URL that Meta can read — updated
            every 6 hours — containing every vehicle in your lot with VIN, year, make,
            model, trim, price, photos, and status. CIAfeeds generates and hosts this
            URL from your existing dealer website. No DMS integration required; no CSV
            uploads.
          </li>
          <li>
            <strong>Meta Catalog connected to your WABA.</strong> In Meta Business
            Manager, you link the feed URL to a Catalog, then connect that Catalog to
            your WhatsApp Business Account. Meta does the matching automatically.
          </li>
          <li>
            <strong>Click-to-WhatsApp Catalog Ads.</strong> You run a Dynamic Catalog
            campaign with WhatsApp as the CTA destination. When a shopper taps the ad,
            they land in a chat with your dealership — the vehicle they were looking at
            is pre-populated in the message.
          </li>
        </ol>
        <p className="text-gray-700 leading-relaxed">
          The result: every tap on a Meta ad is a live WhatsApp conversation, not a
          form submission. Your BDC sees the shopper's phone number, the exact vehicle
          they want, and can answer within seconds.
        </p>
      </section>

      {/* 3. Tactical playbook */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Tactical Playbook</h2>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Set up a WhatsApp Business Account the right way
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Use a dedicated number for WhatsApp — not your main showroom line. This keeps
          your WhatsApp inbox clean and avoids mixing sales leads with service calls.
          Verify your business in Meta Business Manager before you run a single dollar
          of ads; unverified accounts get throttled.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Write message templates that convert
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Your first automated reply should acknowledge the shopper, confirm the vehicle,
          and ask one qualifying question — not five. Example:{" "}
          <em>
            "Hi! I saw you're interested in the 2024 Toyota Camry LE at $26,990. Are you
            looking to buy within the next 30 days or just browsing?"
          </em>{" "}
          That single question segments hot leads from tire-kickers in real time.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Use Catalog retargeting for sold-car follow-up
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          When a vehicle sells, the catalog removes it automatically on the next refresh.
          But you can retarget shoppers who clicked that listing with a "similar vehicles
          available" message. Per{" "}
          <strong>Meta's 2025 Automotive Ads Benchmark Report</strong>, retargeted
          Click-to-WhatsApp ads for similar inventory drive 45% conversion lift compared
          to cold campaigns.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Run bilingual creatives in border and metro markets
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          In Los Angeles, Miami, Houston, Dallas, and Phoenix, running the same creative
          in both English and Spanish within a single campaign is table stakes. Meta
          serves the language version that matches the user's app language setting. You
          don't need separate campaigns — just duplicate ad sets within the same campaign
          and toggle the language targeting.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Track lead source at the vehicle level
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Tag each WhatsApp conversation with the Meta ad set, vehicle VIN, and
          timestamp. This gives you real ROI reporting: "This ad set generated 12 test
          drives in March at $18 per lead." Most dealers run Meta ads for months without
          knowing which VINs actually generate appointments. Don't be one of them.
        </p>
      </section>

      {/* CTA inline 2 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>Want us to build this for your dealership?</strong> Start with a free
          catalog feed — no commitment required.
        </p>
        <Link
          href="/lp/whatsapp-marketing-dealerships"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Get started free →
        </Link>
      </div>

      {/* 4. Common mistakes */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Common Mistakes</h2>
        <ul className="space-y-4 text-gray-700">
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Using a personal WhatsApp number.</strong> Personal numbers can't
              use automated templates, can't be connected to Meta Ads, and can't be
              shared across your BDC team.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Letting the catalog go stale.</strong> A catalog that hasn't
              refreshed in 48 hours is advertising sold inventory. Every click on a sold
              car is a bad experience and wasted money.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Treating WhatsApp like email.</strong> WhatsApp is a real-time
              channel. If your BDC takes 4 hours to reply to a WhatsApp message, you've
              already lost the lead to a competitor who replied in 3 minutes.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Running English-only ads in Hispanic markets.</strong> Per{" "}
              <strong>AS USA's 2025 Hispanic Consumer Report</strong>, 62% of US
              Hispanic adults prefer to receive commercial messages in Spanish.
              English-only campaigns in LA, Miami, or Houston leave money on the table.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>No lead attribution.</strong> If you can't say which Meta ad set
              generated which sold vehicle, your ad spend is a black box. Set up UTM
              tracking on every WhatsApp template link.
            </span>
          </li>
        </ul>
      </section>

      {/* 5. Get started */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Get Started</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          The fastest path to your first Click-to-WhatsApp lead is a live Meta Catalog
          feed. CIAfeeds reads your existing dealer website — no DMS access, no IT
          involvement — and generates a feed URL you can add to Meta Catalog Manager in
          under 10 minutes.
        </p>
        <p className="text-gray-700 leading-relaxed mb-6">
          From there, you link the catalog to your WhatsApp Business Account, create
          a Click-to-WhatsApp ad set, and you're live. Most dealers see their first
          WhatsApp lead within 24 hours of launching the campaign.
        </p>
        <Link
          href="/lp/whatsapp-marketing-dealerships"
          className="sf-btn inline-block bg-blue-600 text-white font-semibold text-base rounded-lg px-6 py-3 hover:bg-blue-700 transition-colors"
        >
          Get the playbook — it's free →
        </Link>
      </section>

      {/* 6. FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-gray-100 pb-6 last:border-0">
              <p className="font-semibold text-gray-900 mb-2">{faq.q}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom nav */}
      <nav className="flex flex-wrap gap-4 text-sm text-blue-600">
        <Link href="/blog" className="hover:underline">
          ← Blog
        </Link>
        <Link href="/hispanic-auto-marketing" className="hover:underline">
          Hispanic Auto Marketing Guide →
        </Link>
        <Link href="/lp/whatsapp-marketing-dealerships" className="hover:underline">
          Get the playbook →
        </Link>
      </nav>
    </div>
  );
}
