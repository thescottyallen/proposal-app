"use client";

import { useCallback, useState } from "react";
import { PricingTable } from "./PricingTable";
import { PricingSettingsPanel } from "./PricingSettingsPanel";
import { fetchAudPerUsd } from "@/lib/utils";
import type { PricingBlock } from "@/lib/proposal-document";
import type {
  ProposalPricingData,
  ProposalPricingSettings,
} from "@/lib/pricing-types";

interface PricingBlockEditorProps {
  block: PricingBlock;
  onChange: (
    pricingData: ProposalPricingData,
    pricingSettings: ProposalPricingSettings
  ) => void;
  readOnly?: boolean;
  clientView?: boolean;
  gstRegistered?: boolean;
  onClientIncludedChange?: (itemId: string, included: boolean) => void;
  onSelectOption?: (itemId: string) => void;
  backgroundColor?: string;
}

export function PricingBlockEditor({
  block,
  onChange,
  readOnly = false,
  clientView = false,
  gstRegistered = false,
  onClientIncludedChange,
  onSelectOption,
  backgroundColor,
}: PricingBlockEditorProps) {
  const [fetchingRate, setFetchingRate] = useState(false);

  const handleDataChange = useCallback(
    (data: ProposalPricingData) => {
      onChange(data, block.pricingSettings);
    },
    [block.pricingSettings, onChange]
  );

  const handleSettingsChange = useCallback(
    (settings: ProposalPricingSettings) => {
      onChange(block.pricingData, settings);
    },
    [block.pricingData, onChange]
  );

  const handleFetchExchangeRate = useCallback(async () => {
    setFetchingRate(true);
    try {
      const rate = await fetchAudPerUsd();
      onChange(block.pricingData, {
        ...block.pricingSettings,
        exchangeRate: rate,
      });
    } catch {
      console.error("Failed to fetch exchange rate");
    } finally {
      setFetchingRate(false);
    }
  }, [block.pricingData, block.pricingSettings, onChange]);

  return (
    <div
      className="rounded-lg border border-gray-200 shadow-sm"
      style={{ backgroundColor: backgroundColor || "#ffffff" }}
    >
      <div className="px-6 py-5">
        {clientView &&
          (block.pricingSettings.optionsMode ||
            block.pricingData.items.some((i) => i.isOptional)) && (
            <p className="text-xs text-gray-400 mb-4">
              {block.pricingSettings.optionsMode
                ? "Choose one of the options below before accepting."
                : "Optional items can be included or excluded before accepting."}
            </p>
          )}
        <PricingTable
          pricingData={block.pricingData}
          pricingSettings={block.pricingSettings}
          onChange={handleDataChange}
          onClientIncludedChange={onClientIncludedChange}
          onSelectOption={onSelectOption}
          readOnly={readOnly}
          clientView={clientView}
        />
        {!readOnly && !clientView && (
          <PricingSettingsPanel
            settings={block.pricingSettings}
            onChange={handleSettingsChange}
            gstRegistered={gstRegistered}
            onFetchExchangeRate={handleFetchExchangeRate}
            fetchingRate={fetchingRate}
          />
        )}
        {clientView && block.pricingSettings.latePaymentClause && (
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
            {block.pricingSettings.latePaymentClause}
          </p>
        )}
      </div>
    </div>
  );
}
