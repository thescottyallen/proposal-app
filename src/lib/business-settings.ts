import { prisma } from "@/lib/prisma";

/** Read this user's settings, creating the default row only the first time. */
export async function getOrCreateBusinessSettings(userId: string) {
  const existing = await prisma.businessSettings.findUnique({ where: { userId } });
  if (existing) return existing;

  try {
    return await prisma.businessSettings.create({ data: { userId } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const again = await prisma.businessSettings.findUnique({ where: { userId } });
      if (again) return again;
    }
    throw err;
  }
}
