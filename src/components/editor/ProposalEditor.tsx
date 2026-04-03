"use client";

import { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { PageSidebar } from "./PageSidebar";
import { RichTextBlock } from "./RichTextBlock";
import { PricingBlockEditor } from "./PricingBlockEditor";
import { SignatureBlockEditor, DEFAULT_ACCEPTANCE_MESSAGE } from "./SignatureBlockEditor";
import { AddBlockMenu } from "./AddBlockMenu";
import {
  ProposalDocument,
  ProposalPage,
  ProposalBlock,
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
  const [addMenuAfterBlockId, setAddMenuAfterBlockId] = useState<string | null>(
    null
  );

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
    type: "richText" | "pricing" | "signature"
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
                  />
                )}

                {block.type === "signature" && (
                  <SignatureBlockEditor
                    message={block.message}
                    onChange={(message) =>
                      updateBlock(activePage.id, { ...block, message })
                    }
                    readOnly={readOnly}
                  />
                )}

                {/* Delete button */}
                {!readOnly && activePage.blocks.length > 1 && (
                  <button
                    onClick={() => deleteBlock(activePage.id, block.id)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center opacity-0 group-hover/block:opacity-100 transition-all shadow-sm z-10"
                    title="Remove block"
                  >
                    <X size={12} />
                  </button>
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
    </div>
  );
}
