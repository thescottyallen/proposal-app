import { requireRole } from "@/lib/roles.server";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  // Admin-only page
  await requireRole(["admin"]);

  return <TeamClient />;
}
