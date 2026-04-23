import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // If this is a team member (editor) scoped to a specific sub-account,
  // enforce that they can only access that sub-account's data.
  // Admins and dealer owners have full access.
  const tu = session.user.teamUser;
  if (
    tu?.role === "editor" &&
    tu.subAccountId &&
    session.user.subAccountId &&
    session.user.subAccountId !== tu.subAccountId
  ) {
    redirect(`/dashboard?subAccountId=${tu.subAccountId}`);
  }

  return <>{children}</>;
}
