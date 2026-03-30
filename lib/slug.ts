import { PrismaClient } from "@prisma/client";

function toBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateUniqueSlug(
  name: string,
  prisma: PrismaClient
): Promise<string> {
  const base = toBaseSlug(name);

  if (!base) {
    throw new Error("invalid_name: cannot generate a valid slug from the provided name");
  }

  const existing = await prisma.dealer.findMany({
    where: {
      slug: {
        startsWith: base,
      },
    },
    select: { slug: true },
  });

  const existingSlugs = new Set(existing.map((d) => d.slug));

  if (!existingSlugs.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingSlugs.has(`${base}-${counter}`)) {
    counter++;
  }

  return `${base}-${counter}`;
}
