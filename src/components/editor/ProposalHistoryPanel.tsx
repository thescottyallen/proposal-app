"use client";

import { History, RotateCcw, X } from "lucide-react";
import { ProposalEditor } from "@/components/editor/ProposalEditor";
import { ProposalDocument } from "@/lib/proposal-document";
import { formatDate } from "@/lib/utils";
import { formatClockTime } from "@/lib/proposal-save";

export interface HistoryRevision {
  version: number;
  createdAt: string;
  savedByName: string;
  summary: string;
}

export interface HistoryActivity {
  id: string;
  text: string;
  createdAt: string;
}

export interface HistoryPreview {
  version: number;
  createdAt: string;
  savedByName: string;
  summary: string;
  document: ProposalDocument;
}

export function ProposalHistoryPanel({
  authorName,
  revisions,
  activity,
  preview,
  previewLoading,
  restoreDisabled,
  restoring,
  onClose,
  onPreview,
  onRestore,
}: {
  authorName: string;
  revisions: HistoryRevision[];
  activity: HistoryActivity[];
  preview: HistoryPreview | null;
  previewLoading: boolean;
  restoreDisabled?: boolean;
  restoring?: boolean;
  onClose: () => void;
  onPreview: (version: number) => void;
  onRestore: (version: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        data-testid="history-panel"
        className="relative bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[calc(100vh-2rem)] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <History size={18} className="text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">History</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close history">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-[22rem] shrink-0 border-r border-gray-200 overflow-y-auto px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saved versions</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Every save keeps the previous version, including drafts. Restoring is a save too, so you can undo it.
            </p>
            {revisions.length === 0 ? (
              <p className="text-sm text-gray-500">No saved versions yet. They&apos;ll show up here the next time you save.</p>
            ) : (
              <ul className="space-y-3">
                {revisions.map((revision) => {
                  const selected = preview?.version === revision.version;
                  return (
                    <li
                      key={revision.version}
                      className={`rounded-lg border px-3 py-2.5 ${selected ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                    >
                      <p className="text-sm text-gray-900">
                        Version {revision.version} · {formatDate(revision.createdAt)}, {formatClockTime(revision.createdAt)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {revision.savedByName} · {revision.summary}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => onPreview(revision.version)}
                          className="px-2.5 py-1 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50"
                        >
                          Preview
                        </button>
                        {!restoreDisabled && (
                          <button
                            type="button"
                            onClick={() => onRestore(revision.version)}
                            disabled={restoring}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            Restore
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-6">Activity</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Created by {authorName}.</p>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-500">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
                    <div>
                      <p className="text-gray-900">{item.text}</p>
                      <p className="text-xs text-gray-400">{formatDate(item.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col bg-gray-50">
            {previewLoading ? (
              <p className="p-6 text-sm text-gray-500">Loading this version…</p>
            ) : preview ? (
              <>
                <div className="px-5 py-3 border-b border-gray-200 bg-white">
                  <p className="text-sm font-medium text-gray-900">
                    Version {preview.version} · {formatClockTime(preview.createdAt)} · {preview.savedByName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Read-only preview · {preview.summary}. Restoring saves it as the latest version.
                  </p>
                </div>
                <div data-testid="history-preview" className="flex-1 min-h-[420px] overflow-auto">
                  <ProposalEditor
                    key={preview.version}
                    initialDocument={preview.document}
                    onUpdate={() => {}}
                    readOnly
                  />
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-gray-500">
                Choose a version to preview it. Nothing here can be edited. Restore when you want that version back.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
