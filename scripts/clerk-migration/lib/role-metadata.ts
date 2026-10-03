// Role updates sent to Clerk's metadata endpoint.
// The body contains only the role key so Clerk's deep merge leaves every other key alone.
// A null role removes that key.

export const APP_ROLES = ["admin", "member", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export interface RoleMetadataBody {
  public_metadata: { role: AppRole | null };
}

export function roleOnlyPatch(role: AppRole | null): RoleMetadataBody {
  return { public_metadata: { role } };
}

/** Parsed public_metadata from the export. Invalid JSON stops a restore instead of clearing the role. */
export function exportedMetadata(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error("export public_metadata could not be read");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("export public_metadata could not be read");
  }
  return parsed;
}

export function roleFromExport(metadata: unknown): AppRole | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const role = (metadata as { role?: unknown }).role;
  if (role === "admin" || role === "member" || role === "viewer") return role;
  return null;
}

export interface RoleChange {
  userId: string;
  body: RoleMetadataBody;
}

export interface RestorePlan {
  changes: RoleChange[];
  missingFromExport: string[];
}

export function planRestore(
  currentUserIds: string[],
  exported: { id: string; publicMetadata: unknown }[]
): RestorePlan {
  const byId = new Map(exported.map((user) => [user.id, user]));
  const changes: RoleChange[] = [];
  const missingFromExport: string[] = [];
  for (const userId of currentUserIds) {
    const row = byId.get(userId);
    if (!row) {
      missingFromExport.push(userId);
      continue;
    }
    changes.push({ userId, body: roleOnlyPatch(roleFromExport(row.publicMetadata)) });
  }
  return { changes, missingFromExport };
}

export function planDemote(adminIds: string[], keep: string): RoleChange[] {
  return adminIds
    .filter((userId) => userId !== keep)
    .map((userId) => ({ userId, body: roleOnlyPatch("member") }));
}
