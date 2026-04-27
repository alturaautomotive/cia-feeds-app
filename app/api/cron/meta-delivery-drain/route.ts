import { NextRequest, NextResponse } from "next/server";
import { drainDeliveryQueue } from "@/lib/metaDelivery";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await drainDeliveryQueue();

  return NextResponse.json({
    ok: true,
    summary,
  });
}
