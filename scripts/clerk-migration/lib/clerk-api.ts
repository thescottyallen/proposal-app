import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import {
  exportedMetadata,
  planDemote,
  planRestore,
  roleFromExport,
  type AppRole,
  type RoleChange,
} from "./role-metadata.ts";

interface ClerkEmail {
  id: string;
  email_address: string;
}

interface ClerkUser {
  id: string;
  external_id: string | null;
  primary_email_address_id: string | null;
  email_addresses?: ClerkEmail[];
  created_at: number;
  public_metadata?: Record<string, unknown> | null;
}

interface ClerkSession {
  id: string;
  user_id: string;
  status: string;
}

interface ClerkInvitation {
  id: string;
  email_address: string;
  status: string;
}

function apiBase(): string {
  const raw = process.env.CLERK_API_BASE;
  if (!raw) return "https://api.clerk.com";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CLERK_API_BASE is not a URL");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "http:" || !loopback) {
    throw new Error("CLERK_API_BASE is only allowed for a loopback http endpoint");
  }
  return raw.replace(/\/$/, "");
}

function secret(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not set");
  return key;
}

function redact(message: string): string {
  const key = process.env.CLERK_SECRET_KEY ?? "";
  if (!key) return message;
  return message.split(key).join("[redacted]");
}

async function clerk(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    let detail = response.statusText;
    if (body && typeof body === "object" && "errors" in body) {
      const errors = (body as { errors?: { long_message?: string; message?: string }[] }).errors;
      if (errors?.length) detail = errors.map((error) => error.long_message ?? error.message ?? "").join("; ");
    }
    throw new Error(`Clerk API ${response.status}: ${redact(detail)}`);
  }
  return body;
}

function asList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: unknown[] }).data;
  }
  return [];
}

async function listAll<T>(path: string): Promise<T[]> {
  const collected: T[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const joiner = path.includes("?") ? "&" : "?";
    const page = asList(await clerk(`${path}${joiner}limit=${limit}&offset=${offset}`)) as T[];
    collected.push(...page);
    if (page.length < limit) break;
  }
  return collected;
}

function primaryEmail(user: ClerkUser): string {
  const match = user.email_addresses?.find((email) => email.id === user.primary_email_address_id);
  return match?.email_address ?? user.email_addresses?.[0]?.email_address ?? "";
}

function csvField(value: string | null): string {
  if (value === null) return "";
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells) => {
      const record: Record<string, string> = {};
      header.forEach((name, cellIndex) => {
        record[name] = cells[cellIndex] ?? "";
      });
      return record;
    });
}

function requireColumns(rows: Record<string, string>[], columns: string[]): void {
  if (rows.length === 0) return;
  for (const column of columns) {
    if (!(column in rows[0])) throw new Error(`export is missing the ${column} column`);
  }
}

function readExport(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0 && !text.includes("id")) throw new Error("export is empty");
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  for (const column of ["id", "primary_email_address", "public_metadata"]) {
    if (!header.split(",").includes(column)) throw new Error(`export is missing the ${column} column`);
  }
  requireColumns(rows, ["id", "primary_email_address", "public_metadata"]);
  return rows;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export function usersMissingExternalId(users: { id: string; external_id?: string | null }[]): string[] {
  return users.filter((user) => !user.external_id).map((user) => user.id);
}

export function activeSessionsPath(userId: string): string {
  return `/v1/sessions?status=active&user_id=${encodeURIComponent(userId)}`;
}

function summarize(path: string): void {
  const rows = readExport(path);
  const counts: Record<AppRole, number> = { admin: 0, member: 0, viewer: 0 };
  const missing: string[] = [];
  for (const row of rows) {
    const role = roleFromExport(exportedMetadata(row.public_metadata ?? ""));
    if (!role) missing.push(`${row.id} ${row.primary_email_address}`);
    else counts[role] += 1;
  }
  console.log(`users ${rows.length}`);
  console.log(`role admin ${counts.admin}`);
  console.log(`role member ${counts.member}`);
  console.log(`role viewer ${counts.viewer}`);
  for (const line of missing) console.log(`without role ${line}`);
}

function writeDevUsers(exportPath: string, dest: string): void {
  const rows = readExport(exportPath);
  const lines = ["id,email"];
  for (const row of rows) {
    if (!row.id || !row.primary_email_address) {
      throw new Error("export row is missing an id or primary email");
    }
    lines.push(`${csvField(row.id)},${csvField(row.primary_email_address)}`);
  }
  writeFileSync(dest, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`wrote ${rows.length} dev users`);
}

async function writeProdUsers(dest: string): Promise<void> {
  const users = await listAll<ClerkUser>("/v1/users");
  const lines = ["id,email,external_id,created_at"];
  for (const user of users) {
    const created = new Date(user.created_at).toISOString();
    lines.push(
      [
        csvField(user.id),
        csvField(primaryEmail(user)),
        csvField(user.external_id),
        csvField(created),
      ].join(",")
    );
  }
  writeFileSync(dest, `${lines.join("\n")}\n`, { mode: 0o600 });
  console.log(`wrote ${users.length} prod users`);
}

async function activeSessions(): Promise<ClerkSession[]> {
  const users = await listAll<ClerkUser>("/v1/users");
  const sessions: ClerkSession[] = [];
  for (const user of users) {
    const page = await listAll<ClerkSession>(activeSessionsPath(user.id));
    sessions.push(...page);
  }
  return sessions;
}

async function listSessions(): Promise<void> {
  const sessions = await activeSessions();
  console.log(`active sessions ${sessions.length}`);
  for (const session of sessions) console.log(`${session.id} ${session.user_id} ${session.status}`);
}

async function revokeSessions(): Promise<void> {
  const sessions = await activeSessions();
  for (const session of sessions) {
    await clerk(`/v1/sessions/${session.id}/revoke`, { method: "POST", body: "{}" });
    console.log(`revoked ${session.id}`);
  }
  console.log(`revoked ${sessions.length} sessions`);
}

async function describeInstance(requireExternalId: boolean): Promise<void> {
  const users = await listAll<ClerkUser>("/v1/users");
  console.log(`users ${users.length}`);
  for (const user of users.slice(0, 3)) {
    console.log(`email ${maskEmail(primaryEmail(user))}`);
  }
  const missing = usersMissingExternalId(users);
  if (missing.length > 0) {
    console.log(`without externalId ${missing.join(" ")}`);
    if (requireExternalId) {
      throw new Error(`prod users without externalId: ${missing.join(", ")}`);
    }
  }
}

function printUsers(users: ClerkUser[], label: string): void {
  console.log(`${label} ${users.length}`);
  for (const user of users) {
    const role = roleFromExport(user.public_metadata ?? {});
    console.log(`${user.id} ${primaryEmail(user)} external_id=${user.external_id ?? ""} role=${role ?? ""}`);
  }
}

async function listUnmapped(): Promise<void> {
  const users = await listAll<ClerkUser>("/v1/users");
  printUsers(users.filter((user) => !user.external_id), "prod users without externalId");
}

async function listInvitations(): Promise<void> {
  const invitations = await listAll<ClerkInvitation>("/v1/invitations?status=pending");
  console.log(`pending invitations ${invitations.length}`);
  for (const invitation of invitations) console.log(`${invitation.id} ${invitation.email_address} ${invitation.status}`);
}

async function revokeInvitations(): Promise<void> {
  const invitations = await listAll<ClerkInvitation>("/v1/invitations?status=pending");
  for (const invitation of invitations) {
    await clerk(`/v1/invitations/${invitation.id}/revoke`, { method: "POST", body: "{}" });
    console.log(`revoked invitation ${invitation.id}`);
  }
  console.log(`revoked ${invitations.length} invitations`);
}

async function applyChanges(changes: RoleChange[]): Promise<void> {
  for (const change of changes) {
    await clerk(`/v1/users/${change.userId}/metadata`, {
      method: "PATCH",
      body: JSON.stringify(change.body),
    });
    console.log(`updated ${change.userId} role=${change.body.public_metadata.role ?? ""}`);
  }
  console.log(`updated ${changes.length} users`);
}

async function demote(keep: string, apply: boolean): Promise<void> {
  const users = await listAll<ClerkUser>("/v1/users");
  const admins = users.filter((user) => roleFromExport(user.public_metadata ?? {}) === "admin");
  printUsers(admins, "dev admins");
  if (!admins.some((user) => user.id === keep)) {
    throw new Error("--keep is not a current dev admin");
  }
  const changes = planDemote(admins.map((user) => user.id), keep);
  for (const change of changes) console.log(`would set ${change.userId} role=member`);
  console.log(`kept ${keep}`);
  if (apply) await applyChanges(changes);
}

async function restore(exportPath: string, apply: boolean): Promise<void> {
  const rows = readExport(exportPath);
  const users = await listAll<ClerkUser>("/v1/users");
  const plan = planRestore(
    users.map((user) => user.id),
    rows.map((row) => ({ id: row.id, publicMetadata: exportedMetadata(row.public_metadata ?? "") }))
  );
  for (const userId of plan.missingFromExport) console.log(`missing from export ${userId}`);
  for (const change of plan.changes) {
    const role = change.body.public_metadata.role;
    console.log(`${apply ? "set" : "would set"} ${change.userId} role=${role ?? "(remove)"}`);
  }
  if (apply) await applyChanges(plan.changes);
}

async function main(): Promise<void> {
  const [command, arg, extra] = process.argv.slice(2);
  switch (command) {
    case "summarize-export":
      summarize(arg);
      break;
    case "write-dev-users":
      writeDevUsers(arg, extra);
      break;
    case "write-prod-users":
      await writeProdUsers(arg);
      break;
    case "list-sessions":
      await listSessions();
      break;
    case "revoke-sessions":
      await revokeSessions();
      break;
    case "list-unmapped-users":
      await listUnmapped();
      break;
    case "list-pending-invitations":
      await listInvitations();
      break;
    case "revoke-pending-invitations":
      await revokeInvitations();
      break;
    case "demote-plan":
      await demote(arg, false);
      break;
    case "demote-apply":
      await demote(arg, true);
      break;
    case "restore-plan":
      await restore(arg, false);
      break;
    case "restore-apply":
      await restore(arg, true);
      break;
    case "describe-instance":
      await describeInstance(arg === "--require-external-id");
      break;
    default:
      throw new Error("unknown clerk api command");
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "clerk api failed";
    console.error(redact(message));
    process.exit(1);
  });
}
