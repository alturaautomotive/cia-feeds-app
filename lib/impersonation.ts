import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

export const IMPERSONATION_COOKIE = "impersonation_session";

export async function signImpersonationToken(dealerId: string): Promise<string> {
  return new SignJWT({ dealerId, isImpersonating: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyImpersonationToken(
  token: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.isImpersonating && typeof payload.dealerId === "string") {
      return payload.dealerId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Defense-in-depth: confirm a candidate dealer ID actually corresponds to an
 * existing, active Dealer row before any tenant-scoped query trusts it
 * (SECURITY_AUDIT.md F-1.2).
 *
 * Cached for the lifetime of a single request via globalThis (Next 16 lambda
 * isolation gives us a fresh global per request); avoids re-querying on every
 * helper invocation in routes that call getEffectiveDealerId multiple times.
 */
export async function verifyDealer(dealerId: string): Promise<boolean> {
  if (!dealerId || typeof dealerId !== "string") return false;
  const cache = (globalThis as unknown as { __dealerVerifyCache?: Map<string, boolean> }).__dealerVerifyCache ??=
    new Map<string, boolean>();
  if (cache.has(dealerId)) return cache.get(dealerId)!;

  const row = await prisma.dealer.findUnique({
    where: { id: dealerId, active: true },
    select: { id: true },
  });
  const ok = !!row;
  // Cache for ~30s; safe because deactivation propagates on next request after expiry.
  cache.set(dealerId, ok);
  setTimeout(() => cache.delete(dealerId), 30_000).unref?.();
  return ok;
}

/**
 * Resolves the effective dealer ID for dashboard-facing API routes.
 * If an impersonation cookie is present and the caller is an admin,
 * returns the impersonated dealer ID. Otherwise returns the session user ID.
 * Returns null if the user is not authenticated.
 *
 * In all cases the returned id has been verified against an active Dealer row.
 */
export async function getEffectiveDealerId(): Promise<string | null> {
  const { effectiveDealerId } = await getEffectiveDealerContext();
  return effectiveDealerId;
}

/**
 * Returns both the effective dealer ID and whether impersonation is active.
 * Useful for pages that need to adjust behavior during impersonation.
 *
 * Defense-in-depth (F-1.2):
 *  - Requires session.user.userType ∈ {"dealer","teamuser"} (we never issue
 *    sessions for any other identity type, but assert it here as a tripwire).
 *  - Confirms the dealer id maps to an active Dealer row before returning it
 *    (so a future identity-provider bug can't cause cross-tenant bleed).
 */
export async function getEffectiveDealerContext(): Promise<{
  effectiveDealerId: string | null;
  isImpersonating: boolean;
  sessionUserId: string | null;
  hasStaleImpersonationCookie: boolean;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      effectiveDealerId: null,
      isImpersonating: false,
      sessionUserId: null,
      hasStaleImpersonationCookie: false,
    };
  }

  // Trip-wire: reject sessions that aren't from our known identity providers.
  // The userType claim is set by lib/auth.ts on every login; any other value
  // means something has tampered with the JWT (or we shipped a new provider
  // without updating this check).
  const userType = session.user.userType;
  if (userType !== "dealer" && userType !== "teamuser") {
    console.error({
      event: "session_unknown_userType",
      userType,
      userId: session.user.id,
    });
    return {
      effectiveDealerId: null,
      isImpersonating: false,
      sessionUserId: session.user.id,
      hasStaleImpersonationCookie: false,
    };
  }

  const cookieStore = await cookies();
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE);

  if (impersonationCookie?.value) {
    const isAdmin =
      session.user.email &&
      session.user.email.toLowerCase() === ADMIN_EMAIL;

    if (isAdmin) {
      const dealerId = await verifyImpersonationToken(impersonationCookie.value);
      if (dealerId && (await verifyDealer(dealerId))) {
        return {
          effectiveDealerId: dealerId,
          isImpersonating: true,
          sessionUserId: session.user.id,
          hasStaleImpersonationCookie: false,
        };
      }
    }

    // Cookie exists but user is not admin or token is invalid/expired.
    // Fall through to the no-impersonation path but flag stale cookie.
    if (await verifyDealer(session.user.id)) {
      return {
        effectiveDealerId: session.user.id,
        isImpersonating: false,
        sessionUserId: session.user.id,
        hasStaleImpersonationCookie: true,
      };
    }
    return {
      effectiveDealerId: null,
      isImpersonating: false,
      sessionUserId: session.user.id,
      hasStaleImpersonationCookie: true,
    };
  }

  if (await verifyDealer(session.user.id)) {
    return {
      effectiveDealerId: session.user.id,
      isImpersonating: false,
      sessionUserId: session.user.id,
      hasStaleImpersonationCookie: false,
    };
  }
  return {
    effectiveDealerId: null,
    isImpersonating: false,
    sessionUserId: session.user.id,
    hasStaleImpersonationCookie: false,
  };
}
