import type { Currency, RoundingMode } from "./pricing-types";
import type { ProposalDocument } from "./proposal-document";
import { getAllPricingBlocks } from "./proposal-document";
import {
  applyRounding,
  computePricingTotals,
  formatCurrency,
  paymentChoiceSnapshot,
} from "./utils";

export interface AgreedRow {
  label: string;
  /** Omitted when the line is a sentence rather than a label/amount pair. */
  value?: string;
  strong?: boolean;
}

export interface AgreedSection {
  heading: string;
  rows: AgreedRow[];
}

/** Frozen at acceptance. Later edits to the proposal don't change this. */
export interface AgreedSummary {
  proposalTitle: string;
  clientName: string;
  /** Already formatted in Melbourne time. */
  acceptedAt: string;
  sections: AgreedSection[];
}

const GST_RATE = 0.1;

export function formatAcceptedAt(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted} (Melbourne)`;
}

function money(amount: number, currency: Currency, mode: RoundingMode): string {
  return formatCurrency(amount, currency, mode);
}

function percentLabel(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}%`;
}

function monthCount(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

function totalsRows(
  subtotal: number,
  gstAmount: number,
  total: number,
  gstEnabled: boolean,
  fmt: (amount: number) => string
): AgreedRow[] {
  const rows: AgreedRow[] = [{ label: "Subtotal", value: fmt(subtotal) }];
  if (gstEnabled) rows.push({ label: "GST (10%)", value: fmt(gstAmount) });
  rows.push({ label: "Total", value: fmt(total), strong: true });
  return rows;
}

export function buildAgreedSummary(input: {
  doc: ProposalDocument;
  proposalTitle: string;
  clientName: string;
  acceptedAt: Date;
  currency: Currency;
  roundingMode: RoundingMode;
}): AgreedSummary {
  const sections: AgreedSection[] = [];
  let standardSubtotal = 0;
  let standardGst = 0;
  let standardTotal = 0;
  let standardGstEnabled = false;
  let standardBlocks = 0;

  for (const block of getAllPricingBlocks(input.doc)) {
    const settings = block.pricingSettings;
    if (settings.paymentOptionsEnabled === true) {
      const snapshot = paymentChoiceSnapshot(settings);
      if (!snapshot) continue;
      const currency = settings.currency ?? input.currency;
      const mode = settings.roundingMode ?? input.roundingMode;
      const fmt = (amount: number) => money(amount, currency, mode);
      const gstOn = settings.gstEnabled === true;
      const rows: AgreedRow[] = [];

      if (snapshot.option === "project") {
        rows.push({ label: "Project fee", strong: true });
        rows.push({ label: "Fee (ex GST)", value: fmt(snapshot.projectFee ?? 0) });
        for (const stage of snapshot.projectStages ?? []) {
          const amount = gstOn ? `${fmt(stage.amount)} + GST` : fmt(stage.amount);
          rows.push({
            label: `${stage.label} (${percentLabel(stage.percent)})`,
            value: amount,
          });
        }
        rows.push(
          ...totalsRows(snapshot.subtotal, snapshot.gstAmount, snapshot.total, gstOn, fmt)
        );
      } else if (snapshot.option === "monthly") {
        const termSubtotal = snapshot.monthsTotal;
        const termGst = gstOn ? applyRounding(termSubtotal * GST_RATE, mode) : 0;
        const termTotal = applyRounding(termSubtotal + termGst, mode);
        const monthlyGst = snapshot.gstAmount;
        rows.push({ label: "Monthly", strong: true });
        rows.push({
          label: "Each month",
          value: gstOn
            ? `${fmt(snapshot.monthlyAmount)} ex GST + ${fmt(monthlyGst)} GST`
            : `${fmt(snapshot.monthlyAmount)} ex GST`,
        });
        rows.push({ label: "Minimum term", value: monthCount(snapshot.minimumMonths) });
        rows.push({ label: "Over the minimum term" });
        rows.push(...totalsRows(termSubtotal, termGst, termTotal, gstOn, fmt));
      } else {
        rows.push({ label: "Upfront", strong: true });
        rows.push({ label: "Amount (ex GST)", value: fmt(snapshot.upfrontPrice) });
        const discount = upfrontDiscountLabel(snapshot.discountType, snapshot.discountValue, fmt);
        if (discount) rows.push({ label: "Discount", value: discount });
        rows.push(
          ...totalsRows(snapshot.subtotal, snapshot.gstAmount, snapshot.total, gstOn, fmt)
        );
      }

      sections.push({ heading: "Payment", rows });
      if (snapshot.included) {
        sections.push({
          heading: "What's included",
          rows: [{ label: snapshot.included }],
        });
      }
      continue;
    }

    const totals = computePricingTotals(block.pricingData, settings, true);
    standardBlocks += 1;
    standardSubtotal = applyRounding(
      standardSubtotal + totals.subtotalAfterDiscount,
      input.roundingMode
    );
    standardGst = applyRounding(standardGst + totals.gstAmount, input.roundingMode);
    standardTotal = applyRounding(standardTotal + (totals.grandTotal ?? 0), input.roundingMode);
    if (settings.gstEnabled) standardGstEnabled = true;
  }

  if (standardBlocks > 0) {
    const fmt = (amount: number) => money(amount, input.currency, input.roundingMode);
    sections.push({
      heading: "Pricing",
      rows: totalsRows(standardSubtotal, standardGst, standardTotal, standardGstEnabled, fmt),
    });
  }

  return {
    proposalTitle: input.proposalTitle,
    clientName: input.clientName,
    acceptedAt: formatAcceptedAt(input.acceptedAt),
    sections,
  };
}

function upfrontDiscountLabel(
  type: "percentage" | "fixed" | null,
  value: number | null,
  fmt: (amount: number) => string
): string | null {
  if (value == null || value <= 0 || !type) return null;
  if (type === "percentage") return `${percentLabel(value)} off`;
  return `${fmt(value)} off`;
}

export function parseAgreedSummary(value: unknown): AgreedSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.proposalTitle !== "string") return null;
  if (typeof raw.clientName !== "string") return null;
  if (typeof raw.acceptedAt !== "string") return null;
  if (!Array.isArray(raw.sections)) return null;

  const sections: AgreedSection[] = [];
  for (const section of raw.sections) {
    if (!section || typeof section !== "object") return null;
    const heading = (section as { heading?: unknown }).heading;
    const rows = (section as { rows?: unknown }).rows;
    if (typeof heading !== "string" || !Array.isArray(rows)) return null;
    const parsedRows: AgreedRow[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") return null;
      const label = (row as { label?: unknown }).label;
      if (typeof label !== "string") return null;
      const amount = (row as { value?: unknown }).value;
      const strong = (row as { strong?: unknown }).strong;
      parsedRows.push({
        label,
        ...(typeof amount === "string" ? { value: amount } : {}),
        ...(strong === true ? { strong: true } : {}),
      });
    }
    sections.push({ heading, rows: parsedRows });
  }

  return {
    proposalTitle: raw.proposalTitle,
    clientName: raw.clientName,
    acceptedAt: raw.acceptedAt,
    sections,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowHtml(row: AgreedRow): string {
  const label = escapeHtml(row.label);
  if (!row.value) {
    const weight = row.strong ? "font-weight:600;" : "";
    return `<p style="font-size:14px;line-height:1.5;color:#2D2A26;margin:8px 0 0;${weight}">${label}</p>`;
  }
  const value = escapeHtml(row.value);
  const weight = row.strong ? "font-weight:600;" : "";
  const rule = row.strong ? "border-top:1px solid #1A1A1A;padding-top:8px;" : "padding-top:2px;";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:4px;">
    <tr>
      <td style="font-size:14px;line-height:1.5;color:#2D2A26;${weight}${rule}">${label}</td>
      <td style="font-size:14px;line-height:1.5;color:#2D2A26;text-align:right;${weight}${rule}">${value}</td>
    </tr>
  </table>`;
}

/** The agreed block shared by the client and owner acceptance emails. */
export function agreedSummaryHtml(summary: AgreedSummary): string {
  const identity = [
    ["Proposal", summary.proposalTitle],
    ["Client", summary.clientName],
    ["Accepted", summary.acceptedAt],
  ]
    .map(
      ([label, value]) => `<p style="font-size:12px;color:#6B6258;margin:10px 0 0;">${label}</p>
      <p style="font-size:15px;line-height:1.4;color:#1A1A1A;margin:0;">${escapeHtml(value)}</p>`
    )
    .join("");

  const sections = summary.sections
    .map((section) => {
      const heading = section.heading
        ? `<p style="font-size:15px;font-weight:600;color:#1A1A1A;margin:18px 0 0;">${escapeHtml(section.heading)}</p>`
        : "";
      return `${heading}${section.rows.map(rowHtml).join("")}`;
    })
    .join("");

  return `<div style="background:#FFE9A0;border:1.5px solid #1A1A1A;border-radius:10px;padding:6px 20px 16px;margin:0 0 24px 0;">
    ${identity}
    ${sections}
  </div>`;
}
