import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions, adminGuard } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const auth = await adminGuard("view_audit");
  if (!auth.ok) {
    redirect("/dashboard");
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold text-gray-900">
            CIAfeeds Admin
          </span>
          <nav className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Dealers
            </Link>
            <Link
              href="/admin/audit"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Audit Log
            </Link>
            <Link
              href="/admin/meta-delivery"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Delivery Health
            </Link>
          </nav>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full">
          ADMIN ONLY
        </span>
      </div>
      {children}
    </div>
  );
}
