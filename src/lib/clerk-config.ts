export type ProcessEnv = Record<string, string | undefined>;

export function readAuthorizedParties(env: ProcessEnv = process.env): string[] {
  return (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((party) => party.trim())
    .filter((party) => party.length > 0);
}

export function assertProductionConfig(env: ProcessEnv = process.env): void {
  if (env.VERCEL_ENV !== "production") return;
  if (readAuthorizedParties(env).length === 0) {
    throw new Error(
      "CLERK_AUTHORIZED_PARTIES is required when VERCEL_ENV is production"
    );
  }
}

/** Preview deploys stay on the Clerk development instance and a separate database. */
export function assertPreviewConfig(env: ProcessEnv = process.env): void {
  if (env.VERCEL_ENV !== "preview") return;
  const publishable = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const secret = env.CLERK_SECRET_KEY ?? "";
  if (!publishable.startsWith("pk_test_") || !secret.startsWith("sk_test_")) {
    throw new Error("Preview must use Clerk development keys");
  }
  const database = env.DATABASE_URL ?? "";
  const productionDatabase = env.PRODUCTION_DATABASE_URL ?? "";
  if (!database || (productionDatabase !== "" && database === productionDatabase)) {
    throw new Error("Preview must use a non-production database");
  }
}

export function assertDeploymentConfig(env: ProcessEnv = process.env): void {
  assertProductionConfig(env);
  assertPreviewConfig(env);
}

export function clerkMiddlewareOptions(
  env: ProcessEnv = process.env
): { authorizedParties?: string[] } {
  const authorizedParties = readAuthorizedParties(env);
  if (authorizedParties.length === 0) return {};
  return { authorizedParties };
}
