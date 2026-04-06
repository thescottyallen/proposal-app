"use client";

import { useRef, useState, useCallback } from "react";
import { Palette, Plus, X } from "lucide-react";
import { PageSidebar } from "./PageSidebar";
import { RichTextBlock } from "./RichTextBlock";
import { PricingBlockEditor } from "./PricingBlockEditor";
import { SignatureBlockEditor, DEFAULT_ACCEPTANCE_MESSAGE } from "./SignatureBlockEditor";
import { ColumnBlockEditor } from "./ColumnBlockEditor";
import { AddBlockMenu } from "./AddBlockMenu";
import { ContentBlockPicker } from "./ContentBlockPicker";
import {
  ProposalDocument,
  ProposalPage,
  ProposalBlock,
  ColumnBlock,
  SidebarSettings,
  newId,
} from "@/lib/proposal-document";
import {
  defaultPricingData,
  defaultPricingSettings,
  ProposalPricingData,
  ProposalPricingSettings,
} from "@/lib/pricing-types";

interface ProposalEditorProps {
  initialDocument: ProposalDocument;
  onUpdate: (doc: ProposalDocument) => void;
  readOnly?: boolean;
  gstRegistered?: boolean;
}

export function ProposalEditor({
  initialDocument,
  onUpdate,
  readOnly = false,
  gstRegistered = false,
}: ProposalEditorProps) {
  const [doc, setDoc] = useState<ProposalDocument>(initialDocument);
  const [activePageId, setActivePageId] = useState<string>(
    initialDocument.pages[0]?.id ?? ""
  );
  const [addMenuAfterBlockId, setAddMenuAfterBlockId] = useState<string | null>(null);
  // Tracks which block's toolbar triggered the content-block picker
  const [contentBlockPickerAfterId, setContentBlockPickerAfterId] = useState<string | null>(null);
  // Per-block colour picker: stores the block id whose picker is open
  const [colorPickerBlockId, setColorPickerBlockId] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const activePage =
    doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];

  const updateDoc = useCallback(
    (next: ProposalDocument) => {
      setDoc(next);
      onUpdate(next);
    },
    [onUpdate]
  );

  // ─── Page operations ────────────────────────────────────────────────────────

  const handleAddPage = () => {
    const newPage: ProposalPage = {
      id: newId(),
      name: `Page ${doc.pages.length + 1}`,
      blocks: [
        {
          type: "richText",
          id: newId(),
          content: { type: "doc", content: [{ type: "paragraph" }] },
        },
      ],
    };
    const next = { ...doc, pages: [...doc.pages, newPage] };
    updateDoc(next);
    setActivePageId(newPage.id);
  };

  const handleRenamePage = (pageId: string, name: string) => {
    updateDoc({
      ...doc,
      pages: doc.pages.map((p) => (p.id === pageId ? { ...p, name } : p)),
    });
  };

  // ─── Block operations ────────────────────────────────────────────────────────

  const updateBlock = useCallback(
    (pageId: string, block: ProposalBlock) => {
      updateDoc({
        ...doc,
        pages: doc.pages.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            blocks: p.blocks.map((b) => (b.id === block.id ? block : b)),
          };
        }),
      });
    },
    [doc, updateDoc]
  );

  const deleteBlock = (pageId: string, blockId: string) => {
    const page = doc.pages.find((p) => p.id === pageId);
    if (!page || page.blocks.length <= 1) return;
    updateDoc({
      ...doc,
      pages: doc.pages.map((p) => {
        if (p.id !== pageId) return p;
        return { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) };
      }),
    });
  };

  const addBlock = (
    pageId: string,
    afterBlockId: string,
    type: "richText" | "pricing" | "signature" | "columns"
  ) => {
    let newBlock: ProposalBlock;
    if (type === "richText") {
      newBlock = {
        type: "richText",
        id: newId(),
        content: { type: "doc", content: [{ type: "paragraph" }] },
      };
    } else if (type === "pricing") {
      newBlock = {
        type: "pricing",
        id: newId(),
        pricingData: defaultPricingData(),
        pricingSettings: defaultPricingSettings(),
      };
    } else if (type === "columns") {
      const makeCell = () => ({
        id: newId(),
        type: "text" as const,
        content: { type: "doc", content: [{ type: "paragraph" }] },
        imageUrl: "",
        imageAlt: "",
      });
      newBlock = {
        type: "columns",
        id: newId(),
        columnCount: 2,
        showBorders: false,
        rows: [[makeCell(), makeCell()]],
      } as ColumnBlock;
    } else {
      newBlock = { type: "signature", id: newId(), message: DEFAULT_ACCEPTANCE_MESSAGE };
    }

    updateDoc({
      ...doc,
      pages: doc.pages.map((p) => {
        if (p.id !== pageId) return p;
        const idx = p.blocks.findIndex((b) => b.id === afterBlockId);
        const blocks = [...p.blocks];
        blocks.splice(idx + 1, 0, newBlock);
        return { ...p, blocks };
      }),
    });
    setAddMenuAfterBlockId(null);
  };

  // Update sidebar settings (logo / background colour)
  const updateSidebar = (settings: SidebarSettings) => {
    updateDoc({ ...doc, sidebar: settings });
  };

  // Insert content blocks (from library) after a given block
  const insertContentBlocksAfter = (afterBlockId: string, blocks: ProposalBlock[]) => {
    updateDoc({
      ...doc,
      pages: doc.pages.map((p) => {
        if (p.id !== activePage?.id) return p;
        const idx = p.blocks.findIndex((b) => b.id === afterBlockId);
        const newBlocks = [...p.blocks];
        newBlocks.splice(idx + 1, 0, ...blocks);
        return { ...p, blocks: newBlocks };
      }),
    });
    setContentBlockPickerAfterId(null);
  };

  if (!activePage) return null;

  return (
    <div className="flex min-h-full">
      {/* Page sidebar */}
      <PageSidebar
        pages={doc.pages}
        activePageId={activePage.id}
        onSelectPage={setActivePageId}
        onAddPage={handleAddPage}
        onRenamePage={handleRenamePage}
        sidebar={doc.sidebar}
        onUpdateSidebar={readOnly ? undefined : updateSidebar}
      />

      {/* Block list */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-3">
          {activePage.blocks.map((block) => (
            <div key={block.id} className="group/block relative">
              {/* Block */}
              <div className="relative">
                {block.type === "richText" && (
                  <RichTextBlock
                    block={block}
                    onChange={(content) =>
                      updateBlock(activePage.id, { ...block, content })
                    }
                    readOnly={readOnly}
                    onInsertContentBlock={
                      readOnly
                        ? undefined
                        : () => setContentBlockPickerAfterId(block.id)
                    }
                  />
                )}

                {block.type === "pricing" && (
                  <PricingBlockEditor
                    block={block}
                    onChange={(
                      pricingData: ProposalPricingData,
                      pricingSettings: ProposalPricingSettings
                    ) =>
                      updateBlock(activePage.id, {
                        ...block,
                        pricingData,
                        pricingSettings,
                      })
                    }
                    readOnly={readOnly}
                    gstRegistered={gstRegistered}
                    backgroundColor={block.backgroundColor}
                  />
                )}

                {block.type === "signature" && (
                  <SignatureBlockEditor
                    message={block.message}
                    onChange={(message) =>
                      updateBlock(activePage.id, { ...block, message })
                    }
                    readOnly={readOnly}
                    backgroundColor={block.backgroundColor}
                  />
                )}

                {block.type === "columns" && (
                  <ColumnBlockEditor
                    block={block}
                    onChange={(updated) => updateBlock(activePage.id, updated)}
                    readOnly={readOnly}
                    backgroundColor={block.backgroundColor}
                  />
                )}

                {/* Block controls: colour + delete */}
                {!readOnly && (
                  <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover/block:opacity-100 transition-all z-10">
                    {/* Background colour picker */}
                    <button
                      onClick={() => {
                        setColorPickerBlockId(block.id);
                        // small delay so state is set before click
                        setTimeout(() => colorInputRef.current?.click(), 0);
                      }}
                      className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:border-gray-400"
                      title="Block background colour"
                    >
                      {block.backgroundColor ? (
                        <span
                          className="w-3 h-3 rounded-full border border-black/10 inline-block"
                          style={{ backgroundColor: block.backgroundColor }}
                        />
                      ) : (
                        <Palette size={11} className="text-gray-400" />
                      )}
                    </button>
                    {/* Delete */}
                    {activePage.blocks.length > 1 && (
                      <button
                        onClick={() => deleteBlock(activePage.id, block.id)}
                        className="w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center shadow-sm"
                        title="Remove block"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Add block button after this block */}
              {!readOnly && (
                <div className="relative flex justify-center mt-2">
                  <button
                    onClick={() =>
                      setAddMenuAfterBlockId(
                        addMenuAfterBlockId === block.id ? null : block.id
                      )
                    }
                    className="flex items-center gap-1 px-3 py-1 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-400 rounded-full bg-white transition-colors"
                  >
                    <Plus size={11} />
                    Add block
                  </button>
                  {addMenuAfterBlockId === block.id && (
                    <div className="absolute top-full mt-1 z-50">
                      <AddBlockMenu
                        onAddRichText={() =>
                          addBlock(activePage.id, block.id, "richText")
                        }
                        onAddPricing={() =>
                          addBlock(activePage.id, block.id, "pricing")
                        }
                        onAddSignature={() =>
                          addBlock(activePage.id, block.id, "signature")
                        }
                        onAddColumns={() =>
                          addBlock(activePage.id, block.id, "columns")
                        }
                        onClose={() => setAddMenuAfterBlockId(null)}
                        acceptanceBlockExists={doc.pages.some((p) =>
                          p.blocks.some((b) => b.type === "signature")
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Page-level content block picker */}
      {!readOnly && (
        <ContentBlockPicker
          isOpen={contentBlockPickerAfterId !== null}
          onClose={() => setContentBlockPickerAfterId(null)}
          onInsertProposalBlocks={(blocks) => {
            if (contentBlockPickerAfterId) {
              insertContentBlocksAfter(contentBlockPickerAfterId, blocks);
            }
          }}
        />
      )}

      {/* Hidden colour input shared across all blocks */}
      {!readOnly && (
        <input
          ref={colorInputRef}
          type="color"
          className="sr-only"
          value={
            (colorPickerBlockId
              ? activePage.blocks.find((b) => b.id === colorPickerBlockId)?.backgroundColor
              : undefined) || "#ffffff"
          }
          onChange={(e) => {
            if (!colorPickerBlockId) return;
            const block = activePage.blocks.find((b) => b.id === colorPickerBlockId);
            if (block) updateBlock(activePage.id, { ...block, backgroundColor: e.target.value });
          }}
          onBlur={() => setColorPickerBlockId(null)}
        />
      )}
    </div>
  );
}
