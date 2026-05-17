/**
 * Spanish blog index — /es/blog
 *
 * This is a thin wrapper that forces locale="es" and delegates to the same
 * logic as the English blog index. We keep it as a separate route so that
 * the URL /es/blog is distinct, hreflang is accurate, and ISR keys are
 * separate (English and Spanish caches don't share a slot).
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewsletterForm from "@/app/(marketing)/components/NewsletterForm";

export const revalidate = 300;

function readTime(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("es-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const recent = await prisma.blogPost.findFirst({
    where: { status: "published", locale: "es" },
    orderBy: { publishedAt: "desc" },
    select: { heroImageUrl: true },
  });
  const ogImage = recent?.heroImageUrl ?? "/og/blog.png";

  return {
    title: "Blog CIAfeeds — Marketing en WhatsApp, Autos Hispanos, Meta Catalog",
    description:
      "Guías prácticas de marketing en WhatsApp y Meta Catalog para concesionarios de autos en EE. UU.",
    alternates: {
      canonical: `${origin}/es/blog`,
      languages: {
        "es-US": `${origin}/es/blog`,
        "en-US": `${origin}/blog`,
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

export default async function EsBlogIndexPage() {
  const locale: "en" | "es" = "es";

  const posts = await prisma.blogPost.findMany({
    where: { status: "published", locale: "es" },
    orderBy: { publishedAt: "desc" },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      heroImageUrl: true,
      publishedAt: true,
      bodyMarkdown: true,
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* Lang toggle */}
      <div className="flex justify-end mb-8">
        <Link href="/blog" className="text-sm text-blue-600 hover:underline">
          English
        </Link>
      </div>

      <header className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
          Blog CIAfeeds
        </h1>
        <p className="text-lg text-gray-500">
          Guías prácticas para concesionarios de autos en EE. UU.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-gray-500">
          Todavía no hay artículos publicados. Vuelve pronto.
        </p>
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
                    {formatDate(post.publishedAt)} · {rt} min de lectura
                  </p>
                  <h2 className="text-base font-semibold text-gray-900 mb-2 leading-snug">
                    {post.title}
                  </h2>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <Link
                    href={`/es/blog/${post.slug}`}
                    className="mt-4 text-sm text-blue-600 font-medium hover:underline"
                  >
                    Leer más →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="mt-20">
        <NewsletterForm
          source="blog-index"
          locale={locale}
          className="max-w-2xl"
        />
      </section>
    </div>
  );
}
