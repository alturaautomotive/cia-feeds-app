import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createAdminAllowlistEntry(data: {
  email: string;
  role?: string;
  isActive?: boolean;
}) {
  return prisma.adminAllowlist.create({
    data: {
      ...data,
      email: normalizeEmail(data.email),
    },
  });
}

export async function updateAdminAllowlistEntry(
  id: string,
  data: { email?: string; role?: string; isActive?: boolean }
) {
  const update: Record<string, unknown> = { ...data };
  if (data.email !== undefined) {
    update.email = normalizeEmail(data.email);
  }
  return prisma.adminAllowlist.update({
    where: { id },
    data: update,
  });
}
