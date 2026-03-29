import { requireRole } from "@/lib/roles.server";
import { TeamClient } from "./TeamClient";

export default async function TeamPage() {
  // Admin-only page
  await requireRole(["admin"]);

  return <TeamClient />;
}
