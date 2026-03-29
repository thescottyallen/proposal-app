import { requireRole } from "@/lib/roles.server";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  await requireRole(["admin"]);
  return <SettingsClient />;
}
