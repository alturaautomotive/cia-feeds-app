// TODO: REMOVE THIS ENDPOINT AFTER DEBUGGING — contains internal diagnostics
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const env = {
      NEXTAUTH_SECRET_SET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NODE_ENV: process.env.NODE_ENV,
    };

    const session = await getServerSession(authOptions);

    const cookieNames = request.cookies.getAll().map((c) => c.name);

    let dealer = null;
    if (session) {
      const row = await prisma.dealer.findUnique({
        where: { id: session.user.id },
        select: {
          active: true,
          subscriptionStatus: true,
          stripeCustomerId: true,
        },
      });
      if (row) {
        dealer = {
          active: row.active,
          subscriptionStatus: row.subscriptionStatus,
          stripeCustomerIdSet: !!row.stripeCustomerId,
        };
      }
    }

    return NextResponse.json({ env, session, cookieNames, dealer });
  } catch (err) {
    return NextResponse.json(
      { error: "internal error" },
      { status: 500 }
    );
  }
}
