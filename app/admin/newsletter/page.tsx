import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminGuard } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptLeadField } from "@/lib/leadCrypto";
import NewsletterAdminList from "./NewsletterAdminList";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  source?: string;
  locale?: string;
  status?: string;
  page?: string;
}

const PAGE_SIZE = 50;

export default async function NewsletterAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Same access pattern as the rest of /admin: only super_admin sees the
  // destructive UI. adminGuard returns a redirect response for non-admins.
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) {
    // Force a redirect for non-admins. The guard's response carries the
    // 403 + redirect for API callers; for a page we just bounce to /dashboard.
    redirect("/dashboard");
  }

  // Touch headers so this page is rendered dynamically (no static cache of
  // PII-decrypted data).
  await headers();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const source = (sp.source ?? "").trim();
  const locale = (sp.locale ?? "").trim();
  const status = (sp.status ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where: Record<string, unknown> = {};
  if (source) where.source = source;
  if (locale) where.locale = locale;
  if (status === "active") where.unsubscribedAt = null;
  else if (status === "unsubscribed") where.unsubscribedAt = { not: null };

  const [rows, total, sourceFacets, localeFacets] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: offset,
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.groupBy({
      by: ["source"],
      _count: { source: true },
    }),
    prisma.newsletterSubscriber.groupBy({
      by: ["locale"],
      _count: { locale: true },
    }),
  ]);

  const decrypted = rows.map((r) => ({
    id: r.id,
    email: decryptLeadField(r.email) ?? "",
    name: r.name ? decryptLeadField(r.name) : null,
    phone: r.phone ? decryptLeadField(r.phone) : null,
    source: r.source,
    interest: r.interest,
    locale: r.locale,
    unsubscribedAt: r.unsubscribedAt ? r.unsubscribedAt.toISOString() : null,
    lastEmailedAt: r.lastEmailedAt ? r.lastEmailedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  // Apply free-text search after decryption so emails are searchable
  // without needing a column index on ciphertext. This narrows the CURRENT
  // page's rows; for broad searches use the source/locale/status facets
  // first.
  const filtered = q
    ? decrypted.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q)
      )
    : decrypted;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            ← Admin
          </Link>
          <h1 className="text-lg font-bold text-gray-900">
            Newsletter Subscribers
          </h1>
        </div>
        <div className="text-sm text-gray-500">
          Showing {filtered.length} of {total}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Facets */}
        <form
          method="get"
          className="bg-white border border-gray-200 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3"
        >
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search email or name"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900"
          />
          <select
            name="source"
            defaultValue={sp.source ?? ""}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">All sources</option>
            {sourceFacets.map((f) => (
              <option key={f.source} value={f.source}>
                {f.source} ({f._count.source})
              </option>
            ))}
          </select>
          <select
            name="locale"
            defaultValue={sp.locale ?? ""}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">All locales</option>
            {localeFacets.map((f) => (
              <option key={f.locale} value={f.locale}>
                {f.locale} ({f._count.locale})
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900"
          >
            <option value="">All status</option>
            <option value="active">Active only</option>
            <option value="unsubscribed">Unsubscribed only</option>
          </select>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded px-3 py-1.5"
          >
            Filter
          </button>
        </form>

        <NewsletterAdminList rows={filtered} />

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const params = new URLSearchParams();
              if (sp.q) params.set("q", sp.q);
              if (sp.source) params.set("source", sp.source);
              if (sp.locale) params.set("locale", sp.locale);
              if (sp.status) params.set("status", sp.status);
              if (p !== 1) params.set("page", String(p));
              const href = `/admin/newsletter${
                params.toString() ? `?${params.toString()}` : ""
              }`;
              return (
                <Link
                  key={p}
                  href={href}
                  className={`px-2.5 py-1 rounded border ${
                    p === page
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
