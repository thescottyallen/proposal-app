// Server-only role helpers. Do NOT import this file from client components.
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { roleFromMetadata, type AppRole } from "@/lib/roles";

/** Get the current signed-in user's role. Must be called from a Server Component or Route Handler. */
export async function getCurrentUserRole(): Promise<AppRole> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return roleFromMetadata(user.publicMetadata as Record<string, unknown>);
}

/** Redirect to /proposals if the user doesn't have the required role. */
export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentUserRole();
  if (!allowed.includes(role)) redirect("/proposals");
  return role;
}
