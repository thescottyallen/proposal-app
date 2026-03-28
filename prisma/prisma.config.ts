import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local since Next.js env files aren't auto-loaded by Prisma
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
