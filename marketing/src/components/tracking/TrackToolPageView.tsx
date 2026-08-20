"use client";

import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/posthog";

export function TrackToolPageView({ slug }: { slug: string }) {
  useEffect(() => {
    trackMarketingEvent("tool_page_view", { slug });
  }, [slug]);
  return null;
}
