import { prisma } from "@/lib/prisma";
import type { PrismaClient, Prisma } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface AuditEntry {
  action: string;
  actorEmail: string;
  actorRole: string;
  actorDealerId?: string | null;
  targetDealerId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

const REDACTED_FIELDS = new Set([
  "passwordHash",
  "metaAccessToken",
  "stripeCustomerId",
  "stripeSubscriptionId",
]);

function sanitize(obj: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!obj) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    cleaned[k] = REDACTED_FIELDS.has(k) ? "[REDACTED]" : v;
  }
  return cleaned as Prisma.InputJsonValue;
}

/** Write an immutable audit log entry, optionally within a transaction. */
export async function writeAuditLog(entry: AuditEntry, tx?: TxClient): Promise<void> {
  const client = tx ?? prisma;
  await client.adminAuditLog.create({
    data: {
      action: entry.action,
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole,
      actorDealerId: entry.actorDealerId ?? null,
      targetDealerId: entry.targetDealerId ?? null,
      beforeState: sanitize(entry.beforeState) ?? undefined,
      afterState: sanitize(entry.afterState) ?? undefined,
      metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
