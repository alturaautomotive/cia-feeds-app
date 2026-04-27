// Test setup - mock Prisma globally
import { vi } from "vitest";

// Build mock object so $transaction can pass itself as the tx client
const mockPrisma: Record<string, unknown> = {
  dealer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subAccount: {
    create: vi.fn(),
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
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  adminAuditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  rateLimitBucket: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
};
mockPrisma.$transaction = vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));
