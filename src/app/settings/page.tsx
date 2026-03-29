import { requireRole } from "@/lib/roles.server";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole(["admin"]);
  return <SettingsClient />;
}
