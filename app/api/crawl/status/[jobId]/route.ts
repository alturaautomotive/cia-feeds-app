import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { normalizeUrl } from "@/app/api/crawl/route";

/**
 * GET /api/crawl/status/[jobId] — Poll crawl job progress
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  const job = await prisma.crawlJob.findFirst({
    where: { id: jobId, dealerId },
  });

  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Compute counts from actual snapshots rather than trusting batch-incremented fields
  const [urlsFound, urlsEnriched] = await Promise.all([
    prisma.crawlSnapshot.count({
      where: { crawlJobId: jobId },
    }),
    prisma.crawlSnapshot.count({
      where: {
        crawlJobId: jobId,
        OR: [
          { title: { not: null } },
          { thumbnailUrl: { not: null } },
        ],
      },
    }),
  ]);

  // Stall detection: if enriching has stalled for over 5 minutes, force-complete
  const STALL_TIMEOUT_MS = 5 * 60 * 1000;
  const jobAge = Date.now() - new Date(job.startedAt).getTime();
  const isStalled =
    (job.status === "mapping_complete" || job.status === "running") &&
    job.phase === "enriching" &&
    jobAge > STALL_TIMEOUT_MS &&
    urlsEnriched > 0;

  if (isStalled) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: "complete", phase: "complete", completedAt: new Date() },
    });
    job.status = "complete";
    job.phase = "complete";
  }

  // Auto-complete logic: if enrichment count has caught up but status wasn't set yet
  if (
    urlsEnriched >= urlsFound &&
    urlsFound > 0 &&
    job.status !== "complete" &&
    job.status !== "failed"
  ) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: "complete", phase: "complete", completedAt: new Date() },
    });
    job.status = "complete";
    job.phase = "complete";
  }

  // When complete, include all dealer snapshots (deduplicated)
  let snapshots: unknown[] | undefined;
  if (job.status === "complete") {
    const snapshotsRaw = await prisma.crawlSnapshot.findMany({
      where: { dealerId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        url: true,
        firstSeenAt: true,
        lastSeenAt: true,
        weeksActive: true,
        addedToFeed: true,
        make: true,
        model: true,
        year: true,
        price: true,
        title: true,
        thumbnailUrl: true,
      },
    });

    const seenUrls = new Map<string, (typeof snapshotsRaw)[number]>();
    for (const snap of snapshotsRaw) {
      const key = normalizeUrl(snap.url);
      if (!seenUrls.has(key)) {
        seenUrls.set(key, snap);
      }
    }
    snapshots = [...seenUrls.values()];
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    urlsFound,
    urlsEnriched,
    ...(snapshots ? { snapshots } : {}),
  });
}
