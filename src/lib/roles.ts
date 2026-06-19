// Pure role helpers — safe to import from both server and client components.
// Server-only helpers (getCurrentUserRole, requireRole) live in roles.server.ts

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

/** Read the role from a Clerk user's publicMetadata. Defaults to "member". */
export function roleFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): AppRole {
  const role = metadata?.role;
  if (role === "admin" || role === "member" || role === "viewer") return role;
  return "member";
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

/** Admins may view and edit every proposal; everyone else is limited to their own. */
export function canAccessAllProposals(role: AppRole): boolean {
  return role === "admin";
}

/**
 * Prisma `where` fragment that scopes a proposal query to what the given user
 * may access. Admins get an empty fragment (all proposals); everyone else is
 * restricted to proposals they authored.
 */
export function proposalAccessWhere(
  role: AppRole,
  userId: string
): { createdBy?: string } {
  return canAccessAllProposals(role) ? {} : { createdBy: userId };
}
