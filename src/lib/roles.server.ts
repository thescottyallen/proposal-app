// Server-only role helpers. Do NOT import this file from client components.
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { roleFromMetadata, type AppRole } from "@/lib/roles";

/** Get the current signed-in user's role from JWT session claims.
 *  Clerk includes publicMetadata in the JWT under the 'metadata' key. */
export async function getCurrentUserRole(): Promise<AppRole> {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");
  // Clerk embeds publicMetadata in JWT claims as { metadata: { role: ... } }
  const metadata = (sessionClaims as Record<string, unknown>)?.metadata as
    | Record<string, unknown>
    | undefined;
  return roleFromMetadata(metadata);
}

/**
 * Resolve the current user's id and role for use inside API route handlers.
 * Unlike getCurrentUserRole(), this never redirects — it returns null when the
 * request is unauthenticated so the caller can respond with a 401.
 */
export async function getAuthContext(): Promise<
  { userId: string; role: AppRole } | null
> {
  const { userId } = await auth();
  if (!userId) return null;
  // Read the role from Clerk publicMetadata (authoritative), matching the rest
  // of the server-side role checks (team routes, admin setup). This avoids
  // relying on a custom JWT "metadata" claim that this project does not set up.
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
