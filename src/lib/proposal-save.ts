// Decisions for saving a proposal: conflict checks, revision snapshots, and
// the browser backup. The route handler and the editor both use these so the
// rules can be tested without a database.

import { isProposalDocument } from "./proposal-document";

export interface RevisionSource {
  title: string;
  content: unknown;
  clientName: string;
  clientEmail: string;
  clientAbn?: string | null;
  internalNotes?: string | null;
  expiresAt?: Date | string | null;
  totalValue?: number | null;
  updatedAt: Date | string;
  status: string;
}

/** Previous proposal content, stored before a content write replaces it. */
export interface RevisionSnapshot {
  title: string;
  content: unknown;
  clientName: string;
  clientEmail: string;
  clientAbn: string | null;
  internalNotes: string | null;
  expiresAt: string | null;
  totalValue: number | null;
  updatedAt: string;
  status: string;
}

export interface PatchInput {
  serverUpdatedAt: Date | string;
  /** updatedAt the editor loaded. Omitted for status-only updates. */
  baseUpdatedAt?: string | null;
  /** Save mine anyway: keep the other version as a revision, then overwrite. */
  force?: boolean;
  /** True when this request writes proposal content (including a draft). */
  writesContent: boolean;
}

export type PatchDecision =
  | {
      ok: false;
      status: 409;
      body: {
        error: string;
        code: "conflict";
        updatedAt: string;
      };
    }
  | {
      ok: true;
      writeRevision: boolean;
    };

export interface ContentSummary {
  pageCount: number;
  blockCount: number;
  summary: string;
}

export interface EditorBackup {
  savedAt: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAbn: string;
  internalNotes: string;
  expiresAt: string;
  content: unknown;
}

export interface ServerEditorState {
  updatedAt: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAbn: string;
  internalNotes: string;
  expiresAt: string;
  content: unknown;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toMillis(value: Date | string | null | undefined): number | null {
  const iso = toIso(value);
  if (!iso) return null;
  return new Date(iso).getTime();
}

export function formatClockTime(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const hours24 = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours = hours24 % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

export function conflictMessage(updatedAt: Date | string): string {
  return `This proposal was changed in another tab or by someone else at ${formatClockTime(updatedAt)}. Reload to see their version, or save yours over it.`;
}

export function unsavedRestoreLabel(savedAt: Date | string): string {
  return `Restore unsaved changes from ${formatClockTime(savedAt)}`;
}

export function savedStatusLabel(savedAt: Date | string): string {
  return `Saved at ${formatClockTime(savedAt)}`;
}

/**
 * Decide whether a PATCH may write, and whether the previous content must be
 * stored first. A content write always keeps a revision, including drafts.
 * Status-only updates (lost, reopen) do not.
 */
export function evaluateProposalPatch(input: PatchInput): PatchDecision {
  const serverUpdatedAt = toIso(input.serverUpdatedAt) ?? new Date(0).toISOString();

  if (input.writesContent && !input.force) {
    const base = input.baseUpdatedAt;
    if (base) {
      const baseMs = toMillis(base);
      const serverMs = toMillis(serverUpdatedAt);
      const stale = baseMs == null || (serverMs != null && serverMs > baseMs);
      if (stale) {
        return {
          ok: false,
          status: 409,
          body: {
            error: "This proposal was changed in another tab or by someone else.",
            code: "conflict",
            updatedAt: serverUpdatedAt,
          },
        };
      }
    }
  }

  return {
    ok: true,
    writeRevision: input.writesContent,
  };
}

export function nextRevisionVersion(lastVersion: number | null | undefined): number {
  return (lastVersion ?? 0) + 1;
}

export function buildRevisionSnapshot(existing: RevisionSource): RevisionSnapshot {
  return {
    title: existing.title,
    content: existing.content,
    clientName: existing.clientName,
    clientEmail: existing.clientEmail,
    clientAbn: existing.clientAbn ?? null,
    internalNotes: existing.internalNotes ?? null,
    expiresAt: toIso(existing.expiresAt),
    totalValue: existing.totalValue ?? null,
    updatedAt: toIso(existing.updatedAt) ?? new Date(0).toISOString(),
    status: existing.status,
  };
}

export function contentFromSnapshot(snapshot: unknown): unknown {
  if (snapshot && typeof snapshot === "object" && "content" in snapshot) {
    return (snapshot as { content: unknown }).content;
  }
  return null;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function summarizeProposalContent(content: unknown): ContentSummary {
  if (!isProposalDocument(content)) {
    return { pageCount: 0, blockCount: 0, summary: "Older content" };
  }
  const pageCount = content.pages.length;
  const blockCount = content.pages.reduce((total, page) => total + page.blocks.length, 0);
  return {
    pageCount,
    blockCount,
    summary: `${countLabel(pageCount, "page", "pages")}, ${countLabel(blockCount, "block", "blocks")}`,
  };
}

export function backupStorageKey(proposalId: string): string {
  return `proposal-backup:${proposalId}`;
}

export function readLocalBackup(
  storage: Pick<Storage, "getItem">,
  proposalId: string
): EditorBackup | null {
  try {
    const raw = storage.getItem(backupStorageKey(proposalId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorBackup>;
    if (!parsed || typeof parsed.savedAt !== "string" || parsed.content == null) return null;
    return {
      savedAt: parsed.savedAt,
      title: parsed.title ?? "",
      clientName: parsed.clientName ?? "",
      clientEmail: parsed.clientEmail ?? "",
      clientAbn: parsed.clientAbn ?? "",
      internalNotes: parsed.internalNotes ?? "",
      expiresAt: parsed.expiresAt ?? "",
      content: parsed.content,
    };
  } catch {
    return null;
  }
}

export function writeLocalBackup(
  storage: Pick<Storage, "setItem">,
  proposalId: string,
  backup: EditorBackup
): void {
  storage.setItem(backupStorageKey(proposalId), JSON.stringify(backup));
}

export function clearLocalBackup(
  storage: Pick<Storage, "removeItem">,
  proposalId: string
): void {
  storage.removeItem(backupStorageKey(proposalId));
}

function editorFingerprint(state: {
  title: string;
  clientName: string;
  clientEmail: string;
  clientAbn: string;
  internalNotes: string;
  expiresAt: string;
  content: unknown;
}): string {
  return JSON.stringify({
    title: state.title,
    clientName: state.clientName,
    clientEmail: state.clientEmail,
    clientAbn: state.clientAbn,
    internalNotes: state.internalNotes,
    expiresAt: state.expiresAt,
    content: state.content,
  });
}

/** Offer the backup only when it is newer than the server copy and different. */
export function shouldOfferLocalRestore(
  backup: EditorBackup | null,
  server: ServerEditorState
): boolean {
  if (!backup) return false;
  const backupMs = toMillis(backup.savedAt);
  const serverMs = toMillis(server.updatedAt);
  if (backupMs == null || serverMs == null || backupMs <= serverMs) return false;
  return editorFingerprint(backup) !== editorFingerprint(server);
}
