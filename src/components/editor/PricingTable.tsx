"use client";

import { useCallback, type CSSProperties } from "react";
import { Plus, Trash2, GripVertical, ChevronDown } from "lucide-react";
import {
  PricingItem,
  PricingSection,
  ProposalPricingData,
  ProposalPricingSettings,
  LineItemType,
  DiscountType,
  defaultPricingItem,
} from "@/lib/pricing-types";
import { computePricingTotals, formatCurrency, applyRounding, paymentTermsLabel } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_TYPES: { value: LineItemType; label: string; qtyLabel: string; unitLabel: string }[] = [
  { value: "fixed",     label: "Fixed",     qtyLabel: "Qty",  unitLabel: "Price" },
  { value: "hourly",    label: "Hourly",    qtyLabel: "Hrs",  unitLabel: "Rate/hr" },
  { value: "day",       label: "Day Rate",  qtyLabel: "Days", unitLabel: "Rate/day" },
  { value: "retainer",  label: "Retainer",  qtyLabel: "Mos",  unitLabel: "Monthly" },
  { value: "milestone", label: "Milestone", qtyLabel: "Qty",  unitLabel: "Amount" },
];

function lineTypeConfig(type: LineItemType) {
  return LINE_TYPES.find(t => t.value === type) ?? LINE_TYPES[0];
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingTableProps {
  pricingData:     ProposalPricingData;
  pricingSettings: ProposalPricingSettings;
  onChange:        (data: ProposalPricingData) => void;
  onClientIncludedChange?: (itemId: string, included: boolean) => void; // client view only
  readOnly?:       boolean;
  clientView?:     boolean; // public proposal view — shows optional toggles, hides margin
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PricingTable({
  pricingData,
  pricingSettings,
  onChange,
  onClientIncludedChange,
  readOnly    = false,
  clientView  = false,
}: PricingTableProps) {
  const { sections, items } = pricingData;
  const { currency, roundingMode, gstEnabled } = pricingSettings;
  const fmt = (n: number) => formatCurrency(n, currency, roundingMode);
  const totals = computePricingTotals(pricingData, pricingSettings, clientView);

  // ── Mutation helpers ────────────────────────────────────────────────────────

  const updateItem = useCallback((id: string, patch: Partial<PricingItem>) => {
    onChange({
      ...pricingData,
      items: items.map(item => item.id === id ? { ...item, ...patch } : item),
    });
  }, [pricingData, items, onChange]);

  const removeItem = useCallback((id: string) => {
    onChange({ ...pricingData, items: items.filter(item => item.id !== id) });
  }, [pricingData, items, onChange]);

  const addItem = useCallback((sectionId: string | null) => {
    const sectionItems = items.filter(i => i.sectionId === sectionId);
    const order = sectionItems.length > 0 ? Math.max(...sectionItems.map(i => i.order)) + 1 : 0;
    onChange({
      ...pricingData,
      items: [...items, defaultPricingItem({ sectionId, order })],
    });
  }, [pricingData, items, onChange]);

  const addSection = useCallback(() => {
    const order = sections.length > 0 ? Math.max(...sections.map(s => s.order)) + 1 : 0;
    const newSection: PricingSection = { id: newId(), name: "New Section", order };
    onChange({ ...pricingData, sections: [...sections, newSection] });
  }, [pricingData, sections, onChange]);

  const updateSection = useCallback((id: string, patch: Partial<PricingSection>) => {
    onChange({
      ...pricingData,
      sections: sections.map(s => s.id === id ? { ...s, ...patch } : s),
    });
  }, [pricingData, sections, onChange]);

  const removeSection = useCallback((id: string) => {
    onChange({
      ...pricingData,
      sections: sections.filter(s => s.id !== id),
      items: items.map(item => item.sectionId === id ? { ...item, sectionId: null } : item),
    });
  }, [pricingData, sections, items, onChange]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const ungroupedItems = items
    .filter(i => i.sectionId === null)
    .sort((a, b) => a.order - b.order);

  function sectionItems(sectionId: string) {
    return items
      .filter(i => i.sectionId === sectionId)
      .sort((a, b) => a.order - b.order);
  }

  function sectionSubtotal(sectionId: string): number {
    return totals.sectionSubtotals[sectionId] ?? 0;
  }

  const showGstCol  = gstEnabled;
  const showMargin  = !readOnly && !clientView;
  const showOptCol  = !readOnly && !clientView;
  const colCount    = 6 + (showGstCol ? 1 : 0) + (showMargin ? 1 : 0) + (!readOnly ? 1 : 0);

  return (
    <div className="mt-6">
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* ── Table header ── */}
        <div className="bg-gray-50 border-b border-gray-200 grid text-xs font-medium text-gray-500 uppercase tracking-wide"
          style={{ gridTemplateColumns: buildGridCols(showGstCol, showMargin, readOnly, clientView) }}
        >
          {!readOnly && !clientView && <div className="px-2 py-3 w-6" />}
          <div className="px-3 py-3">Description</div>
          <div className="px-3 py-3 text-center">Type</div>
          <div className="px-3 py-3 text-right">Qty</div>
          <div className="px-3 py-3 text-right">Unit</div>
          {showGstCol  && <div className="px-2 py-3 text-center">GST</div>}
          {showMargin  && <div className="px-2 py-3 text-right">Margin %</div>}
          {clientView  && <div className="px-2 py-3 text-center">Include</div>}
          <div className="px-3 py-3 text-right">Total</div>
          {!readOnly   && <div className="px-2 py-3 w-8" />}
        </div>

        {/* ── Ungrouped items ── */}
        {ungroupedItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            totals={totals}
            readOnly={readOnly}
            clientView={clientView}
            showGstCol={showGstCol}
            showMargin={showMargin}
            fmt={fmt}
            onUpdate={updateItem}
            onRemove={removeItem}
            onClientIncludedChange={onClientIncludedChange}
          />
        ))}

        {!readOnly && !clientView && (
          <AddLineButton onClick={() => addItem(null)} indent={false} />
        )}

        {/* ── Sections ── */}
        {sortedSections.map(section => (
          <div key={section.id}>
            {/* Section header */}
            <div className="bg-gray-50 border-t border-gray-200 flex items-center justify-between px-3 py-2">
              {readOnly || clientView ? (
                <span className="text-sm font-semibold text-gray-700">{section.name}</span>
              ) : (
                <input
                  type="text"
                  value={section.name}
                  onChange={e => updateSection(section.id, { name: e.target.value })}
                  className="text-sm font-semibold text-gray-700 bg-transparent border-0 focus:outline-none focus:ring-0 p-0 flex-1"
                />
              )}
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">
                  Subtotal: <span className="font-medium text-gray-700">{fmt(sectionSubtotal(section.id))}</span>
                </span>
                {!readOnly && !clientView && (
                  <button
                    onClick={() => removeSection(section.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove section (items move to ungrouped)"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Section items */}
            {sectionItems(section.id).map(item => (
              <ItemRow
                key={item.id}
                item={item}
                totals={totals}
                readOnly={readOnly}
                clientView={clientView}
                showGstCol={showGstCol}
                showMargin={showMargin}
                fmt={fmt}
                onUpdate={updateItem}
                onRemove={removeItem}
                onClientIncludedChange={onClientIncludedChange}
                indented
              />
            ))}

            {!readOnly && !clientView && (
              <AddLineButton onClick={() => addItem(section.id)} indent />
            )}
          </div>
        ))}

        {/* ── Totals footer ── */}
        <TotalsFooter
          totals={totals}
          pricingSettings={pricingSettings}
          sections={sections}
          fmt={fmt}
          colCount={colCount}
          showGstCol={showGstCol}
          readOnly={readOnly}
          clientView={clientView}
          showMargin={showMargin}
        />
      </div>

      {/* ── Bottom actions (editor only) ── */}
      {!readOnly && !clientView && (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={addSection}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Plus size={12} />
            Add section
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item:       PricingItem;
  totals:     ReturnType<typeof computePricingTotals>;
  readOnly:   boolean;
  clientView: boolean;
  showGstCol: boolean;
  showMargin: boolean;
  fmt:        (n: number) => string;
  onUpdate:   (id: string, patch: Partial<PricingItem>) => void;
  onRemove:   (id: string) => void;
  onClientIncludedChange?: (id: string, included: boolean) => void;
  indented?:  boolean;
}

function ItemRow({
  item, totals, readOnly, clientView, showGstCol, showMargin,
  fmt, onUpdate, onRemove, onClientIncludedChange, indented = false,
}: ItemRowProps) {
  const lineTotal = totals.lines.find(l => l.itemId === item.id);
  const total     = lineTotal?.total ?? applyRounding(item.quantity * item.unitPrice, "CENTS");
  const cfg       = lineTypeConfig(item.type);
  const dimmed    = clientView && item.isOptional && !item.clientIncluded;

  const rowStyle: CSSProperties = { opacity: dimmed ? 0.4 : 1 };

  return (
    <div
      className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors"
      style={rowStyle}
    >
      {/* Main row */}
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: buildGridCols(showGstCol, showMargin, readOnly, clientView) }}
      >
        {/* Drag handle (editor only) */}
        {!readOnly && !clientView && (
          <div className="px-1 pt-3 text-gray-300 cursor-grab">
            <GripVertical size={14} />
          </div>
        )}

        {/* Description + scope note */}
        <div className={`px-3 py-2.5 ${indented ? "pl-6" : ""}`}>
          {readOnly || clientView ? (
            <div>
              <p className="text-sm text-gray-900">{item.description || <span className="text-gray-400 italic">No description</span>}</p>
              {item.scopeNote && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.scopeNote}</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <textarea
                value={item.description}
                onChange={e => onUpdate(item.id, { description: e.target.value })}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = t.scrollHeight + "px";
                }}
                placeholder="Description..."
                rows={1}
                className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-900 placeholder-gray-300 resize-none overflow-hidden leading-relaxed"
              />
              <textarea
                value={item.scopeNote}
                onChange={e => onUpdate(item.id, { scopeNote: e.target.value })}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = t.scrollHeight + "px";
                }}
                placeholder="Scope note (visible to client)..."
                rows={1}
                className="w-full text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-500 placeholder-gray-300 italic resize-none overflow-hidden leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Type */}
        <div className="px-2 py-2.5 flex items-start justify-center">
          {readOnly || clientView ? (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{cfg.label}</span>
          ) : (
            <div className="relative">
              <select
                value={item.type}
                onChange={e => onUpdate(item.id, { type: e.target.value as LineItemType })}
                className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border-0 focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none pr-4"
              >
                {LINE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-1 top-1.5 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Qty */}
        <div className="px-3 py-2.5 text-right">
          {readOnly || clientView ? (
            <span className="text-sm">{item.quantity}</span>
          ) : (
            <input
              type="number"
              value={item.quantity}
              onChange={e => onUpdate(item.id, { quantity: parseFloat(e.target.value) || 0 })}
              min={0}
              step={0.5}
              className="w-16 text-sm text-right border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
            />
          )}
        </div>

        {/* Unit price */}
        <div className="px-3 py-2.5 text-right">
          {readOnly || clientView ? (
            <span className="text-sm">{fmt(item.unitPrice)}</span>
          ) : (
            <input
              type="number"
              value={item.unitPrice}
              onChange={e => onUpdate(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
              min={0}
              step={1}
              className="w-24 text-sm text-right border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
            />
          )}
        </div>

        {/* GST checkbox */}
        {showGstCol && (
          <div className="px-2 py-2.5 flex items-start justify-center pt-3">
            <input
              type="checkbox"
              checked={item.gstApplicable}
              onChange={e => !readOnly && onUpdate(item.id, { gstApplicable: e.target.checked })}
              disabled={readOnly}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>
        )}

        {/* Margin % (editor only) */}
        {showMargin && (
          <div className="px-2 py-2.5 text-right">
            <div className="flex items-center justify-end gap-0.5">
              <input
                type="number"
                value={item.margin}
                onChange={e => onUpdate(item.id, { margin: parseFloat(e.target.value) || 0 })}
                min={0}
                max={100}
                step={1}
                className="w-12 text-xs text-right border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-500"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </div>
        )}

        {/* Client include toggle (client view for optional items) */}
        {clientView && (
          <div className="px-2 py-2.5 flex items-start justify-center pt-3">
            {item.isOptional ? (
              <input
                type="checkbox"
                checked={item.clientIncluded}
                onChange={e => onClientIncludedChange?.(item.id, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </div>
        )}

        {/* Line total */}
        <div className="px-3 py-2.5 text-right">
          <span className="text-sm font-medium">{fmt(total)}</span>
          {/* Line discount indicator */}
          {item.discountType && item.discountValue != null && item.discountValue > 0 && (
            <p className="text-xs text-green-600 mt-0.5">
              -{item.discountType === "percentage" ? `${item.discountValue}%` : fmt(item.discountValue)}
            </p>
          )}
          {/* Optional label */}
          {item.isOptional && !clientView && (
            <p className="text-xs text-blue-500 mt-0.5">optional</p>
          )}
        </div>

        {/* Delete (editor only) */}
        {!readOnly && (
          <div className="px-1 py-2.5 flex items-start pt-3">
            <button
              onClick={() => onRemove(item.id)}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Optional + discount controls row (editor only) */}
      {!readOnly && !clientView && (
        <div className="flex items-center gap-4 px-3 pb-2 pl-9">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={item.isOptional}
              onChange={e => onUpdate(item.id, { isOptional: e.target.checked, clientIncluded: !e.target.checked ? true : item.clientIncluded })}
              className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">Optional</span>
          </label>

          <LineDiscountControl item={item} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ─── Line Discount Control ────────────────────────────────────────────────────

function LineDiscountControl({
  item, onUpdate,
}: { item: PricingItem; onUpdate: (id: string, patch: Partial<PricingItem>) => void }) {
  const hasDiscount = item.discountType && item.discountValue != null && item.discountValue > 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">Discount:</span>
      <select
        value={item.discountType ?? "none"}
        onChange={e => {
          const val = e.target.value;
          onUpdate(item.id, {
            discountType:  val === "none" ? null : val as DiscountType,
            discountValue: val === "none" ? null : (item.discountValue ?? 0),
          });
        }}
        className="text-xs border-0 bg-transparent text-gray-400 focus:ring-0 p-0 cursor-pointer"
      >
        <option value="none">None</option>
        <option value="percentage">%</option>
        <option value="fixed">Fixed</option>
      </select>
      {hasDiscount && (
        <input
          type="number"
          value={item.discountValue ?? 0}
          onChange={e => onUpdate(item.id, { discountValue: parseFloat(e.target.value) || 0 })}
          min={0}
          step={item.discountType === "percentage" ? 1 : 10}
          className="w-14 text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-500"
        />
      )}
    </div>
  );
}

// ─── Add Line Button ──────────────────────────────────────────────────────────

function AddLineButton({ onClick, indent }: { onClick: () => void; indent: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100 ${indent ? "pl-6" : "pl-3"}`}
    >
      <Plus size={11} />
      Add line item
    </button>
  );
}

// ─── Totals Footer ────────────────────────────────────────────────────────────

function TotalsFooter({
  totals, pricingSettings, sections, fmt, colCount,
  showGstCol, readOnly, clientView, showMargin,
}: {
  totals:          ReturnType<typeof computePricingTotals>;
  pricingSettings: ProposalPricingSettings;
  sections:        PricingSection[];
  fmt:             (n: number) => string;
  colCount:        number;
  showGstCol:      boolean;
  readOnly:        boolean;
  clientView:      boolean;
  showMargin:      boolean;
}) {
  const { discountType, discountValue, showDiscount, depositType, depositValue, billingCadence, paymentTerms } = pricingSettings;
  const hasProposalDiscount = discountType && discountValue != null && discountValue > 0;
  const hasDeposit          = depositType && depositValue != null && depositValue > 0;
  const hasSections         = sections.length > 0;

  function TotalRow({ label, value, bold, highlight, small, color }: {
    label: string; value: string; bold?: boolean; highlight?: boolean; small?: boolean; color?: string;
  }) {
    return (
      <div className={`flex items-center justify-between px-4 py-1.5 ${highlight ? "border-t border-gray-200 mt-1 pt-2.5" : ""}`}>
        <span className={`${small ? "text-xs text-gray-400" : "text-sm text-gray-600"} ${color ?? ""}`}>{label}</span>
        <span className={`${small ? "text-xs" : "text-sm"} ${bold ? "font-bold text-gray-900" : "text-gray-700"} ${color ?? ""}`}>{value}</span>
      </div>
    );
  }

  const discountLabel = discountType === "percentage"
    ? `Discount (${discountValue}%)`
    : "Discount";

  return (
    <div className="bg-gray-50 border-t-2 border-gray-200 py-3">
      {/* Show subtotal if there are discounts or GST or sections with subtotals */}
      {(hasProposalDiscount || showGstCol || hasSections) && (
        <TotalRow label="Subtotal" value={fmt(totals.subtotalBeforeDiscount)} />
      )}
      {hasProposalDiscount && showDiscount && (
        <TotalRow label={discountLabel} value={`- ${fmt(totals.proposalDiscountAmount)}`} color="text-green-600" />
      )}
      {hasProposalDiscount && (
        <TotalRow label="After discount" value={fmt(totals.subtotalAfterDiscount)} />
      )}
      {showGstCol && (
        <TotalRow label="GST (10%)" value={fmt(totals.gstAmount)} small />
      )}
      <TotalRow
        label={billingCadence !== "ONE_OFF" ? `Total (${billingCadence === "MONTHLY" ? "monthly" : "quarterly"})` : "Total"}
        value={fmt(totals.grandTotal)}
        bold
        highlight
      />
      {hasDeposit && (
        <TotalRow
          label={depositType === "percentage" ? `Deposit required (${depositValue}%)` : "Deposit required"}
          value={fmt(totals.depositAmount)}
          small
        />
      )}
      {paymentTerms && !clientView && (
        <div className="px-4 pt-1">
          <span className="text-xs text-gray-400">
            Payment due: {paymentTermsLabel(paymentTerms)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Grid layout helper ───────────────────────────────────────────────────────

function buildGridCols(showGstCol: boolean, showMargin: boolean, readOnly: boolean, clientView: boolean): string {
  const cols: string[] = [];
  if (!readOnly && !clientView) cols.push("24px");      // drag handle
  cols.push("1fr");                                      // description
  cols.push("90px");                                     // type
  cols.push("60px");                                     // qty
  cols.push("100px");                                    // unit price
  if (showGstCol)  cols.push("48px");                   // gst
  if (showMargin)  cols.push("72px");                   // margin
  if (clientView)  cols.push("56px");                   // include toggle
  cols.push("96px");                                     // total
  if (!readOnly)   cols.push("32px");                   // delete
  return cols.join(" ");
}
