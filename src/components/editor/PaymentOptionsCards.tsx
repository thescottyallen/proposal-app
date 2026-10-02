"use client";

import type { PaymentChoice, ProposalPricingSettings } from "@/lib/pricing-types";
import {
  computePaymentQuote,
  formatCurrency,
  monthlyOptionLabel,
  offeredPaymentChoices,
  paymentIncludedText,
  projectStageLine,
  upfrontOptionLabel,
} from "@/lib/utils";

interface PaymentOptionsCardsProps {
  settings: ProposalPricingSettings;
  selected?: PaymentChoice | null;
  onSelect?: (choice: PaymentChoice) => void;
}

interface PaymentCard {
  id: PaymentChoice;
  title: string;
  feeLine: string | null;
  stages: string[];
  included: string | null;
  subtotal: number;
  gstAmount: number;
  total: number;
}

export function PaymentOptionsCards({
  settings,
  selected = null,
  onSelect,
}: PaymentOptionsCardsProps) {
  const quote = computePaymentQuote(settings);
  const offered = offeredPaymentChoices(settings);
  const fmt = (amount: number) => formatCurrency(amount, settings.currency, settings.roundingMode);
  const displaySelected =
    selected && offered.includes(selected)
      ? selected
      : onSelect && offered.length === 1
        ? offered[0]
        : null;

  const cards: PaymentCard[] = [];
  if (offered.includes("monthly")) {
    cards.push({
      id: "monthly",
      title: monthlyOptionLabel(quote, fmt),
      feeLine: null,
      stages: [],
      included: paymentIncludedText(settings.paymentMonthlyIncluded),
      subtotal: quote.monthly.subtotal,
      gstAmount: quote.monthly.gstAmount,
      total: quote.monthly.total,
    });
  }
  if (offered.includes("upfront")) {
    cards.push({
      id: "upfront",
      title: upfrontOptionLabel(quote, fmt),
      feeLine: null,
      stages: [],
      included: paymentIncludedText(settings.paymentUpfrontIncluded),
      subtotal: quote.upfront.subtotal,
      gstAmount: quote.upfront.gstAmount,
      total: quote.upfront.total,
    });
  }
  if (offered.includes("project")) {
    cards.push({
      id: "project",
      title: "Project fee",
      feeLine: `${fmt(quote.projectFee)} ex GST`,
      stages: quote.projectStages.map((stage) =>
        projectStageLine(stage, settings.gstEnabled, fmt)
      ),
      included: paymentIncludedText(settings.paymentProjectIncluded),
      subtotal: quote.project.subtotal,
      gstAmount: quote.project.gstAmount,
      total: quote.project.total,
    });
  }

  const gridClass =
    cards.length >= 3
      ? "grid grid-cols-1 lg:grid-cols-3 gap-3"
      : cards.length === 2
        ? "grid grid-cols-1 md:grid-cols-2 gap-3"
        : "grid grid-cols-1 gap-3";

  return (
    <div className={gridClass}>
      {cards.map((card) => {
        const isSelected = displaySelected === card.id;
        const className = `w-full text-left rounded-lg border px-4 py-4 transition-colors ${
          isSelected
            ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
            : "border-gray-200 bg-white hover:border-gray-300"
        } ${onSelect ? "cursor-pointer" : ""}`;
        const body = (
          <span className="flex items-start gap-3">
            {cards.length > 1 && (
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  isSelected ? "border-blue-600" : "border-gray-300"
                }`}
                aria-hidden
              >
                {isSelected && <span className="h-2 w-2 rounded-full bg-blue-600" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 leading-snug">{card.title}</span>
              {card.feeLine && (
                <span className="mt-1 block text-sm text-gray-900" data-testid="payment-project-fee-line">
                  {card.feeLine}
                </span>
              )}
              {card.stages.length > 0 && (
                <span className="mt-2 block space-y-1" data-testid="payment-project-stages">
                  {card.stages.map((line) => (
                    <span key={line} className="block text-sm text-gray-700">{line}</span>
                  ))}
                </span>
              )}
              {card.included && (
                <span className="mt-1 block text-sm font-normal text-gray-600 leading-snug">{card.included}</span>
              )}
              <span className="mt-3 block space-y-1">
                <AmountRow label="Subtotal" value={fmt(card.subtotal)} />
                {settings.gstEnabled && (
                  <AmountRow label="GST (10%)" value={fmt(card.gstAmount)} muted />
                )}
                <AmountRow label="Total" value={fmt(card.total)} bold />
              </span>
            </span>
          </span>
        );

        if (!onSelect) {
          return (
            <div key={card.id} className={className} data-testid={`payment-option-${card.id}`}>
              {body}
            </div>
          );
        }

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            aria-pressed={isSelected}
            data-testid={`payment-option-${card.id}`}
            className={className}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function AmountRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <span className={`flex items-center justify-between gap-4 ${bold ? "border-t border-gray-200 pt-1.5 mt-1.5" : ""}`}>
      <span className={muted ? "text-xs text-gray-400" : "text-sm text-gray-600"}>{label}</span>
      <span className={bold ? "text-sm font-semibold text-gray-900" : muted ? "text-xs text-gray-500" : "text-sm text-gray-700"}>
        {value}
      </span>
    </span>
  );
}
