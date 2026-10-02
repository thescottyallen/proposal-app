import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Serverless isolates must share one pool. On Vercel, DATABASE_URL should be
  // the Supabase transaction pooler (port 6543, pgbouncer). Use the direct
  // 5432 URL only for `npx prisma migrate deploy`. Prepared statements stay
  // off (PrismaPg's default) so transaction-mode pooling works.
  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      max: process.env.NODE_ENV === "production" ? 1 : 5,
      idleTimeoutMillis: 10_000,
    });
  globalForPrisma.pgPool = pool;

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
