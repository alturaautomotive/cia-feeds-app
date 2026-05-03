// Test setup - mock Prisma globally
import { vi } from "vitest";

// Build mock object so $transaction can pass itself as the tx client
const mockPrisma: Record<string, unknown> = {
  dealer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subAccount: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  vehicle: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  listing: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  metaCatalogSyncItem: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  passwordResetToken: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  adminAllowlist: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  adminAuditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  rateLimitBucket: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  teamUser: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  teamInvite: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  metaDeliveryJob: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  stripeWebhookEvent: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

// Polymorphic $transaction: supports both function and array call shapes
mockPrisma.$transaction = vi.fn((arg: unknown) => {
  if (typeof arg === "function") {
    return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
  }
  if (Array.isArray(arg)) {
    return Promise.all(arg);
  }
  return Promise.resolve(arg);
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));
