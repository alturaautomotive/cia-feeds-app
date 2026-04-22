export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INVENTORY_PATTERNS = [
  /\/inventory\//i,
  /\/vehicles?\//i,
  /\/used\//i,
  /\/new\//i,
  /\/products?\//i,
  /\/shop\//i,
  /\/listing\//i,
  /\/cars?\//i,
  /\/trucks?\//i,
  /\/suvs?\//i,
  /\/vdp\//i,
  /\/detail\//i,
  /\/vehicle-details\//i,
  /\/certified\//i,
];

function isVdpUrl(url: string): boolean {
  return INVENTORY_PATTERNS.some((p) => p.test(url));
}

type CheckResult = {
  status: "active" | "sold_or_removed" | "redirect" | "error";
};

async function checkUrl(url: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });

    const statusCode = response.status;

    if (statusCode >= 200 && statusCode < 300) {
      return { status: "active" };
    }

    if (statusCode === 404 || statusCode === 410) {
      return { status: "sold_or_removed" };
    }

    if (statusCode >= 300 && statusCode < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { status: "redirect" };
      }

      // Resolve relative redirects
      const resolvedUrl = new URL(location, url).href;

      if (!isVdpUrl(resolvedUrl)) {
        return { status: "redirect" };
      }

      // Follow the redirect to check the final destination
      try {
        const followUp = await fetch(resolvedUrl, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        if (followUp.status >= 200 && followUp.status < 300) {
          return { status: "active" };
        }
        if (followUp.status === 404 || followUp.status === 410) {
          return { status: "sold_or_removed" };
        }
        return { status: "redirect" };
      } catch {
        return { status: "error" };
      }
    }

    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      archivedAt: null,
      dealer: { urlHealthCheckEnabled: true },
    },
    select: { id: true, url: true },
  });

  let checked = 0;
  let archived = 0;
  let errors = 0;

  for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
    const batch = vehicles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (vehicle) => {
        const result = await checkUrl(vehicle.url);
        checked++;

        try {
          if (result.status === "active") {
            await prisma.vehicle.update({
              where: { id: vehicle.id },
              data: {
                urlStatus: "active",
                urlLastCheckedAt: new Date(),
                urlCheckFailed: false,
              },
            });
          } else if (result.status === "sold_or_removed" || result.status === "redirect") {
            await prisma.vehicle.update({
              where: { id: vehicle.id },
              data: {
                urlStatus: result.status,
                urlLastCheckedAt: new Date(),
                urlCheckFailed: true,
                archivedAt: new Date(),
              },
            });
            archived++;
          } else {
            await prisma.vehicle.update({
              where: { id: vehicle.id },
              data: {
                urlStatus: "error",
                urlLastCheckedAt: new Date(),
                urlCheckFailed: true,
              },
            });
            errors++;
          }
        } catch (err) {
          console.error({
            event: "url_health_check_error",
            vehicleId: vehicle.id,
            url: vehicle.url,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    if (i + BATCH_SIZE < vehicles.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return NextResponse.json({ checked, archived, errors });
}
