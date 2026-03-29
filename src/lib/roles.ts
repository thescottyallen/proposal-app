import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type AppRole = "admin" | "member" | "viewer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin:  "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin:  "Full access including settings, team management, and deleting proposals",
  member: "Can create, edit, and send proposals. Cannot access settings or delete proposals",
  viewer: "Read-only access to proposals. Cannot edit or see internal margins",
};

// ─── Server helpers ───────────────────────────────────────────────────────────

/** Read the role from a Clerk user's publicMetadata. Defaults to "member". */
export function roleFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): AppRole {
  const role = metadata?.role;
  if (role === "admin" || role === "member" || role === "viewer") return role;
  return "member";
}

/** Get the current signed-in user's role. Must be called from a Server Component or Route Handler. */
export async function getCurrentUserRole(): Promise<AppRole> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return roleFromMetadata(user.publicMetadata as Record<string, unknown>);
}

// ─── Permission checks ────────────────────────────────────────────────────────

export function canManageSettings(role: AppRole): boolean {
  return role === "admin";
}

export function canManageTeam(role: AppRole): boolean {
  return role === "admin";
}

export function canDeleteProposal(role: AppRole): boolean {
  return role === "admin";
}

export function canEditProposal(role: AppRole): boolean {
  return role === "admin" || role === "member";
}

export function canSeeMargin(role: AppRole): boolean {
  return role === "admin" || role === "member";
}

/** Redirect to /proposals if the user doesn't have the required role. */
export async function requireRole(allowed: AppRole[]): Promise<AppRole> {
  const role = await getCurrentUserRole();
  if (!allowed.includes(role)) redirect("/proposals");
  return role;
}
