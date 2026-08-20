"use client";

import { useEffect, useState } from "react";
import { LAUNCH_OFFER } from "@/config/launch-offer";
import { marketingApiUrl } from "@/lib/api";

const POLL_INTERVAL_MS = 60_000;

export interface LaunchPhaseData {
  code: string | null;
  label: string | null;
  discount_percent: number | null;
  times_redeemed: number;
  max_redemptions: number;
  phase_index: number;
  all_exhausted: boolean;
  ends_at: string | null;
  ends_at_display: string | null;
}

function fallbackPhase(): LaunchPhaseData {
  return {
    code: LAUNCH_OFFER.code,
    label: LAUNCH_OFFER.label,
    discount_percent: LAUNCH_OFFER.discountPercent,
    times_redeemed: 0,
    max_redemptions: LAUNCH_OFFER.maxRedemptions,
    phase_index: 1,
    all_exhausted: false,
    ends_at: LAUNCH_OFFER.endsAt,
    ends_at_display: LAUNCH_OFFER.endsAtDisplay,
  };
}

async function fetchActiveLaunchPhase(): Promise<LaunchPhaseData> {
  const res = await fetch(
    marketingApiUrl("/api/v1/billing/launch-offer/active"),
    {
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

export function useActiveLaunchPhase(): LaunchPhaseData {
  const [phase, setPhase] = useState<LaunchPhaseData>(fallbackPhase());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchActiveLaunchPhase();
        if (!cancelled) setPhase(data);
      } catch {
        // keep fallback
      }
    }
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return phase;
}
