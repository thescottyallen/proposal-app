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

export function databaseHost(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Preview DATABASE_URL is not a valid connection URL");
  }
  if (!url.hostname) {
    throw new Error("Preview DATABASE_URL is not a valid connection URL");
  }
  return url.hostname.toLowerCase();
}

/** True when the preview database host is the production host or contains its project ref. */
export function previewPointsAtProduction(databaseUrl: string, productionHost: string): boolean {
  const host = databaseHost(databaseUrl);
  const marker = productionHost.trim().toLowerCase();
  if (!marker) return false;
  if (host === marker) return true;
  if (marker.includes(".")) return false;
  return host.startsWith(`${marker}.`) || host.includes(`.${marker}.`);
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
  const productionHost = env.PRODUCTION_DB_HOST ?? "";
  if (!database || !productionHost) {
    throw new Error("Preview must use a non-production database");
  }
  if (previewPointsAtProduction(database, productionHost)) {
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
