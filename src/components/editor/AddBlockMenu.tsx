"use client";

import { DollarSign, FileText, PenLine, X } from "lucide-react";

interface AddBlockMenuProps {
  onAddRichText: () => void;
  onAddPricing: () => void;
  onAddSignature: () => void;
  onClose: () => void;
}

export function AddBlockMenu({
  onAddRichText,
  onAddPricing,
  onAddSignature,
  onClose,
}: AddBlockMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-1/2 -translate-x-1/2 top-2 z-50 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Add block
          </p>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </div>

        <button
          onClick={() => {
            onAddRichText();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <FileText size={15} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Rich text</p>
            <p className="text-xs text-gray-500">Headings, paragraphs, lists</p>
          </div>
        </button>

        <button
          onClick={() => {
            onAddPricing();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <DollarSign size={15} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Pricing table</p>
            <p className="text-xs text-gray-500">Line items, totals, GST</p>
          </div>
        </button>

        <button
          onClick={() => {
            onAddSignature();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <PenLine size={15} className="text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Signature</p>
            <p className="text-xs text-gray-500">Client acceptance with typed name</p>
          </div>
        </button>
      </div>
    </>
  );
}
