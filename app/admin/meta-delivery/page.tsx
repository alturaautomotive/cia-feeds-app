import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UnblockButton } from "./UnblockButton";

const statusColor: Record<string, string> = {
  queued: "bg-blue-100 text-blue-800",
  processing: "bg-yellow-100 text-yellow-800",
  retry: "bg-amber-100 text-amber-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  blocked: "bg-red-200 text-red-900",
  skipped: "bg-gray-100 text-gray-600",
};

const statusOrder: Record<string, number> = {
  blocked: 0,
  retry: 1,
  processing: 2,
  queued: 3,
  failed: 4,
  skipped: 5,
  success: 6,
};

export default async function MetaDeliveryPage() {
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) {
    redirect("/dashboard");
  }

  const allJobs = await prisma.metaDeliveryJob.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      dealer: {
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          metaDeliveryMethod: true,
        },
      },
    },
  });

  // Dedupe by dealerId — keep first occurrence (latest by updatedAt)
  const seen = new Set<string>();
  const deduped = allJobs.filter((job) => {
    if (seen.has(job.dealerId)) return false;
    seen.add(job.dealerId);
    return true;
  });

  // Sort: blocked first, then retry, then rest by updatedAt desc
  deduped.sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Delivery Health
      </h2>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                "Dealer",
                "Mode",
                "Status",
                "Attempts",
                "Next Run",
                "Last Run",
                "Last Error",
                "Blocked Reason",
                "Action",
              ].map((col) => (
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
            {deduped.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No delivery jobs found.
                </td>
              </tr>
            ) : (
              deduped.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/dealers/${job.dealerId}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {job.dealer.name}
                    </Link>
                    <div className="text-xs text-gray-400">{job.dealer.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {job.dealer.metaDeliveryMethod}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor[job.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {job.attemptCount} / {job.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {job.status === "success"
                      ? "\u2014"
                      : job.nextRunAt
                        ? new Date(job.nextRunAt).toLocaleString()
                        : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{job.lastRunStatus ?? "\u2014"}</div>
                    {job.lastRunAt && (
                      <div className="text-xs text-gray-400">
                        {new Date(job.lastRunAt).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {job.lastErrorCode ? (
                      <span
                        className="text-xs font-mono text-red-600"
                        title={job.lastErrorMessage ?? undefined}
                      >
                        {job.lastErrorCode}
                      </span>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
                    {job.blockedReason ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === "blocked" && (
                      <UnblockButton dealerId={job.dealerId} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
