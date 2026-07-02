// ─── Proposal Document v2 ────────────────────────────────────────────────────
//
// A ProposalDocument replaces the old flat `content` (TipTap doc) + separate
// `pricingData` columns.  The `content` JSON column on Proposal stores a
// ProposalDocument when version === 2.  Legacy proposals (no version field)
// are migrated lazily on load — nothing in the DB changes until the user saves.

import {
  ProposalPricingData,
  ProposalPricingSettings,
  defaultPricingData,
  defaultPricingSettings,
  stripInternalFields,
} from "@/lib/pricing-types";

// ─── Block types ──────────────────────────────────────────────────────────────

export interface RichTextBlock {
  type: "richText";
  id: string;
  content: Record<string, unknown>; // TipTap JSON doc
  backgroundColor?: string;
}

export interface PricingBlock {
  type: "pricing";
  id: string;
  pricingData: ProposalPricingData;
  pricingSettings: ProposalPricingSettings;
  backgroundColor?: string;
}

export interface SignatureBlock {
  type: "signature";
  id: string;
  message?: string; // Custom acceptance message shown to the client
  backgroundColor?: string;
}

// ─── Column / layout block ─────────────────────────────────────────────────────

export interface ColumnCell {
  id: string;
  type: "text" | "image";
  /** TipTap JSON doc — used when type === "text" */
  content: Record<string, unknown>;
  /** Public URL or base64 data URL — used when type === "image" */
  imageUrl: string;
  imageAlt: string;
  /**
   * How many grid columns this cell spans. Defaults to 1.
   * The sum of colSpan values in a row must equal the block's columnCount.
   */
  colSpan?: number;
}

export interface ColumnBlock {
  type: "columns";
  id: string;
  /** Number of columns (2 or 3) */
  columnCount: 2 | 3;
  /** Show grid borders around cells */
  showBorders: boolean;
  /** Each row is an array of cells with length === columnCount */
  rows: ColumnCell[][];
  backgroundColor?: string;
}

// ─── Button / navigation block ────────────────────────────────────────────────

export interface ButtonBlock {
  type: "button";
  id: string;
  /** Label displayed on the button */
  label: string;
  /** Page ID to navigate to, or an external URL (starts with http) */
  targetPageId: string;
  /** Visual style */
  style?: "primary" | "secondary" | "outline";
  /** Horizontal alignment */
  alignment?: "left" | "center" | "right";
  backgroundColor?: string;
}

// ─── Sidebar settings ─────────────────────────────────────────────────────────

export interface SidebarSettings {
  /** Base64 data URL or public URL for the logo shown at the top of the sidebar */
  logoUrl?: string;
  /** CSS colour value for the sidebar background, e.g. "#1e293b" */
  backgroundColor?: string;
}

export type ProposalBlock = RichTextBlock | PricingBlock | SignatureBlock | ColumnBlock | ButtonBlock;

// ─── Page ─────────────────────────────────────────────────────────────────────

export interface ProposalPage {
  id: string;
  name: string;
  blocks: ProposalBlock[];
}

// ─── Document ─────────────────────────────────────────────────────────────────

export interface ProposalDocument {
  version: 2;
  pages: ProposalPage[];
  /** Optional sidebar branding — logo + background colour */
  sidebar?: SidebarSettings;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function isProposalDocument(
  content: unknown
): content is ProposalDocument {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as { version?: number }).version === 2
  );
}

/**
 * Migrate a legacy proposal (TipTap doc + separate pricingData) to the
 * ProposalDocument format.  Safe to call on already-migrated documents.
 */
export function migrateToDocument(
  content: Record<string, unknown>,
  pricingData: ProposalPricingData | null,
  pricingSettings: ProposalPricingSettings
): ProposalDocument {
  if (isProposalDocument(content)) return content;

  const blocks: ProposalBlock[] = [];

  if (content && Object.keys(content).length > 0) {
    blocks.push({ type: "richText", id: newId(), content });
  }

  // Only add a pricing block when pricingData is explicitly provided
  if (pricingData !== null) {
    blocks.push({
      type: "pricing",
      id: newId(),
      pricingData,
      pricingSettings,
    });
  }

  // Ensure there is at least one block
  if (blocks.length === 0) {
    blocks.push({
      type: "richText",
      id: newId(),
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
  }

  return {
    version: 2,
    pages: [{ id: newId(), name: "Page 1", blocks }],
  };
}

/** Default blank document for brand-new proposals */
export function defaultDocument(
  pricingSettingsOverrides?: Partial<ProposalPricingSettings>
): ProposalDocument {
  const settings = { ...defaultPricingSettings(), ...pricingSettingsOverrides };
  return {
    version: 2,
    pages: [
      {
        id: newId(),
        name: "Overview",
        blocks: [
          {
            type: "richText",
            id: newId(),
            content: {
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 1 },
                  content: [{ type: "text", text: "Proposal Title" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Prepared for: [Client Name]" }],
                },
                { type: "horizontalRule" },
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Overview" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Describe the project scope and objectives here...",
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        id: newId(),
        name: "Scope & Deliverables",
        blocks: [
          {
            type: "richText",
            id: newId(),
            content: {
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Deliverables" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "List what will be delivered..." }],
                },
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Timeline" }],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Outline the project timeline..." }],
                },
              ],
            },
          },
        ],
      },
      {
        id: newId(),
        name: "Investment",
        blocks: [
          {
            type: "richText",
            id: newId(),
            content: {
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Investment" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Here is a breakdown of the investment for this engagement.",
                    },
                  ],
                },
              ],
            },
          },
          {
            type: "pricing",
            id: newId(),
            pricingData: defaultPricingData(),
            pricingSettings: settings,
          },
        ],
      },
    ],
  };
}

/** Strip margin from all pricing blocks before sending to clients */
export function stripDocumentInternalFields(
  doc: ProposalDocument
): ProposalDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.type === "pricing") {
          return {
            ...block,
            pricingData: stripInternalFields(block.pricingData),
          };
        }
        return block;
      }),
    })),
  };
}

/** Get all pricing blocks across all pages */
export function getAllPricingBlocks(doc: ProposalDocument): PricingBlock[] {
  return doc.pages.flatMap((page) =>
    page.blocks.filter((b): b is PricingBlock => b.type === "pricing")
  );
}

/** Apply client optional-item choices to all pricing blocks */
export function applyClientChoices(
  doc: ProposalDocument,
  clientIncluded: Record<string, boolean>
): ProposalDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.type !== "pricing") return block;
        return {
          ...block,
          pricingData: {
            ...block.pricingData,
            items: block.pricingData.items.map((item) => ({
              ...item,
              clientIncluded: block.pricingSettings.optionsMode
                ? (clientIncluded[item.id] ?? item.clientIncluded)
                : item.isOptional
                  ? (clientIncluded[item.id] ?? item.clientIncluded)
                  : true,
            })),
          },
        };
      }),
    })),
  };
}

/** Collect all optional pricing items across all blocks (for the accept form) */
export function getOptionalItemMap(
  doc: ProposalDocument
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const block of getAllPricingBlocks(doc)) {
    for (const item of block.pricingData.items) {
      if (item.isOptional) map[item.id] = item.clientIncluded;
    }
  }
  return map;
}

// ─── Option groups (mutually-exclusive "choose one" pricing) ──────────────────

/**
 * Clear every option-group selection so the client actively picks one.
 * Used on the public view so no combined total shows until a choice is made.
 */
export function clearOptionSelections(doc: ProposalDocument): ProposalDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.type !== "pricing" || !block.pricingSettings.optionsMode) return block;
        return {
          ...block,
          pricingData: {
            ...block.pricingData,
            items: block.pricingData.items.map((item) => ({
              ...item,
              clientIncluded: false,
            })),
          },
        };
      }),
    })),
  };
}

/**
 * Select one option within its group (scoped to a block), clearing its
 * group-mates so exactly one alternative is ever selected.
 */
export function selectOption(
  doc: ProposalDocument,
  blockId: string,
  itemId: string
): ProposalDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => {
        if (block.type !== "pricing" || block.id !== blockId) return block;
        if (!block.pricingSettings.optionsMode) return block;
        return {
          ...block,
          pricingData: {
            ...block.pricingData,
            items: block.pricingData.items.map((item) => ({
              ...item,
              clientIncluded: item.id === itemId,
            })),
          },
        };
      }),
    })),
  };
}

/** True only if every option group in the document has exactly one selection. */
export function allOptionGroupsResolved(doc: ProposalDocument): boolean {
  for (const block of getAllPricingBlocks(doc)) {
    if (!block.pricingSettings.optionsMode) continue;
    const selectedCount = block.pricingData.items.filter((i) => i.clientIncluded).length;
    if (selectedCount !== 1) return false;
  }
  return true;
}
