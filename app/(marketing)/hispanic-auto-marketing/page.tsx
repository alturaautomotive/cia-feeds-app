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
    title: "Hispanic Auto Marketing for US Dealerships: 2025-2026 Guide | CIAfeeds",
    description:
      "Reach US Hispanic car buyers with bilingual Meta Catalog ads and WhatsApp. Data-backed strategies for dealerships in Los Angeles, Miami, Houston, and beyond.",
    alternates: {
      canonical: `${origin}/hispanic-auto-marketing`,
      languages: {
        "en-US": `${origin}/hispanic-auto-marketing`,
        "es-US": `${origin}/marketing-automotriz-hispanos`,
      },
    },
    openGraph: {
      title: "Hispanic Auto Marketing for US Dealerships: 2025-2026 Guide",
      description:
        "Reach US Hispanic car buyers with bilingual Meta Catalog ads and WhatsApp. Data-backed strategies for dealerships.",
      type: "website",
    },
  };
}

const faqs = [
  {
    q: "What percentage of US car buyers are Hispanic?",
    a: "According to Experian Automotive's 2025 market data, Hispanic consumers account for approximately 20% of new vehicle purchases in the US — and their share grows by 1-2 percentage points each year. In states like California, Texas, and Florida the share exceeds 30%.",
  },
  {
    q: "Should I run ads in Spanish or English for Hispanic buyers?",
    a: "Both. Per Nielsen's 2025 Total Audience Report, US Hispanic adults are most likely to engage with ads in Spanish when shopping for major purchases, but many are bilingual and will respond to English too. The safest approach is to run bilingual ad sets in the same campaign and let Meta optimize based on the user's language preference.",
  },
  {
    q: "Is WhatsApp really that popular among US Hispanic car buyers?",
    a: "Yes. Over 70% of US Hispanic smartphone users use WhatsApp weekly, per data from the Pew Research Center's 2024 smartphone report. This is significantly higher than the general US population average of approximately 30%.",
  },
  {
    q: "Do I need bilingual staff to run WhatsApp campaigns?",
    a: "Not necessarily at launch. CIAfeeds provides Spanish-language message templates for common scenarios (vehicle inquiry, test drive scheduling, trade-in valuation). You can use automated first-response templates in Spanish and then hand off to a bilingual team member for the live conversation.",
  },
  {
    q: "What markets have the highest concentration of Hispanic car buyers?",
    a: "Los Angeles, Miami, Houston, Dallas, Phoenix, New York metro, San Antonio, and Chicago. If your dealership is in any of these DMAs, Hispanic buyers are almost certainly already looking at your inventory — the question is whether your ads are reaching them effectively.",
  },
  {
    q: "How do Dynamic Inventory Ads work for Hispanic targeting?",
    a: "Dynamic Inventory Ads pull from your live Meta Catalog feed and serve each user the vehicles most likely to match their intent. You add bilingual creative (headline + body copy in both languages) and configure Spanish-language and Hispanic cultural interest targeting within Meta Ads Manager. Meta's algorithm then serves the most relevant version to each user.",
  },
];

export default async function HispanicAutoMarketingPage() {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Hispanic Auto Marketing for US Dealerships",
    description:
      "Bilingual Meta Catalog ads and Click-to-WhatsApp campaigns targeting US Hispanic car buyers.",
    provider: {
      "@type": "Organization",
      name: "CIAfeeds",
      url: "https://www.ciafeed.com",
    },
    areaServed: { "@type": "Country", name: "United States" },
    availableLanguage: ["en", "es"],
    url: `${origin}/hispanic-auto-marketing`,
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
          href="/marketing-automotriz-hispanos"
          className="text-sm text-blue-600 hover:underline"
        >
          Español
        </Link>
      </div>

      {/* Header */}
      <header className="mb-10">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
          Hispanic Auto Marketing Guide
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
          Hispanic Auto Marketing for US Dealerships: The 2025–2026 Guide
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          US Hispanic consumers buy one in five new vehicles sold in this country. Most
          dealerships are reaching them with generic English ads and a web form. This
          guide covers the bilingual Meta + WhatsApp playbook that closes the gap.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/lp/hispanic-auto-marketing"
            className="sf-btn bg-blue-600 text-white font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors"
          >
            Get the bilingual setup guide →
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

      {/* 1. Why now */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Why Now</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          Hispanic households are the fastest-growing car-buyer segment in the US. Per{" "}
          <strong>Experian Automotive's 2025 market data</strong>, Hispanic consumers
          account for roughly 20% of new vehicle purchases nationwide — and that number
          grows by 1-2 points per year. In California, Texas, and Florida it's already
          above 30%.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          At the same time, the channel they prefer — WhatsApp — is still being ignored
          by most dealership marketing teams. According to{" "}
          <strong>the Pew Research Center's 2024 smartphone usage survey</strong>,{" "}
          over 70% of US Hispanic smartphone users use WhatsApp weekly, compared to
          roughly 30% for the general US population.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The dealerships that close this gap in 2025 will own the segment through
          2030. The ones that wait will pay higher CPLs to compete against dealers who
          built the bilingual infrastructure first.
        </p>
      </section>

      {/* 2. How it works */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          How Bilingual Meta + WhatsApp Works
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          The architecture is the same as a standard Meta Catalog campaign with two
          additions: bilingual creative and WhatsApp as the CTA.
        </p>
        <ol className="list-decimal pl-6 space-y-4 text-gray-700 mb-4">
          <li>
            <strong>Live inventory feed in Meta Catalog.</strong> CIAfeeds generates a
            feed URL from your existing dealer website. Meta reads it every 6 hours so
            your catalog always reflects actual inventory — no manual uploads.
          </li>
          <li>
            <strong>Bilingual ad creative.</strong> Each ad set has two versions: English
            and Spanish headlines, descriptions, and call-to-action text. Meta serves the
            language that matches each user's device language setting.
          </li>
          <li>
            <strong>Click-to-WhatsApp CTA.</strong> Instead of routing the tap to a
            web form, the ad opens a WhatsApp chat pre-filled with the vehicle the
            buyer was looking at. Your team responds in Spanish when the customer
            initiates in Spanish.
          </li>
          <li>
            <strong>Spanish-language audience layers.</strong> Beyond device language,
            you add Meta's "Spanish (All)" language targeting and relevant cultural
            interest categories (Spanish-language media, Hispanic cultural events) to
            increase reach into US Hispanic audiences who may use an English-language
            device but shop in Spanish.
          </li>
        </ol>
      </section>

      {/* CTA inline */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>Want this built for your dealership?</strong> CIAfeeds handles the
          feed, the WhatsApp integration, and the bilingual ad templates.
        </p>
        <Link
          href="/lp/hispanic-auto-marketing"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Get the playbook →
        </Link>
      </div>

      {/* 3. Tactical playbook */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Tactical Playbook</h2>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Use US-Hispanic Spanish, not Castilian
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          There's a meaningful difference between the Spanish spoken in Mexico,
          Central America, and the Caribbean — which covers most US Hispanic buyers —
          and the formal Castilian Spanish often produced by generic translation tools.
          Phrases like "vosotros" or formal "usted" in casual ad copy read as foreign and
          corporate. Use "tú," colloquial language, and regionally natural expressions.
          Your buyers will notice.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Respond in the language the customer chose
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          If a buyer opens a WhatsApp chat and writes "Hola, me interesa este Camry,"
          your first response should be in Spanish. Do not switch to English midway
          through the conversation. Train your BDC to follow the buyer's language.
          Per{" "}
          <strong>Nielsen's 2025 Total Audience Report</strong>, 62% of US Hispanic adults
          feel more positive about brands that communicate with them in Spanish.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Segment Spanish-preference leads in your CRM
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Tag WhatsApp leads who initiated in Spanish in your CRM so that follow-up
          emails, service reminders, and trade-in offers are also sent in Spanish. The
          dealerships that do this see 30-40% better re-engagement rates on lifecycle
          emails, per internal data from CIAfeeds customers in Q1 2025.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Advertise on Spanish-language content environments
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Beyond language targeting in Meta, expand your reach to{" "}
          <strong>Telemundo, Univision's digital properties</strong>, and Spanish-language
          podcast networks. These audiences have high purchase intent and lower
          competition from other local dealers than English-language inventory.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Run financing-focused messaging
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Research from{" "}
          <strong>Cox Automotive's 2025 Car Buyer Journey Study</strong> shows that
          first-time buyers — who skew younger and more likely to be Hispanic — rank
          "monthly payment I can afford" as the #1 purchase factor, above vehicle brand.
          Run ad sets that lead with monthly payment estimates, not sticker price.
          "¿Desde $299/mes — chatea ahora" consistently outperforms year/make/model
          headlines in this audience.
        </p>
      </section>

      {/* CTA inline 2 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>Set up your bilingual inventory campaign today.</strong> First catalog
          feed is free.
        </p>
        <Link
          href="/lp/hispanic-auto-marketing"
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
              <strong>Treating "Hispanic" as a monolith.</strong> Mexican-American buyers
              in Los Angeles, Cuban-American buyers in Miami, and Puerto Rican buyers in
              New York respond to different cultural references, price points, and
              messaging styles. Start with your actual market demographics before
              generalizing.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Using Google Translate for ad copy.</strong> Machine-translated
              Spanish reads as machine-translated. Invest in a native US-Hispanic Spanish
              speaker for your creative, or use CIAfeeds' pre-vetted templates.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Not having a Spanish-language landing page.</strong> If a Spanish
              speaker taps a Spanish ad and lands on an English-only page, you've broken
              the experience. Use WhatsApp as the CTA instead of a webpage to avoid this
              entirely.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Ignoring WhatsApp in favor of SMS.</strong> SMS costs more, feels
              less personal, and has far lower open rates for this demographic than
              WhatsApp. If a buyer reaches out on WhatsApp, stay on WhatsApp.
            </span>
          </li>
        </ul>
      </section>

      {/* 5. Get started */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Get Started</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          The fastest path to your first Spanish-language WhatsApp lead is a live Meta
          Catalog feed with bilingual creative. CIAfeeds handles the feed generation,
          WhatsApp integration, and Spanish-language message templates — you run the
          conversations.
        </p>
        <p className="text-gray-700 leading-relaxed mb-6">
          Most dealers in high-Hispanic-population DMAs see a meaningful shift in lead
          quality within the first two weeks. Spanish-language WhatsApp leads tend to
          have shorter sales cycles because the buyer has already self-qualified by
          choosing to engage via WhatsApp with a specific vehicle.
        </p>
        <Link
          href="/lp/hispanic-auto-marketing"
          className="sf-btn inline-block bg-blue-600 text-white font-semibold text-base rounded-lg px-6 py-3 hover:bg-blue-700 transition-colors"
        >
          Get the bilingual playbook — free →
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
        <Link href="/whatsapp-marketing-dealerships" className="hover:underline">
          WhatsApp Marketing Guide →
        </Link>
        <Link href="/lp/hispanic-auto-marketing" className="hover:underline">
          Get the playbook →
        </Link>
      </nav>
    </div>
  );
}
