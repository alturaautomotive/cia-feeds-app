import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { GRAPH_BASE, decryptToken } from "@/lib/meta";
import { writeAuditLog } from "@/lib/adminAudit";

/**
 * POST /api/fb/disconnect — Clears the stored Facebook Page id and Meta
 * Business/Catalog/Feed credentials for the dealer.
 *
 * Security (SECURITY_AUDIT.md F-2.4): Before clearing the local row, we make
 * a best-effort revocation call to Meta:
 *   DELETE https://graph.facebook.com/v19.0/me/permissions
 *
 * This invalidates the token on Meta's side so that, even if the encrypted
 * token leaks from a backup or DB snapshot taken before disconnect, it
 * cannot be used to read or write the dealer's Meta assets. The local clear
 * proceeds even if the revocation call fails, so a Meta API outage does not
 * trap the dealer in a "connected" state.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Load the current token so we can revoke it before nulling the row.
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true, email: true },
  });

  let revocationStatus: "revoked" | "skipped_no_token" | "failed" = "skipped_no_token";
  let revocationError: string | undefined;

  if (dealer?.metaAccessToken) {
    try {
      const token = decryptToken(dealer.metaAccessToken);
      // Use AbortSignal.timeout so a hung Meta endpoint doesn't block the
      // user-facing disconnect for more than 5 seconds.
      const res = await fetch(
        `${GRAPH_BASE}/me/permissions`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        revocationStatus = "revoked";
      } else {
        revocationStatus = "failed";
        revocationError = `meta_returned_${res.status}`;
      }
    } catch (err) {
      revocationStatus = "failed";
      revocationError = err instanceof Error ? err.message : String(err);
      console.error({
        event: "fb_disconnect_revocation_failed",
        dealerId,
        message: revocationError,
      });
    }
  }

  // Local clear (always runs).
  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      fbPageId: null,
      metaAccessToken: null,
      metaBusinessId: null,
      metaCatalogId: null,
      metaFeedId: null,
      metaTokenType: null,
      metaTokenExpiresAt: null,
      metaCatalogOwnership: null,
      metaAdAccountId: null,
      metaConnectedAt: null,
      metaDeliveryMethod: "csv",
    },
  });

  // Audit trail — captures whether revocation succeeded so we can find
  // dealers whose Meta-side token might still be live if it ever leaks.
  await writeAuditLog({
    action: "dealer.meta.disconnect",
    actorEmail: dealer?.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
    metadata: { revocationStatus, revocationError: revocationError ?? null },
  }).catch((err) => {
    // Don't fail the disconnect if audit log write fails.
    console.error({ event: "fb_disconnect_audit_failed", dealerId, err: String(err) });
  });

  return NextResponse.json({ ok: true, revocationStatus });
}
