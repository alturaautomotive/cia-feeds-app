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
  if (
    session.user.teamRole === "editor" &&
    session.user.teamSubAccountId &&
    session.user.subAccountId &&
    session.user.subAccountId !== session.user.teamSubAccountId
  ) {
    // Redirect to their scoped sub-account
    redirect(`/dashboard?subAccountId=${session.user.teamSubAccountId}`);
  }

  return <>{children}</>;
}
