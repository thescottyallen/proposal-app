// Server-only role helpers. Do NOT import this file from client components.
import { auth } from "@clerk/nextjs/server";
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

/** Redirect to /proposals if the user doesn't have the required role. */
export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentUserRole();
  if (!allowed.includes(role)) redirect("/proposals");
  return role;
}
