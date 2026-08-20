import { useCallback, useRef } from "react";
import { trackMarketingEvent } from "@/lib/posthog";

export type ToolType = "calculator";

export type AnnualCamBucket =
  | "unknown"
  | "under_10k"
  | "10k_49k"
  | "50k_99k"
  | "100k_249k"
  | "250k_999k"
  | "1m_plus";

export type LeasedSquareFeetBucket =
  | "unknown"
  | "under_5k"
  | "5k_9k"
  | "10k_24k"
  | "25k_49k"
  | "50k_99k"
  | "100k_plus";

export type ToolResultViewedProperties = {
  slug: string;
  tool_type: ToolType;
  has_cap?: boolean;
  annual_cam_bucket?: AnnualCamBucket;
  leased_sf_bucket?: LeasedSquareFeetBucket;
};

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function getAnnualCamBucket(value: number): AnnualCamBucket {
  if (!isPositiveFiniteNumber(value)) return "unknown";
  if (value < 10_000) return "under_10k";
  if (value < 50_000) return "10k_49k";
  if (value < 100_000) return "50k_99k";
  if (value < 250_000) return "100k_249k";
  if (value < 1_000_000) return "250k_999k";
  return "1m_plus";
}

export function getLeasedSquareFeetBucket(
  value: number,
): LeasedSquareFeetBucket {
  if (!isPositiveFiniteNumber(value)) return "unknown";
  if (value < 5_000) return "under_5k";
  if (value < 10_000) return "5k_9k";
  if (value < 25_000) return "10k_24k";
  if (value < 50_000) return "25k_49k";
  if (value < 100_000) return "50k_99k";
  return "100k_plus";
}

export function useTrackToolResultViewedOnce() {
  const hasTrackedResult = useRef(false);

  return useCallback((properties: ToolResultViewedProperties) => {
    if (hasTrackedResult.current) return;
    hasTrackedResult.current = true;
    trackMarketingEvent("tool_result_viewed", properties);
  }, []);
}
