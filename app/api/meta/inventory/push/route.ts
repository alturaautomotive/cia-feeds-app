import { NextResponse } from "next/server";
import { authGuard } from "@/lib/meta";
import { enqueueDeliveryJob } from "@/lib/metaDelivery";

export async function POST() {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const result = await enqueueDeliveryJob(guard.dealerId, "api_push");

  if (result.outcome === "skipped") {
    const skipMode = result.reason === "dealer_mode_csv" ? "csv" : "api";
    return NextResponse.json({
      mode: skipMode,
      status: "skipped",
      reason: result.reason,
      queue: { outcome: "skipped" },
    });
  }

  if (result.outcome === "blocked") {
    return NextResponse.json(
      {
        mode: "api",
        status: "error",
        error: result.reason,
        needsReconnect: true,
        queue: { outcome: "blocked", reason: result.reason },
      },
      { status: 422 }
    );
  }

  if (result.outcome === "coalesced") {
    return NextResponse.json({
      mode: "api",
      status: "queued",
      summary: { accepted: true, jobId: result.jobId, coalescedCount: result.coalescedCount },
      queue: {
        outcome: "coalesced",
        jobId: result.jobId,
        coalescedCount: result.coalescedCount,
      },
      hint: "A delivery job is already pending for this dealer. Your trigger has been merged into it.",
    });
  }

  return NextResponse.json({
    mode: "api",
    status: "queued",
    summary: { accepted: true, jobId: result.jobId },
    queue: {
      outcome: "queued",
      jobId: result.jobId,
    },
    hint: "Delivery job has been queued. It will be processed by the next drain cycle.",
  });
}
