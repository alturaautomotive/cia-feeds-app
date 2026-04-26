import { NextResponse } from "next/server";
import { authGuard } from "@/lib/meta";
import { deliverFeed } from "@/lib/metaDelivery";

export async function POST() {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const result = await deliverFeed(guard.dealerId);

  if (result.status === "skipped") {
    return NextResponse.json({
      mode: result.mode,
      status: "skipped",
      reason: result.reason,
    });
  }

  if (result.status === "error") {
    return NextResponse.json(
      {
        mode: "api",
        status: "error",
        error: result.error,
        ...(result.partialSummary ? { summary: result.partialSummary } : {}),
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    mode: "api",
    status: "success",
    summary: result.summary,
    hint: result.summary.handles.length > 0
      ? "Poll /api/meta/inventory/status?handle={handle} to check batch processing status."
      : undefined,
  });
}
