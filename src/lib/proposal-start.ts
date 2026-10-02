// Choosing how a new proposal starts: a copied template, or a blank document.
// The template is copied. The proposal is not linked back to it.

import {
  isProposalDocument,
  migrateToDocument,
  withDefaultPageNav,
  type ProposalBlock,
  type ProposalDocument,
} from "./proposal-document";
import { defaultPricingSettings } from "./pricing-types";

export type NewProposalStep = "start" | "client" | "contact" | "editor";

/** ?template= skips the chooser. A preselected client does not. */
export function initialNewProposalStep(input: {
  templateId: string | null;
  clientId: string | null;
}): NewProposalStep {
  if (input.templateId) return input.clientId ? "contact" : "client";
  return "start";
}

/** After Start from, skip steps the URL or a single contact already answered. */
export function stepAfterStart(input: {
  hasClient: boolean;
  contactCount: number;
}): "client" | "contact" | "editor" {
  if (!input.hasClient) return "client";
  if (input.contactCount === 1) return "editor";
  return "contact";
}

export interface TemplateSummary {
  description: string | null;
  pageNames: string[];
  previewTitle: string | null;
  previewBody: string | null;
}

function readDescription(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const value = (content as { description?: unknown }).description;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function inlineText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };
  if (typeof record.text === "string") return record.text;
  if (!Array.isArray(record.content)) return "";
  return record.content.map(inlineText).join("");
}

function linesFromTiptap(doc: unknown, limit: number): string[] {
  if (!doc || typeof doc !== "object") return [];
  const content = (doc as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const lines: string[] = [];
  for (const block of content) {
    if (lines.length >= limit) break;
    const text = inlineText(block).replace(/\s+/g, " ").trim();
    if (text) lines.push(text);
  }
  return lines;
}

function linesFromBlocks(blocks: ProposalBlock[], limit: number): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    if (lines.length >= limit) break;
    if (block.type === "richText") {
      lines.push(...linesFromTiptap(block.content, limit - lines.length));
    } else if (block.type === "columns") {
      for (const row of block.rows) {
        for (const cell of row) {
          if (lines.length >= limit) break;
          if (cell.type === "text") {
            lines.push(...linesFromTiptap(cell.content, limit - lines.length));
          }
        }
      }
    } else if (block.type === "button" && block.label.trim()) {
      lines.push(block.label.trim());
    }
  }
  return lines.slice(0, limit);
}

/** Name, optional description, page outline, and a short preview of page one. */
export function summarizeTemplate(content: unknown): TemplateSummary {
  const description = readDescription(content);
  if (!isProposalDocument(content)) {
    return { description, pageNames: [], previewTitle: null, previewBody: null };
  }
  const pageNames = content.pages.map((page) => page.name).filter((name) => name.trim().length > 0);
  const lines = content.pages[0] ? linesFromBlocks(content.pages[0].blocks, 3) : [];
  return {
    description,
    pageNames,
    previewTitle: lines[0] ?? content.pages[0]?.name ?? null,
    previewBody: lines.slice(1).join(" ") || null,
  };
}

export function pageOutline(pageNames: string[], max = 4): string {
  if (pageNames.length === 0) return "";
  if (pageNames.length <= max) return pageNames.join(" · ");
  const shown = pageNames.slice(0, max - 1);
  const extra = pageNames.length - shown.length;
  return `${shown.join(" · ")} · +${extra} more`;
}

/**
 * A new proposal's own copy of a template.
 * Applies the same defaults as a blank proposal, including page navigation
 * when the template never chose.
 */
export function prepareProposalFromTemplate(content: unknown): ProposalDocument {
  let raw = content;
  if (content && typeof content === "object") {
    try {
      raw = structuredClone(content);
    } catch {
      raw = content;
    }
  }
  const doc = isProposalDocument(raw)
    ? raw
    : migrateToDocument(
        (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>,
        null,
        defaultPricingSettings()
      );
  return withDefaultPageNav(doc);
}
