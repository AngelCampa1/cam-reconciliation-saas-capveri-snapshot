"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { getMarketingContext, getSafeMarketingPageSearch } from "@/lib/posthog";

const CAPVERI_POSTHOG_KEY = "phc_REPLACE_WITH_POSTHOG_PROJECT_KEY";

// Initialise PostHog synchronously at module scope so the provider mounts with a
// ready client. The 'use client' directive ensures this only runs in browsers.
if (typeof window !== "undefined") {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || CAPVERI_POSTHOG_KEY;
  if (key && !posthog.__loaded) {
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: false,
      autocapture: true,
      rageclick: true,
      mask_all_element_attributes: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector:
          '[data-ph-mask], [data-sensitive], .ph-mask, input, textarea, [contenteditable="true"]',
        blockSelector: "[data-ph-block], .ph-no-capture",
      },
      defaults: "2025-05-24",
    });
  }
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthog.__loaded) return;

    const search = searchParams.toString();
    posthog.capture("$pageview", {
      ...getMarketingContext(),
      page_path: pathname,
      page_search: getSafeMarketingPageSearch(search),
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
