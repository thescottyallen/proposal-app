// Server-only role helpers. Do NOT import this file from client components.
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { explicitRole, roleFromMetadata, type AppRole } from "@/lib/roles";

function roleFromSessionClaims(
  sessionClaims: Record<string, unknown> | null | undefined
): AppRole | null {
  if (!sessionClaims) return null;
  // Only an explicit admin/member/viewer skips the Clerk user fetch. A missing
  // claim must not default to member, or an admin whose token has no metadata
  // would be locked out of other people's proposals.
  const metadata = sessionClaims.metadata;
  const publicMetadata = sessionClaims.publicMetadata;
  return (
    explicitRole(
      metadata && typeof metadata === "object"
        ? (metadata as Record<string, unknown>)
        : undefined
    ) ??
    explicitRole(
      publicMetadata && typeof publicMetadata === "object"
        ? (publicMetadata as Record<string, unknown>)
        : undefined
    )
  );
}

/** Get the current signed-in user's role from JWT session claims when present. */
export async function getCurrentUserRole(): Promise<AppRole> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in");
  return ctx.role;
}

/**
 * Resolve the current user's id and role for use inside API route handlers.
 * Unlike getCurrentUserRole(), this never redirects — it returns null when the
 * request is unauthenticated so the caller can respond with a 401.
 *
 * Clerk Dashboard → Sessions → Customize session token:
 *   { "metadata": "{{user.public_metadata}}" }
 * Until that claim is present, this still calls Clerk once per request.
 */
export async function getAuthContext(): Promise<
  { userId: string; role: AppRole } | null
> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const fromClaims = roleFromSessionClaims(
    sessionClaims as Record<string, unknown> | null
  );
  if (fromClaims) return { userId, role: fromClaims };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = roleFromMetadata(user.publicMetadata as Record<string, unknown>);
  return { userId, role };
}

/** Redirect to /proposals if the user doesn't have the required role. */
export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentUserRole();
  if (!allowed.includes(role)) redirect("/proposals");
  return role;
}
