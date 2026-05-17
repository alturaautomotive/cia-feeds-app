import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { LP_COPY } from "./copy";
import LeadForm from "./LeadForm";

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const copy = LP_COPY[slug];
  if (!copy) return { title: "Not found" };

  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const twinPath = `/lp/${copy.twinSlug}`;
  const canonicalLocale = copy.locale === "es" ? "es-US" : "en-US";
  const altLocale = copy.locale === "es" ? "en-US" : "es-US";

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: {
      canonical: `${origin}/lp/${slug}`,
      languages: {
        [canonicalLocale]: `${origin}/lp/${slug}`,
        [altLocale]: `${origin}${twinPath}`,
      },
    },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      images: [{ url: `/og/${slug}.png` }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const copy = LP_COPY[slug];
  if (!copy) notFound();

  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  // FAQ JSON-LD
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  const isEs = copy.locale === "es";

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hreflang alternate */}
      <link
        rel="alternate"
        hrefLang={isEs ? "en-US" : "es-US"}
        href={`${origin}/lp/${copy.twinSlug}`}
      />

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="inline-block bg-blue-500/40 text-blue-100 text-xs font-semibold px-3 py-1 rounded-full mb-5 uppercase tracking-wide">
            CIAfeeds
          </p>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight mb-5">
            {copy.h1}
          </h1>
          <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-8 leading-relaxed">
            {copy.subHeadline}
          </p>
          <a
            href="#lead-form"
            className="sf-btn inline-block bg-white text-blue-700 font-bold text-base px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors shadow-lg"
          >
            {copy.ctaLabel}
          </a>
        </div>
      </section>

      {/* ── VALUE PROPS ── */}
      <section className="py-16 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto grid gap-8 sm:grid-cols-3">
          {copy.valueProps.map((vp, i) => (
            <div
              key={i}
              className="sf-card bg-gray-50 rounded-xl p-6 border border-gray-100"
            >
              <span className="text-3xl block mb-3">{vp.icon}</span>
              <h3 className="text-base font-semibold text-gray-900 mb-2">{vp.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{vp.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-10 text-center">
            {copy.howItWorksTitle}
          </h2>
          <div className="flex flex-col sm:flex-row gap-8">
            {copy.steps.map((step) => (
              <div key={step.number} className="flex-1 flex flex-col items-start">
                <span className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mb-4">
                  {step.number}
                </span>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="py-10 px-4 sm:px-6 bg-white border-y border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-500 text-sm font-medium">{copy.socialProof}</p>
        </div>
      </section>

      {/* ── LEAD FORM ── */}
      <section id="lead-form" className="py-16 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <LeadForm
            slug={slug}
            locale={copy.locale}
            labels={copy.labels}
            formTitle={copy.formTitle}
            formCta={copy.formCta}
            thankYouTitle={copy.thankYouTitle}
            thankYouBody={copy.thankYouBody}
          />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">{copy.faqTitle}</h2>
          <div className="space-y-6">
            {copy.faqs.map((faq, i) => (
              <div key={i} className="border-b border-gray-100 pb-6 last:border-0">
                <p className="font-semibold text-gray-900 mb-2">{faq.q}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <section className="py-16 px-4 sm:px-6 bg-blue-600 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            {copy.footerCtaTitle}
          </h2>
          <p className="text-blue-100 text-sm mb-6">{copy.footerCtaBody}</p>
          <a
            href="#lead-form"
            className="sf-btn inline-block bg-white text-blue-700 font-bold text-sm px-7 py-3.5 rounded-xl hover:bg-blue-50 transition-colors"
          >
            {copy.footerCtaButton}
          </a>
          <p className="mt-6 text-xs text-blue-200">
            <Link href="/blog" className="hover:text-white underline">
              {isEs ? "Leer el blog →" : "Read the blog →"}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
