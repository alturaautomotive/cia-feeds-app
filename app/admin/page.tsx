import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ImpersonateButton } from "./ImpersonateButton";

export default async function AdminPage() {
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { vehicles: true } },
    },
  });

  const completeCounts = await prisma.vehicle.groupBy({
    by: ['dealerId'],
    where: { isComplete: true },
    _count: true,
  });
  const completeMap = new Map<string, number>(
    completeCounts.map((row) => [row.dealerId, row._count])
  );

  const totalDealers = dealers.length;
  const activeCount = dealers.filter(
    (d) => d.subscriptionStatus === "active"
  ).length;
  const pastDueCount = dealers.filter(
    (d) => d.subscriptionStatus === "past_due"
  ).length;
  const noSubCount = dealers.filter((d) => !d.subscriptionStatus).length;

  function getSubscriptionBadge(status: string | null): {
    label: string;
    classes: string;
  } {
    switch (status) {
      case "active":
        return { label: "Active", classes: "bg-green-100 text-green-800" };
      case "past_due":
        return { label: "Past Due", classes: "bg-red-100 text-red-800" };
      case "canceled":
        return { label: "Canceled", classes: "bg-gray-100 text-gray-600" };
      case "trialing":
        return { label: "Trialing", classes: "bg-blue-100 text-blue-800" };
      default:
        return { label: "No Sub", classes: "bg-yellow-100 text-yellow-800" };
    }
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-semibold text-gray-900">
          CIAfeeds Admin
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full">
          ADMIN ONLY
        </span>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total Dealers",
              value: totalDealers,
              sub: "all time",
            },
            {
              label: "Active Subscribers",
              value: activeCount,
              sub: "paying now",
            },
            {
              label: "Past Due / At Risk",
              value: pastDueCount,
              sub: "needs attention",
            },
            {
              label: "No Subscription",
              value: noSubCount,
              sub: "never subscribed",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-white border border-gray-200 rounded-lg px-5 py-4"
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                {card.label}
              </p>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Dealer table */}
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          All Dealers
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "Dealer",
                  "Email",
                  "Subscription",
                  "Vehicles",
                  "Complete",
                  "Joined",
                  "Feed",
                  "Actions",
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
              {dealers.map((dealer) => {
                const { label, classes } = getSubscriptionBadge(
                  dealer.subscriptionStatus
                );
                const completeCount = completeMap.get(dealer.id) ?? 0;
                const totalVehicles = dealer._count.vehicles;

                return (
                  <tr key={dealer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <strong className="text-gray-900">{dealer.name}</strong>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{dealer.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${classes}`}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{totalVehicles}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {totalVehicles === 0
                        ? "—"
                        : `${completeCount} / ${totalVehicles}`}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(dealer.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`${process.env.NEXT_PUBLIC_APP_URL}/feeds/${dealer.slug}.csv`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        ↗ Feed
                      </a>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <Link
                        href={`/admin/dealers/${dealer.id}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                      >
                        View Data
                      </Link>
                      <ImpersonateButton dealerId={dealer.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
