import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewsletterForm from "@/app/(marketing)/components/NewsletterForm";

export const revalidate = 600;

// ---------- tiny inline markdown renderer ----------
// Used as fallback when `marked` is not installed.

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inOl = false;

  function closeLists() {
    if (inList) { out.push("</ul>"); inList = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  }

  function inlineFormat(text: string): string {
    return text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      // Inline code
      .replace(/`(.+?)`/g, "<code>$1</code>")
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      closeLists();
      const level = hMatch[1].length;
      const text = inlineFormat(escHtml(hMatch[2]));
      const cls =
        level === 1 ? "text-2xl font-bold mt-8 mb-3 text-gray-900" :
        level === 2 ? "text-xl font-semibold mt-7 mb-2 text-gray-900" :
        level === 3 ? "text-lg font-semibold mt-5 mb-2 text-gray-800" :
        "text-base font-semibold mt-4 mb-1 text-gray-800";
      out.push(`<h${level} class="${cls}">${text}</h${level}>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push('<ul class="list-disc pl-6 my-3 space-y-1 text-gray-700">'); inList = true; }
      out.push(`<li>${inlineFormat(escHtml(ulMatch[1]))}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOl) { out.push('<ol class="list-decimal pl-6 my-3 space-y-1 text-gray-700">'); inOl = true; }
      out.push(`<li>${inlineFormat(escHtml(olMatch[1]))}</li>`);
      continue;
    }

    closeLists();

    // Empty line — paragraph break
    if (line === "") {
      out.push('<div class="mb-3"></div>');
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      out.push('<hr class="my-6 border-gray-200" />');
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s*(.*)$/);
    if (bqMatch) {
      out.push(
        `<blockquote class="border-l-4 border-blue-300 pl-4 italic text-gray-600 my-4">${inlineFormat(escHtml(bqMatch[1]))}</blockquote>`
      );
      continue;
    }

    // Paragraph
    out.push(`<p class="mb-4 text-gray-700 leading-relaxed">${inlineFormat(escHtml(line))}</p>`);
  }
  closeLists();
  return out.join("\n");
}

// ---------- helpers ----------

function readTime(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));
}

function formatDate(d: Date | null, locale: "en" | "es"): string {
  if (!d) return "";
  return d.toLocaleDateString(locale === "es" ? "es-US" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------- metadata ----------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      title: true,
      metaDescription: true,
      heroImageUrl: true,
      publishedAt: true,
      locale: true,
      status: true,
    },
  });

  if (!post || post.status !== "published") return { title: "Not found" };

  const locale = post.locale as "en" | "es";
  const isEs = locale === "es";
  const canonicalPath = isEs ? `/es/blog/${slug}` : `/blog/${slug}`;
  const altPath = isEs ? `/blog/${slug}` : `/es/blog/${slug}`;
  const altLocale = isEs ? "en-US" : "es-US";
  const canonLocale = isEs ? "es-US" : "en-US";

  return {
    title: post.title,
    description: post.metaDescription,
    alternates: {
      canonical: `${origin}${canonicalPath}`,
      languages: {
        [canonLocale]: `${origin}${canonicalPath}`,
        [altLocale]: `${origin}${altPath}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.metaDescription,
      images: post.heroImageUrl ? [{ url: post.heroImageUrl }] : [],
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.metaDescription,
      images: post.heroImageUrl ? [post.heroImageUrl] : undefined,
    },
  };
}

// ---------- page ----------

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      metaDescription: true,
      excerpt: true,
      bodyMarkdown: true,
      heroImageUrl: true,
      publishedAt: true,
      locale: true,
      status: true,
      landingSlug: true,
      mediumUrl: true,
      views: true,
    },
  });

  if (!post || post.status !== "published") notFound();

  // Increment views — fire-and-forget
  prisma.blogPost
    .update({ where: { id: post.id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  const locale = post.locale as "en" | "es";
  const isEs = locale === "es";
  const rt = readTime(post.bodyMarkdown);
  const canonicalPath = isEs ? `/es/blog/${slug}` : `/blog/${slug}`;
  const altPath = isEs ? `/blog/${slug}` : `/es/blog/${slug}`;

  // Render body
  const htmlBody = renderMarkdown(post.bodyMarkdown);

  // JSON-LD Article schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    image: post.heroImageUrl ?? `${origin}/og/blog.png`,
    datePublished: post.publishedAt?.toISOString() ?? "",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${origin}${canonicalPath}` },
    author: { "@type": "Person", name: "Luis Delgado" },
    publisher: {
      "@type": "Organization",
      name: "CIAfeeds",
      logo: {
        "@type": "ImageObject",
        url: `${origin}/logo.png`,
      },
    },
  };

  // CTA labels
  const ctaTitle = isEs
    ? "¿Listo para implementarlo en tu concesionario?"
    : "Ready to put this into action at your dealership?";
  const ctaBody = isEs
    ? "Configura tu feed de Meta Catalog con Click-to-WhatsApp en menos de 10 minutos."
    : "Set up your Meta Catalog feed with Click-to-WhatsApp in under 10 minutes.";
  const ctaBtn = isEs ? "Ver cómo funciona →" : "See how it works →";
  const mediumLabel = isEs ? "También en Medium →" : "Also on Medium →";
  const readTimeLabel = isEs ? `${rt} min de lectura` : `${rt} min read`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-col lg:flex-row gap-12">
        {/* Article */}
        <article className="flex-1 min-w-0">
          {/* Hero */}
          {post.heroImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={post.heroImageUrl}
              alt={post.title}
              className="w-full rounded-xl object-cover mb-6"
              style={{ maxHeight: 420 }}
            />
          ) : (
            <div className="w-full rounded-xl h-52 bg-gradient-to-br from-blue-600 to-blue-800 mb-6" />
          )}

          {/* Meta row */}
          <p className="text-sm text-gray-400 mb-3">
            {formatDate(post.publishedAt, locale)} · {readTimeLabel}
            {post.mediumUrl && (
              <>
                {" "}·{" "}
                <a
                  href={post.mediumUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {mediumLabel}
                </a>
              </>
            )}
          </p>

          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
            {post.title}
          </h1>

          <p className="text-lg text-gray-600 leading-relaxed mb-8 border-l-4 border-blue-200 pl-4">
            {post.excerpt}
          </p>

          {/* Body */}
          <div
            className="prose-body max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />

          {/* After-body CTA */}
          {post.landingSlug && (
            <div className="mt-10 bg-blue-600 text-white rounded-xl p-6 sm:p-8">
              <p className="text-lg font-bold mb-2">{ctaTitle}</p>
              <p className="text-blue-100 text-sm mb-5">{ctaBody}</p>
              <Link
                href={`/lp/${post.landingSlug}`}
                className="inline-block bg-white text-blue-600 font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-50 transition-colors"
              >
                {ctaBtn}
              </Link>
            </div>
          )}
        </article>

        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <div className="sticky top-24 flex flex-col gap-6">
            <NewsletterForm
              source={`blog:${slug}`}
              locale={locale}
              interest={post.landingSlug}
              variant="sidebar"
            />

            {/* Internal links */}
            <div className="text-sm text-gray-600">
              <p className="font-semibold mb-2">
                {isEs ? "Más recursos" : "More resources"}
              </p>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/whatsapp-marketing-dealerships"
                    className="text-blue-600 hover:underline"
                  >
                    {isEs
                      ? "Guía de WhatsApp Marketing"
                      : "WhatsApp Marketing Guide"}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/hispanic-auto-marketing"
                    className="text-blue-600 hover:underline"
                  >
                    {isEs
                      ? "Marketing Automotriz Hispano"
                      : "Hispanic Auto Marketing Guide"}
                  </Link>
                </li>
                <li>
                  <Link
                    href={isEs ? "/es/blog" : "/blog"}
                    className="text-blue-600 hover:underline"
                  >
                    {isEs ? "← Volver al blog" : "← Back to blog"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Hreflang switch */}
            <p className="text-xs text-gray-400">
              <Link href={`${altPath}`} className="text-blue-600 hover:underline">
                {isEs ? "Read in English" : "Leer en español"}
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
