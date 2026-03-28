"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Toolbar } from "./Toolbar";
import { PricingTable } from "./PricingTable";
import { PricingSettingsPanel } from "./PricingSettingsPanel";
import { ContentBlockPicker } from "./ContentBlockPicker";
import { useState, useCallback } from "react";
import {
  ProposalPricingData,
  ProposalPricingSettings,
  defaultPricingData,
  defaultPricingSettings,
} from "@/lib/pricing-types";
import { fetchAudPerUsd } from "@/lib/utils";

interface ProposalEditorProps {
  initialContent?:        Record<string, unknown>;
  initialPricingData?:    ProposalPricingData;
  initialPricingSettings?: ProposalPricingSettings;
  onUpdate?:              (
    content:         Record<string, unknown>,
    pricingData:     ProposalPricingData,
    pricingSettings: ProposalPricingSettings
  ) => void;
  readOnly?:   boolean;
  clientView?: boolean;
  // BusinessSettings context — needed to show/hide GST toggle
  gstRegistered?: boolean;
}

export function ProposalEditor({
  initialContent,
  initialPricingData,
  initialPricingSettings,
  onUpdate,
  readOnly    = false,
  clientView  = false,
  gstRegistered = false,
}: ProposalEditorProps) {
  const [pricingData, setPricingData]         = useState<ProposalPricingData>(
    initialPricingData ?? defaultPricingData()
  );
  const [pricingSettings, setPricingSettings] = useState<ProposalPricingSettings>(
    initialPricingSettings ?? defaultPricingSettings()
  );
  const [fetchingRate, setFetchingRate]       = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "Start writing your proposal..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content:             initialContent || undefined,
    editable:            !readOnly,
    immediatelyRender:   false,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getJSON(), pricingData, pricingSettings);
    },
  });

  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const handlePricingDataChange = useCallback((data: ProposalPricingData) => {
    setPricingData(data);
    if (editor) onUpdate?.(editor.getJSON(), data, pricingSettings);
  }, [editor, onUpdate, pricingSettings]);

  const handlePricingSettingsChange = useCallback((settings: ProposalPricingSettings) => {
    setPricingSettings(settings);
    if (editor) onUpdate?.(editor.getJSON(), pricingData, settings);
  }, [editor, onUpdate, pricingData]);

  const handleFetchExchangeRate = useCallback(async () => {
    setFetchingRate(true);
    try {
      const rate = await fetchAudPerUsd();
      const updated = { ...pricingSettings, exchangeRate: rate };
      setPricingSettings(updated);
      if (editor) onUpdate?.(editor.getJSON(), pricingData, updated);
    } catch {
      console.error("Failed to fetch exchange rate");
    } finally {
      setFetchingRate(false);
    }
  }, [editor, onUpdate, pricingData, pricingSettings]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {!readOnly && !clientView && (
        <Toolbar editor={editor} onInsertBlock={() => setShowBlockPicker(true)} />
      )}
      <ContentBlockPicker
        editor={editor}
        isOpen={showBlockPicker}
        onClose={() => setShowBlockPicker(false)}
      />
      <div className="px-8 py-6">
        <EditorContent
          editor={editor}
          className="prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[300px]
            [&_.tiptap]:outline-none
            [&_.tiptap_h1]:text-3xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:mt-6
            [&_.tiptap_h2]:text-2xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-5
            [&_.tiptap_h3]:text-xl [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-4
            [&_.tiptap_p]:mb-3 [&_.tiptap_p]:leading-relaxed
            [&_.tiptap_img]:rounded-lg [&_.tiptap_img]:max-w-full
            [&_.tiptap_hr]:my-6 [&_.tiptap_hr]:border-gray-200
            [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6
            [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6
            [&_.tiptap_.is-editor-empty:first-child::before]:text-gray-400
            [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
            [&_.tiptap_.is-editor-empty:first-child::before]:float-left
            [&_.tiptap_.is-editor-empty:first-child::before]:h-0
            [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none
          "
        />

        <PricingTable
          pricingData={pricingData}
          pricingSettings={pricingSettings}
          onChange={handlePricingDataChange}
          readOnly={readOnly}
          clientView={clientView}
        />

        {!readOnly && !clientView && (
          <PricingSettingsPanel
            settings={pricingSettings}
            onChange={handlePricingSettingsChange}
            gstRegistered={gstRegistered}
            onFetchExchangeRate={handleFetchExchangeRate}
            fetchingRate={fetchingRate}
          />
        )}
      </div>
    </div>
  );
}
