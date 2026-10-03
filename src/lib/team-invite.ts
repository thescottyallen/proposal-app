import { explicitRole, type AppRole } from "./roles.ts";

export interface InvitationRequest {
  emailAddress: string;
  publicMetadata: { role: AppRole };
  redirectUrl: string;
}

export function buildTeamInvitation(
  input: { emailAddress?: unknown; role?: unknown },
  appUrl: string | undefined
): InvitationRequest | { error: string } {
  const emailAddress = typeof input.emailAddress === "string" ? input.emailAddress.trim() : "";
  const role = explicitRole({ role: input.role });
  if (!emailAddress || !role) {
    return { error: "emailAddress and a valid role (admin, member, viewer) are required" };
  }
  if (!appUrl?.trim()) {
    return { error: "NEXT_PUBLIC_APP_URL is not set" };
  }
  return {
    emailAddress,
    publicMetadata: { role },
    redirectUrl: `${appUrl.replace(/\/$/, "")}/sign-up`,
  };
}
