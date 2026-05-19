import { NextAuthOptions } from "next-auth";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { hashPassword, BCRYPT_COST } from "@/lib/password";

/**
 * Lazy bcrypt cost-factor upgrade (SECURITY_AUDIT.md follow-up).
 *
 * Legacy hashes were created with cost-10 (the previous OWASP minimum).
 * On every successful login, peek at the existing hash's cost. If it's
 * below BCRYPT_COST (currently 12), re-hash and overwrite. The user pays
 * a one-time ~400ms cost on the upgrade login, then is fast forever after.
 *
 * Bcrypt hash format: `$2<a|b>$<cost>$<salt+digest>`, e.g. `$2a$10$...`.
 * We parse the cost field; if it's malformed for any reason we leave the
 * hash alone (fail safe).
 */
function shouldRehash(hash: string): boolean {
  const match = hash.match(/^\$2[aby]?\$(\d{2})\$/);
  if (!match) return false;
  const cost = parseInt(match[1], 10);
  return Number.isFinite(cost) && cost < BCRYPT_COST;
}

/**
 * Brute-force protection for credentials login.
 *
 * Two layered buckets (both fail closed via criticalDurableRateLimit):
 *  - per-(IP, email): 5 attempts / 5 minutes — stops targeted attacks on one
 *    victim from a single IP.
 *  - per-IP: 30 attempts / 5 minutes — stops credential stuffing across many
 *    accounts from one IP.
 *
 * NextAuth's CredentialsProvider doesn't expose the request to `authorize()`
 * as a typed parameter, but the second argument is the raw Request object.
 * We extract the X-Forwarded-For IP from there.
 *
 * Refs: SECURITY_AUDIT.md F-7.3.
 */
async function enforceLoginRateLimit(
  email: string,
  req: { headers?: Record<string, string | string[] | undefined> } | undefined
): Promise<{ allowed: boolean; reason?: string }> {
  const xff = req?.headers?.["x-forwarded-for"];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  const ip = (xffStr ?? "unknown").split(",")[0].trim();
  const emailLower = email.toLowerCase();

  const perPair = await criticalDurableRateLimit(
    `login:${ip}:${emailLower}`,
    5,
    5 * 60_000
  );
  if (!perPair.allowed) return { allowed: false, reason: "per_pair" };

  const perIp = await criticalDurableRateLimit(
    `login_ip:${ip}`,
    30,
    5 * 60_000
  );
  if (!perIp.allowed) return { allowed: false, reason: "per_ip" };

  return { allowed: true };
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.NEXTAUTH_SECRET) {
    console.error(
      "[auth] NEXTAUTH_SECRET is not set. Sessions will fail. " +
        "Set it in your Vercel Environment Variables."
    );
  }
  if (!process.env.NEXTAUTH_URL) {
    console.error(
      "[auth] NEXTAUTH_URL is not set in production. " +
        "Set it to your deployed domain (e.g. https://yourapp.vercel.app) " +
        "in Vercel Environment Variables."
    );
  } else if (process.env.NEXTAUTH_URL.includes("localhost")) {
    console.error(
      "[auth] NEXTAUTH_URL is set to a localhost address in production. " +
        "This will cause session cookies to use the wrong domain, " +
        "resulting in redirect loops after login. " +
        "Update it in Vercel Environment Variables to your deployed domain."
    );
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const emailLower = credentials.email.trim().toLowerCase();

        // Brute-force protection — fail closed on DB errors.
        const rl = await enforceLoginRateLimit(emailLower, req as unknown as { headers?: Record<string, string | string[] | undefined> });
        if (!rl.allowed) {
          console.warn({
            event: "login_rate_limited",
            reason: rl.reason,
            email_hash: Buffer.from(emailLower).toString("base64").slice(0, 12),
          });
          return null;
        }

        // 1. TeamUser-first path: team members with their own password
        //    Fetch all matching rows — the same email can be invited to multiple dealers.
        const teamUsers = await prisma.teamUser.findMany({
          where: {
            email: { equals: emailLower, mode: "insensitive" },
            passwordHash: { not: null },
            acceptedAt: { not: null },
          },
          include: {
            dealer: {
              include: { subAccounts: { orderBy: { createdAt: "asc" }, take: 1 } },
            },
          },
        });

        for (const teamUser of teamUsers) {
          const match = await bcrypt.compare(credentials.password, teamUser.passwordHash!);
          if (!match) continue;
          if (!teamUser.dealer.active) continue;
          // F-8.3: soft-deleted accounts can't log in.
          if (teamUser.dealer.deletedAt) continue;

          // Lazy bcrypt upgrade.
          if (shouldRehash(teamUser.passwordHash!)) {
            try {
              const newHash = await hashPassword(credentials.password);
              await prisma.teamUser.update({
                where: { id: teamUser.id },
                data: { passwordHash: newHash },
              });
            } catch (err) {
              console.warn({
                event: "bcrypt_upgrade_failed",
                userType: "teamuser",
                id: teamUser.id,
                message: err instanceof Error ? err.message : String(err),
              });
            }
          }

          return {
            id: teamUser.dealer.id,
            // userType: explicit discriminator for downstream defense-in-depth
            // (SECURITY_AUDIT.md F-1.2). All session.user.id values must come
            // from one of the two issuance paths in this file.
            userType: "teamuser" as const,
            name: teamUser.name ?? teamUser.dealer.name,
            email: teamUser.dealer.email,
            slug: teamUser.dealer.slug,
            vertical: teamUser.dealer.vertical,
            subAccountId:
              teamUser.subAccountId ??
              (teamUser.dealer as unknown as { defaultSubAccountId?: string }).defaultSubAccountId ??
              teamUser.dealer.subAccounts[0]?.id ??
              null,
            teamUser: {
              id: teamUser.id,
              role: teamUser.role as "admin" | "editor",
              subAccountId: teamUser.subAccountId ?? undefined,
            },
          };
        }

        // 2. Dealer fallback: direct dealer login
        //    Use case-insensitive lookup to preserve compatibility with mixed-case stored emails.
        const dealer = await prisma.dealer.findFirst({
          where: { email: { equals: credentials.email.trim(), mode: "insensitive" } },
          include: { subAccounts: { orderBy: { createdAt: "asc" }, take: 1 } },
        });

        if (!dealer) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          dealer.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        if (!dealer.active) {
          return null;
        }
        // F-8.3: soft-deleted accounts can't log in.
        if (dealer.deletedAt) {
          return null;
        }

        // Lazy bcrypt upgrade.
        if (shouldRehash(dealer.passwordHash)) {
          try {
            const newHash = await hashPassword(credentials.password);
            await prisma.dealer.update({
              where: { id: dealer.id },
              data: { passwordHash: newHash },
            });
          } catch (err) {
            console.warn({
              event: "bcrypt_upgrade_failed",
              userType: "dealer",
              id: dealer.id,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Check if this dealer also happens to be a team user of themselves
        const dealerTeamUser = await prisma.teamUser.findFirst({
          where: {
            email: { equals: emailLower, mode: "insensitive" },
            dealerId: dealer.id,
            acceptedAt: { not: null },
          },
          select: { id: true, role: true, subAccountId: true },
        });

        return {
          id: dealer.id,
          // userType: explicit discriminator (SECURITY_AUDIT.md F-1.2).
          userType: "dealer" as const,
          name: dealer.name,
          email: dealer.email,
          slug: dealer.slug,
          vertical: dealer.vertical,
          subAccountId: dealer.defaultSubAccountId ?? dealer.subAccounts[0]?.id ?? null,
          teamUser: dealerTeamUser
            ? { id: dealerTeamUser.id, role: dealerTeamUser.role as "admin" | "editor", subAccountId: dealerTeamUser.subAccountId ?? undefined }
            : undefined,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.slug = (user as { slug: string; vertical: string; subAccountId: string | null }).slug;
        token.vertical = (user as { slug: string; vertical: string; subAccountId: string | null }).vertical;
        token.subAccountId = (user as { subAccountId: string | null }).subAccountId ?? null;
        token.teamUser = (user as { teamUser?: { id: string; role: "admin" | "editor"; subAccountId?: string } }).teamUser;
        // userType claim (SECURITY_AUDIT.md F-1.2): immutable for the life
        // of the JWT; downstream code can sanity-check session.user.id is a
        // Dealer/TeamUser ID and not a foreign identity type.
        token.userType = (user as { userType?: "dealer" | "teamuser" }).userType ?? "dealer";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.slug = token.slug as string;
        session.user.vertical = token.vertical as string;
        session.user.subAccountId = (token.subAccountId as string) ?? null;
        session.user.teamUser = token.teamUser;
        session.user.userType = (token.userType as "dealer" | "teamuser") ?? "dealer";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

const ADMIN_EMAIL_LEGACY = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

export type AdminCapability =
  | "manage_delivery"
  | "trigger_rescrape"
  | "view_audit"
  // manage_accounts gates the destructive admin actions: suspend / restore /
  // hard-delete dealers, remove team members, and prune newsletter
  // subscribers. Intentionally super_admin-only so a regular admin can't
  // accidentally hard-delete a tenant.
  | "manage_accounts";

const ROLE_CAPABILITIES: Record<string, AdminCapability[]> = {
  super_admin: ["manage_delivery", "trigger_rescrape", "view_audit", "manage_accounts"],
  admin: ["manage_delivery", "trigger_rescrape", "view_audit"],
  viewer: ["view_audit"],
};

export interface AdminGuardResult {
  ok: boolean;
  email: string;
  role: string;
  response?: NextResponse;
}

/**
 * Shared admin capability guard — allowlist/capability-authoritative.
 *
 * Authorization precedence:
 * 1. AdminAllowlist DB entry with isActive=true and matching role capability.
 * 2. Legacy ADMIN_EMAIL env fallback ONLY when the allowlist DB lookup itself
 *    throws (e.g. DB unreachable). This ensures privileged access is governed
 *    by the durable allowlist under normal operation, and the env fallback
 *    exists only as a break-glass recovery path.
 *
 * Returns { ok: true, email, role } or { ok: false, response: 403 }.
 */
export async function adminGuard(
  requiredCapability: AdminCapability
): Promise<AdminGuardResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return { ok: false, email: "", role: "", response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  // Check AdminAllowlist (authoritative source for privilege decisions)
  let allowlistLookupSucceeded = false;
  try {
    const entry = await prisma.adminAllowlist.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    allowlistLookupSucceeded = true;

    if (entry && entry.isActive) {
      const capabilities = ROLE_CAPABILITIES[entry.role] ?? [];
      if (capabilities.includes(requiredCapability)) {
        return { ok: true, email, role: entry.role };
      }
      return { ok: false, email, role: entry.role, response: NextResponse.json({ error: "forbidden", detail: "insufficient_role" }, { status: 403 }) };
    }

    // Entry not found or inactive — if allowlist lookup succeeded, do NOT
    // fall through to legacy env. The allowlist is authoritative.
  } catch (err) {
    console.error("[adminGuard] allowlist lookup failed, trying legacy fallback:", err);
  }

  // Legacy fallback: ONLY used when the DB allowlist lookup itself failed.
  // This is a break-glass path for when the database is unreachable.
  if (!allowlistLookupSucceeded && ADMIN_EMAIL_LEGACY && email === ADMIN_EMAIL_LEGACY) {
    const legacyCaps = ROLE_CAPABILITIES["super_admin"] ?? [];
    if (legacyCaps.includes(requiredCapability)) {
      return { ok: true, email, role: "super_admin" };
    }
  }

  return { ok: false, email, role: "", response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
}
