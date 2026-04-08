import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
 * Resolves the effective dealer ID for dashboard-facing API routes.
 * If an impersonation cookie is present and the caller is an admin,
 * returns the impersonated dealer ID. Otherwise returns the session user ID.
 * Returns null if the user is not authenticated.
 */
export async function getEffectiveDealerId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const cookieStore = await cookies();
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE);

  if (
    impersonationCookie?.value &&
    session.user.email &&
    session.user.email.toLowerCase() === ADMIN_EMAIL
  ) {
    const dealerId = await verifyImpersonationToken(impersonationCookie.value);
    if (dealerId) return dealerId;
  }

  return session.user.id;
}
