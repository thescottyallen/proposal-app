import { requireRole } from "@/lib/roles";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  await requireRole(["admin"]);
  return <SettingsClient />;
}
