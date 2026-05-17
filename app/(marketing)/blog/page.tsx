import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewsletterForm from "@/app/(marketing)/components/NewsletterForm";

export const revalidate = 300; // 5-minute ISR

// ---------- helpers ----------

function readTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
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
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const locale = sp.lang === "es" ? "es" : "en";
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  // Fetch most recent post hero for og:image fallback
  const recent = await prisma.blogPost.findFirst({
    where: { status: "published", locale },
    orderBy: { publishedAt: "desc" },
    select: { heroImageUrl: true },
  });

  const ogImage = recent?.heroImageUrl ?? "/og/blog.png";

  if (locale === "es") {
    return {
      title: "Blog CIAfeeds — Marketing en WhatsApp, Autos Hispanos, Meta Catalog",
      description:
        "Guías prácticas de marketing en WhatsApp y Meta Catalog para concesionarios de autos en EE. UU.",
      alternates: {
        canonical: `${origin}/es/blog`,
        languages: {
          "en-US": `${origin}/blog`,
          "es-US": `${origin}/es/blog`,
        },
      },
      openGraph: {
        title: "Blog CIAfeeds — Marketing en WhatsApp para Concesionarios",
        description:
          "Guías prácticas de marketing en WhatsApp y Meta Catalog para concesionarios.",
        images: [{ url: ogImage }],
        type: "website",
      },
    };
  }

  return {
    title: "CIAfeeds Blog — WhatsApp Marketing, Hispanic Auto, Meta Catalog Feeds",
    description:
      "Practical guides on WhatsApp marketing and Meta Catalog feeds for US car dealerships.",
    alternates: {
      canonical: `${origin}/blog`,
      languages: {
        "en-US": `${origin}/blog`,
        "es-US": `${origin}/es/blog`,
      },
    },
    openGraph: {
      title: "CIAfeeds Blog — WhatsApp Marketing, Hispanic Auto, Meta Catalog Feeds",
      description:
        "Practical guides on WhatsApp marketing and Meta Catalog feeds for US car dealerships.",
      images: [{ url: ogImage }],
      type: "website",
    },
  };
}

// ---------- page ----------

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const locale: "en" | "es" = sp.lang === "es" ? "es" : "en";

  const posts = await prisma.blogPost.findMany({
    where: { status: "published", locale },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      heroImageUrl: true,
      publishedAt: true,
      bodyMarkdown: true,
      landingSlug: true,
    },
  });

  const isEs = locale === "es";
  const blogBase = isEs ? "/es/blog" : "/blog";
  const otherLangHref = isEs ? "/blog" : "/es/blog";
  const otherLangLabel = isEs ? "English" : "Español";

  const headingText = isEs
    ? "Blog CIAfeeds"
    : "CIAfeeds Blog";
  const subText = isEs
    ? "Guías prácticas para concesionarios de autos en EE. UU."
    : "Practical guides for US car dealerships.";
  const noPostsText = isEs
    ? "Todavía no hay artículos publicados. Vuelve pronto."
    : "No published posts yet. Check back soon.";
  const readMoreText = isEs ? "Leer más →" : "Read more →";
  const readTimeLabel = (n: number) =>
    isEs ? `${n} min de lectura` : `${n} min read`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* Hreflang toggle */}
      <div className="flex items-center justify-end mb-8">
        <Link
          href={otherLangHref}
          className="text-sm text-blue-600 hover:underline"
        >
          {otherLangLabel}
        </Link>
      </div>

      {/* Header */}
      <header className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          {headingText}
        </h1>
        <p className="text-lg text-gray-500">{subText}</p>
      </header>

      {/* Posts grid */}
      {posts.length === 0 ? (
        <p className="text-gray-500">{noPostsText}</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const rt = readTime(post.bodyMarkdown);
            return (
              <article
                key={post.slug}
                className="sf-card flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {post.heroImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={post.heroImageUrl}
                    alt={post.title}
                    className="w-full h-44 object-cover"
                  />
                ) : (
                  <div className="w-full h-44 bg-gradient-to-br from-blue-600 to-blue-800" />
                )}
                <div className="p-5 flex flex-col flex-1">
                  <p className="text-xs text-gray-400 mb-1">
                    {formatDate(post.publishedAt, locale)} ·{" "}
                    {readTimeLabel(rt)}
                  </p>
                  <h2 className="text-base font-semibold text-gray-900 mb-2 leading-snug">
                    {post.title}
                  </h2>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <Link
                    href={`${blogBase}/${post.slug}`}
                    className="mt-4 text-sm text-blue-600 font-medium hover:underline"
                  >
                    {readMoreText}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Newsletter sticky section */}
      <section className="mt-20 sticky-newsletter">
        <NewsletterForm
          source="blog-index"
          locale={locale}
          className="max-w-2xl"
        />
      </section>
    </div>
  );
}
