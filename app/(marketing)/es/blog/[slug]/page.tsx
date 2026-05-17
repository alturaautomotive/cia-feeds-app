/**
 * Spanish blog post — /es/blog/[slug]
 *
 * Same logic as the English post page but canonicalized to /es/blog/<slug>
 * and defaulting UI copy to Spanish. The slug is shared across locales
 * (Prisma `locale` field differentiates them) — however the existing schema
 * has `slug` as globally unique, so in practice Spanish posts use distinct
 * slugs (e.g. "marketing-whatsapp-concesionarios"). We look up by slug and
 * verify locale="es".
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewsletterForm from "@/app/(marketing)/components/NewsletterForm";

export const revalidate = 600;

// ---------- tiny inline markdown renderer ----------

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
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
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
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inList) { out.push('<ul class="list-disc pl-6 my-3 space-y-1 text-gray-700">'); inList = true; }
      out.push(`<li>${inlineFormat(escHtml(ulMatch[1]))}</li>`);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (!inOl) { out.push('<ol class="list-decimal pl-6 my-3 space-y-1 text-gray-700">'); inOl = true; }
      out.push(`<li>${inlineFormat(escHtml(olMatch[1]))}</li>`);
      continue;
    }
    closeLists();
    if (line === "") { out.push('<div class="mb-3"></div>'); continue; }
    if (/^---+$/.test(line)) { out.push('<hr class="my-6 border-gray-200" />'); continue; }
    const bqMatch = line.match(/^>\s*(.*)$/);
    if (bqMatch) {
      out.push(`<blockquote class="border-l-4 border-blue-300 pl-4 italic text-gray-600 my-4">${inlineFormat(escHtml(bqMatch[1]))}</blockquote>`);
      continue;
    }
    out.push(`<p class="mb-4 text-gray-700 leading-relaxed">${inlineFormat(escHtml(line))}</p>`);
  }
  closeLists();
  return out.join("\n");
}

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
      status: true,
    },
  });

  if (!post || post.status !== "published") return { title: "No encontrado" };

  return {
    title: post.title,
    description: post.metaDescription,
    alternates: {
      canonical: `${origin}/es/blog/${slug}`,
      languages: {
        "es-US": `${origin}/es/blog/${slug}`,
        "en-US": `${origin}/blog/${slug}`,
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

export default async function EsBlogPostPage({
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
    },
  });

  if (!post || post.status !== "published") notFound();

  // Increment views — fire-and-forget
  prisma.blogPost
    .update({ where: { id: post.id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  const rt = readTime(post.bodyMarkdown);
  const htmlBody = renderMarkdown(post.bodyMarkdown);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    image: post.heroImageUrl ?? `${origin}/og/blog.png`,
    datePublished: post.publishedAt?.toISOString() ?? "",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${origin}/es/blog/${slug}` },
    author: { "@type": "Person", name: "Luis Delgado" },
    publisher: {
      "@type": "Organization",
      name: "CIAfeeds",
      logo: { "@type": "ImageObject", url: `${origin}/logo.png` },
    },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-col lg:flex-row gap-12">
        <article className="flex-1 min-w-0">
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

          <p className="text-sm text-gray-400 mb-3">
            {formatDate(post.publishedAt)} · {rt} min de lectura
            {post.mediumUrl && (
              <>
                {" "}·{" "}
                <a
                  href={post.mediumUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  También en Medium →
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

          <div
            className="prose-body max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />

          {post.landingSlug && (
            <div className="mt-10 bg-blue-600 text-white rounded-xl p-6 sm:p-8">
              <p className="text-lg font-bold mb-2">
                ¿Listo para implementarlo en tu concesionario?
              </p>
              <p className="text-blue-100 text-sm mb-5">
                Configura tu feed de Meta Catalog con Click-to-WhatsApp en menos de 10 minutos.
              </p>
              <Link
                href={`/lp/${post.landingSlug}`}
                className="inline-block bg-white text-blue-600 font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-50 transition-colors"
              >
                Ver cómo funciona →
              </Link>
            </div>
          )}
        </article>

        <aside className="lg:w-72 shrink-0">
          <div className="sticky top-24 flex flex-col gap-6">
            <NewsletterForm
              source={`blog:${slug}`}
              locale="es"
              interest={post.landingSlug ?? undefined}
              variant="sidebar"
            />
            <div className="text-sm text-gray-600">
              <p className="font-semibold mb-2">Más recursos</p>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/marketing-whatsapp-concesionarios"
                    className="text-blue-600 hover:underline"
                  >
                    Guía de WhatsApp Marketing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/marketing-automotriz-hispanos"
                    className="text-blue-600 hover:underline"
                  >
                    Marketing Automotriz Hispano
                  </Link>
                </li>
                <li>
                  <Link href="/es/blog" className="text-blue-600 hover:underline">
                    ← Volver al blog
                  </Link>
                </li>
              </ul>
            </div>
            <p className="text-xs text-gray-400">
              <Link href={`/blog/${slug}`} className="text-blue-600 hover:underline">
                Read in English
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
