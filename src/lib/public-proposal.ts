import { isProposalDocument } from "@/lib/proposal-document";

/**
 * Fields the public proposal page may send to the browser.
 * Anything not listed here stays on the server.
 */

export interface PublicProposalInput {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  clientAbn?: string | null;
  content: unknown;
  status: string;
  expiresAt?: string | null;
  invoiceNumber?: string | null;
  totalValue?: number | null;
  pricingData?: unknown;
  currency: string;
  gstEnabled: boolean;
  roundingMode: string;
  discountType?: string | null;
  discountValue?: number | null;
  showDiscount: boolean;
  depositType?: string | null;
  depositValue?: number | null;
  billingCadence: string;
  recurringStartMode?: string | null;
  recurringStartDate?: string | null;
  fixedTermMonths?: number | null;
  paymentTerms: string;
  latePaymentClause?: string | null;
}

const PRICING_ITEM_KEYS = [
  "id",
  "sectionId",
  "type",
  "description",
  "scopeNote",
  "quantity",
  "unitPrice",
  "isOptional",
  "clientIncluded",
  "gstApplicable",
  "discountType",
  "discountValue",
  "order",
] as const;

const PRICING_SETTING_KEYS = [
  "currency",
  "gstEnabled",
  "roundingMode",
  "optionsMode",
  "discountType",
  "discountValue",
  "showDiscount",
  "depositType",
  "depositValue",
  "billingCadence",
  "recurringStartMode",
  "recurringStartDate",
  "fixedTermMonths",
  "paymentTerms",
  "latePaymentClause",
  "paymentOptionsEnabled",
  "paymentMonthlyAmount",
  "paymentMinimumMonths",
  "paymentUpfrontDiscountType",
  "paymentUpfrontDiscountValue",
  "paymentUpfrontOverride",
  "paymentMonthlyIncluded",
  "paymentUpfrontIncluded",
  "paymentMonthlyOffered",
  "paymentUpfrontOffered",
  "paymentProjectOffered",
  "paymentProjectFee",
  "paymentProjectStage1Percent",
  "paymentProjectStage2Percent",
  "paymentProjectStage1Label",
  "paymentProjectStage2Label",
  "paymentProjectIncluded",
  "selectedPaymentOption",
] as const;

/** Keys that belong to the editor, even if they show up inside rich text JSON. */
const INTERNAL_JSON_KEYS = new Set([
  "margin",
  "cost",
  "internalNotes",
  "internalNote",
  "lostReason",
  "createdBy",
  "exchangeRate",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isScalar(value: unknown): boolean {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Copy a JSON tree, dropping editor-only keys. Used for rich text, which has no fixed field list. */
function publicRichText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicRichText);
  const record = asRecord(value);
  if (!record) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (INTERNAL_JSON_KEYS.has(key)) continue;
    out[key] = publicRichText(child);
  }
  return out;
}

function copyListed(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (!isScalar(value)) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

function publicPricingData(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const sections = Array.isArray(record.sections)
    ? record.sections.flatMap((section) => {
        const row = asRecord(section);
        if (!row) return [];
        return [copyListed(row, ["id", "name", "order"])];
      })
    : [];
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        const row = asRecord(item);
        if (!row) return [];
        return [copyListed(row, PRICING_ITEM_KEYS)];
      })
    : [];
  return { sections, items };
}

function publicPricingSettings(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return {};
  return copyListed(record, PRICING_SETTING_KEYS);
}

function publicButton(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return copyListed(record, ["label", "targetPageId", "linkType", "href", "style", "alignment"]);
}

function publicColumnCell(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const cell = copyListed(record, ["id", "type", "imageUrl", "imageAlt", "colSpan"]);
  if ("content" in record) cell.content = publicRichText(record.content);
  const button = publicButton(record.button);
  if (button) cell.button = button;
  return cell;
}

function publicBlock(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string" || typeof record.id !== "string") return null;
  const background = typeof record.backgroundColor === "string" ? { backgroundColor: record.backgroundColor } : {};

  if (record.type === "richText") {
    return { type: "richText", id: record.id, content: publicRichText(record.content), ...background };
  }
  if (record.type === "pricing") {
    return {
      type: "pricing",
      id: record.id,
      pricingData: publicPricingData(record.pricingData) ?? { sections: [], items: [] },
      pricingSettings: publicPricingSettings(record.pricingSettings),
      ...background,
    };
  }
  if (record.type === "signature") {
    const message = typeof record.message === "string" ? { message: record.message } : {};
    return { type: "signature", id: record.id, ...message, ...background };
  }
  if (record.type === "button") {
    return {
      type: "button",
      id: record.id,
      ...copyListed(record, ["label", "targetPageId", "linkType", "href", "style", "alignment"]),
      ...background,
    };
  }
  if (record.type === "columns") {
    const rows = Array.isArray(record.rows)
      ? record.rows.flatMap((row) => {
          if (!Array.isArray(row)) return [];
          return [row.flatMap((cell) => {
            const next = publicColumnCell(cell);
            return next ? [next] : [];
          })];
        })
      : [];
    return {
      type: "columns",
      id: record.id,
      ...copyListed(record, ["columnCount", "showBorders"]),
      rows,
      ...background,
    };
  }
  return null;
}

export function publicProposalContent(content: unknown): Record<string, unknown> {
  if (!isProposalDocument(content)) {
    const copied = publicRichText(content);
    return asRecord(copied) ?? {};
  }
  const pages = content.pages.flatMap((page) => {
    const row = asRecord(page);
    if (!row || typeof row.id !== "string") return [];
    const blocks = Array.isArray(row.blocks)
      ? row.blocks.flatMap((block) => {
          const next = publicBlock(block);
          return next ? [next] : [];
        })
      : [];
    return [{
      id: row.id,
      ...(typeof row.name === "string" ? { name: row.name } : {}),
      blocks,
    }];
  });
  const sidebar = asRecord(content.sidebar);
  return {
    version: 2,
    pages,
    ...(sidebar ? { sidebar: copyListed(sidebar, ["logoUrl", "backgroundColor"]) } : {}),
    ...(typeof content.showPageNav === "boolean" ? { showPageNav: content.showPageNav } : {}),
  };
}

/** The object passed into the public page. Extra fields on the input are ignored. */
export function publicProposalPayload(input: PublicProposalInput) {
  const v2 = isProposalDocument(input.content);
  return {
    id: input.id,
    title: input.title,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientAbn: input.clientAbn ?? null,
    content: publicProposalContent(input.content),
    status: input.status,
    expiresAt: input.expiresAt ?? null,
    invoiceNumber: input.invoiceNumber ?? null,
    totalValue: input.totalValue ?? null,
    pricingData: v2 ? null : publicPricingData(input.pricingData),
    currency: input.currency,
    gstEnabled: input.gstEnabled,
    roundingMode: input.roundingMode,
    discountType: input.discountType ?? null,
    discountValue: input.discountValue ?? null,
    showDiscount: input.showDiscount,
    depositType: input.depositType ?? null,
    depositValue: input.depositValue ?? null,
    billingCadence: input.billingCadence,
    recurringStartMode: input.recurringStartMode ?? null,
    recurringStartDate: input.recurringStartDate ?? null,
    fixedTermMonths: input.fixedTermMonths ?? null,
    paymentTerms: input.paymentTerms,
    latePaymentClause: input.latePaymentClause ?? null,
  };
}
