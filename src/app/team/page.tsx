import { requireRole } from "@/lib/roles";
import { TeamClient } from "./TeamClient";

export default async function TeamPage() {
  // Admin-only page
  await requireRole(["admin"]);

  return <TeamClient />;
}
