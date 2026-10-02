"use client";

import { conflictMessage, savedStatusLabel, unsavedRestoreLabel } from "@/lib/proposal-save";

export function SaveStatusText({
  phase,
  savedAt,
}: {
  phase: "idle" | "saving" | "saved" | "retrying";
  savedAt: string | null;
}) {
  let text: string | null = null;
  if (phase === "saving") text = "Saving…";
  else if (phase === "retrying") text = "Not saved, retrying";
  else if (savedAt) text = savedStatusLabel(savedAt);

  if (!text) return null;

  const tone =
    phase === "retrying" ? "text-amber-700" : phase === "saving" ? "text-gray-500" : "text-gray-500";

  return (
    <span data-testid="save-status" className={`text-xs ${tone}`}>
      {text}
    </span>
  );
}

export function SaveConflictBanner({
  updatedAt,
  onReload,
  onOverwrite,
  overwriting,
}: {
  updatedAt: string;
  onReload: () => void;
  onOverwrite: () => void;
  overwriting?: boolean;
}) {
  return (
    <div
      data-testid="save-conflict"
      className="mx-8 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <p className="text-sm text-amber-950 flex-1 min-w-[16rem]">{conflictMessage(updatedAt)}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          className="px-3 py-1.5 text-sm border border-amber-300 bg-white rounded-lg hover:bg-amber-100"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onOverwrite}
          disabled={overwriting}
          className="px-3 py-1.5 text-sm bg-amber-800 text-white rounded-lg hover:bg-amber-900 disabled:opacity-50"
        >
          {overwriting ? "Saving…" : "Save mine anyway"}
        </button>
      </div>
    </div>
  );
}

export function UnsavedChangesBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      data-testid="unsaved-backup"
      className="mx-8 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
    >
      <p className="text-sm text-blue-950 flex-1 min-w-[16rem]">
        This browser still has edits that weren&apos;t saved.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="px-3 py-1.5 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-800"
        >
          {unsavedRestoreLabel(savedAt)}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 text-sm border border-blue-300 bg-white rounded-lg hover:bg-blue-100"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
