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
  type: "text" | "image" | "button";
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
  /** Button settings when type === "button" */
  button?: {
    label: string;
    /** Page id, or a legacy external URL */
    targetPageId: string;
    linkType?: "url" | "page";
    href?: string;
    style?: "primary" | "secondary" | "outline";
    alignment?: "left" | "center" | "right";
  };
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
  /**
   * Page id when the button links to a page in this proposal.
   * Older buttons stored either a page id or an http(s) URL in this field.
   */
  targetPageId: string;
  /**
   * "page" moves the reader to another page in this proposal.
   * "url" opens a web address. Omitted on buttons saved before the choice existed.
   */
  linkType?: "url" | "page";
  /** Web address when linkType is "url". */
  href?: string;
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
  /**
   * Show Back / Next under each page on the public proposal.
   * Omitted on documents created before this setting, which stay off.
   * New proposals set this to true.
   */
  showPageNav?: boolean;
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
    showPageNav: true,
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

/** True when the public page should show Back / Next. Missing means off. */
export function showPageNavigation(doc: ProposalDocument): boolean {
  return doc.showPageNav === true;
}

/**
 * New proposals turn page navigation on unless the document already chose.
 * Existing saved documents are left untouched.
 */
export function withDefaultPageNav(doc: ProposalDocument): ProposalDocument {
  if (doc.showPageNav === undefined) return { ...doc, showPageNav: true };
  return doc;
}

const HTTP_URL = /^https?:\/\//i;

export type ResolvedButtonLink =
  | { kind: "url"; href: string }
  | { kind: "page"; pageId: string; pageName: string }
  | { kind: "missing-page"; pageId: string }
  | { kind: "unset" };

/** "url" or "page", including buttons saved before linkType existed. */
export function buttonLinkType(block: ButtonBlock): "url" | "page" {
  if (block.linkType === "url" || block.linkType === "page") return block.linkType;
  const target = (block.targetPageId ?? "").trim();
  if (HTTP_URL.test(target)) return "url";
  return "page";
}

/** Web address for a button, including the legacy URL stored on targetPageId. */
export function buttonWebAddress(block: ButtonBlock): string {
  if (buttonLinkType(block) === "url") {
    if (typeof block.href === "string" && block.href.length > 0) return block.href;
    const target = (block.targetPageId ?? "").trim();
    if (HTTP_URL.test(target)) return target;
    return block.href ?? "";
  }
  return "";
}

/**
 * Where a button goes. Page targets are matched by id, so renaming a page
 * does not break the link. A deleted page is "missing-page".
 */
export function resolveButtonLink(
  block: ButtonBlock,
  pages: { id: string; name: string }[]
): ResolvedButtonLink {
  if (buttonLinkType(block) === "url") {
    const href = buttonWebAddress(block).trim();
    if (!href || href === "https://" || href === "http://") return { kind: "unset" };
    return { kind: "url", href };
  }
  const pageId = (block.targetPageId ?? "").trim();
  if (!pageId || HTTP_URL.test(pageId)) return { kind: "unset" };
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { kind: "missing-page", pageId };
  return { kind: "page", pageId, pageName: page.name };
}

/** Build a button block from a column cell so column buttons navigate the same way. */
export function buttonBlockFromCell(cell: ColumnCell): ButtonBlock {
  const button = cell.button;
  return {
    type: "button",
    id: cell.id,
    label: button?.label ?? "",
    targetPageId: button?.targetPageId ?? "",
    linkType: button?.linkType,
    href: button?.href,
    style: button?.style,
    alignment: button?.alignment,
  };
}

export function buttonFieldsFromBlock(
  block: ButtonBlock
): NonNullable<ColumnCell["button"]> {
  return {
    label: block.label,
    targetPageId: block.targetPageId,
    linkType: block.linkType,
    href: block.href,
    style: block.style,
    alignment: block.alignment,
  };
}

/** Hash used on the public proposal so a page can be linked and restored. */
export function pageHash(pageId: string): string {
  return `page-${pageId}`;
}

/** Read a page id from a location hash. Unknown ids return null. */
export function pageIdFromHash(
  hash: string,
  pages: { id: string }[]
): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  const id = raw.startsWith("page-") ? raw.slice("page-".length) : raw;
  return pages.some((p) => p.id === id) ? id : null;
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
