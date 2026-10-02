"use client";

import { ArrowLeft, ChevronRight, FilePlus2, LayoutTemplate } from "lucide-react";
import { pageOutline, summarizeTemplate } from "@/lib/proposal-start";

export interface TemplateChoice {
  id: string;
  name: string;
  content: unknown;
}

export function StartFromChooser({
  templates,
  loading,
  loadError,
  selectedId,
  onSelect,
  onContinue,
  onBack,
}: {
  templates: TemplateChoice[];
  loading: boolean;
  loadError: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const hasTemplates = templates.length > 0;

  return (
    <div data-testid="start-from" className="flex min-h-full bg-gray-50 p-8">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-5xl mx-auto flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Start from</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Pick a template, or start from scratch. We&apos;ll copy it into the proposal, so your edits won&apos;t change the template.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading templates…</p>
          ) : (
            <>
              {loadError && (
                <p className="text-sm text-amber-700 mb-4">
                  Couldn&apos;t load templates. You can still start from scratch.
                </p>
              )}
              {!hasTemplates && !loadError && (
                <p className="text-sm text-gray-500 mb-4">
                  No templates yet. You can save a proposal as a template from the editor.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ChoiceCard
                  testId="start-scratch"
                  selected={selectedId === "scratch"}
                  onSelect={() => onSelect("scratch")}
                  title="Start from scratch"
                  detail="A blank proposal."
                  icon="scratch"
                />
                {templates.map((template) => {
                  const summary = summarizeTemplate(template.content);
                  return (
                    <ChoiceCard
                      key={template.id}
                      testId={`template-card-${template.id}`}
                      selected={selectedId === template.id}
                      onSelect={() => onSelect(template.id)}
                      title={template.name}
                      detail={summary.description}
                      outline={pageOutline(summary.pageNames)}
                      previewTitle={summary.previewTitle}
                      previewBody={summary.previewBody}
                      icon="template"
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end mt-auto">
          <button
            type="button"
            data-testid="start-continue"
            onClick={onContinue}
            disabled={!selectedId || loading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  testId,
  selected,
  onSelect,
  title,
  detail,
  outline,
  previewTitle,
  previewBody,
  icon,
}: {
  testId: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string | null;
  outline?: string;
  previewTitle?: string | null;
  previewBody?: string | null;
  icon: "scratch" | "template";
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`text-left rounded-xl border p-3 transition-colors h-full flex flex-col ${
        selected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div className="h-28 rounded-lg bg-gray-100 p-2.5 mb-3 overflow-hidden">
        {icon === "scratch" ? (
          <div className="h-full rounded-md border border-dashed border-gray-300 bg-white flex flex-col items-center justify-center text-gray-400">
            <FilePlus2 size={20} />
            <span className="text-[11px] mt-1">Blank proposal</span>
          </div>
        ) : (
          <div className="h-full rounded-md bg-white shadow-sm px-3 py-2 overflow-hidden">
            <p className="text-[11px] font-semibold text-gray-900 truncate">
              {previewTitle || title}
            </p>
            {previewBody && (
              <p className="text-[10px] text-gray-500 mt-1 line-clamp-3">{previewBody}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-start gap-2">
        {icon === "template" && <LayoutTemplate size={14} className="text-gray-400 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {detail && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{detail}</p>}
          {outline && <p className="text-xs text-gray-400 mt-1">{outline}</p>}
        </div>
      </div>
    </button>
  );
}
