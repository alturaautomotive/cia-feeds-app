import { NextRequest, NextResponse } from "next/server";
import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";

/**
 * GET /api/meta/catalogs?businessId=... — Lists the product catalogs owned by
 * the given Meta Business Manager.
 */
export async function GET(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId_required" },
      { status: 400 }
    );
  }

  const accessToken = await loadDealerToken(guard.dealerId);
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  try {
    const res = await graphFetch(
      `/${encodeURIComponent(businessId)}/owned_product_catalogs?fields=id,name`,
      {},
      accessToken
    );
    if (!res.ok) {
      console.error({
        event: "meta_catalogs_list_failed",
        status: res.status,
      });
      return NextResponse.json(
        { error: "meta_api_error" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const catalogs = (data.data ?? [])
      .filter((c): c is { id: string; name: string } =>
        typeof c.id === "string" && typeof c.name === "string"
      )
      .map((c) => ({ id: c.id, name: c.name }));

    return NextResponse.json({ catalogs });
  } catch (err) {
    console.error({
      event: "meta_catalogs_list_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}
