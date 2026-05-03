import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    actorEmail?: string;
    targetDealerId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const auth = await adminGuard("view_audit");
  if (!auth.ok) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, parseInt(params.page ?? "1", 10) || 1));
  const pageSize = 50;

  const where: Record<string, unknown> = {};

  if (params.action) {
    where.action = params.action;
  }
  if (params.actorEmail) {
    where.actorEmail = { contains: params.actorEmail, mode: "insensitive" };
  }
  if (params.targetDealerId) {
    where.targetDealerId = params.targetDealerId;
  }

  const dateFilter: Record<string, Date> = {};
  if (params.from) {
    const d = new Date(params.from);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      dateFilter.gte = d;
    }
  }
  if (params.to) {
    const d = new Date(params.to);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
  }
  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter;
  }

  const [logs, count] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(count / pageSize);

  function buildPageUrl(p: number): string {
    const sp = new URLSearchParams();
    if (params.action) sp.set("action", params.action);
    if (params.actorEmail) sp.set("actorEmail", params.actorEmail);
    if (params.targetDealerId) sp.set("targetDealerId", params.targetDealerId);
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    sp.set("page", String(p));
    return `/admin/audit?${sp.toString()}`;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Audit Log
      </h2>

      {/* Filters */}
      <form method="get" action="/admin/audit" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <input
            name="action"
            defaultValue={params.action ?? ""}
            placeholder="e.g. admin.meta_delivery.update"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Actor Email</label>
          <input
            name="actorEmail"
            defaultValue={params.actorEmail ?? ""}
            placeholder="email contains..."
            className="border border-gray-200 rounded-md px-3 py-2 text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Target Dealer ID</label>
          <input
            name="targetDealerId"
            defaultValue={params.targetDealerId ?? ""}
            placeholder="UUID"
            className="border border-gray-200 rounded-md px-3 py-2 text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          Filter
        </button>
        <Link
          href="/admin/audit"
          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
        >
          Reset
        </Link>
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Timestamp", "Actor", "Action", "Target", "JSON"].map((col) => (
                <th
                  key={col}
                  className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{log.actorEmail}</div>
                    <div className="text-xs text-gray-400">{log.actorRole}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.targetDealerId ? (
                      <Link
                        href={`/admin/dealers/${log.targetDealerId}`}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-mono"
                      >
                        {log.targetDealerId.slice(0, 8)}...
                      </Link>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800">
                        view
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48 max-w-md">
                        {JSON.stringify(
                          {
                            before: log.beforeState,
                            after: log.afterState,
                            metadata: log.metadata,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {totalPages} ({count} entries)
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1)}
                className="text-indigo-600 hover:text-indigo-800"
              >
                &larr; Prev
              </Link>
            ) : (
              <span className="text-gray-300">&larr; Prev</span>
            )}
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1)}
                className="text-indigo-600 hover:text-indigo-800"
              >
                Next &rarr;
              </Link>
            ) : (
              <span className="text-gray-300">Next &rarr;</span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
