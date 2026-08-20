"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Calculator, FileCheck, X } from "lucide-react";
import { LeadCaptureForm } from "@/components/lead-capture/LeadCaptureForm";
import { getExitIntentLeadMagnets } from "@/lib/lead-magnets/page-tailoring";
import { trackMarketingEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

const SESSION_KEY = "capveri_exit_intent_seen";
const DISMISSED_KEY = "capveri_exit_intent_dismissed_at";
const CONVERTED_KEY = "capveri_exit_intent_converted";
const EXIT_INTENT_ENABLED = false;
const DISMISS_COOLDOWN_DAYS = 14;
const EXIT_Y_THRESHOLD = 8;
const MOBILE_MIN_SCROLL = 600;
const MOBILE_SCROLL_UP_DELTA = 80;
const resourceDeliveryCopy = "We'll send the selected resource to your inbox.";

const EXCLUDED_PATHS = ["/unsubscribe", "/privacy", "/terms"];
const RESULT_FIRST_TOOL_PATHS = ["/tools/cam-billing-error-estimator"];

function isExcludedPath(pathname: string): boolean {
  return (
    EXCLUDED_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ) ||
    RESULT_FIRST_TOOL_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ) || /^\/tools\/[^/]+\/thank-you\/?$/.test(pathname)
  );
}

function isDismissedRecently(value: string | null): boolean {
  if (!value) return false;
  const dismissedAt = Number(value);
  if (!Number.isFinite(dismissedAt)) return false;
  const cooldownMs = DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt < cooldownMs;
}

function getIcon(slug: string) {
  if (slug.includes("calculator")) return Calculator;
  if (slug.includes("matrix")) return BookOpen;
  return FileCheck;
}

export function LeadMagnetExitIntentPopup({
  enabled = EXIT_INTENT_ENABLED,
}: {
  enabled?: boolean;
} = {}) {
  const pathname = usePathname();
  const resources = useMemo(
    () => getExitIntentLeadMagnets(pathname ?? "/"),
    [pathname],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState(resources[0].slug);
  // Tracks the pathname the current selection was defaulted from, so a route
  // change re-defaults the selection to that page's tailored primary. This is
  // React's recommended "adjust state during render" pattern, which avoids a
  // setState-in-effect and the extra render pass it would cost.
  const [tailoredFor, setTailoredFor] = useState(pathname);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lastScrollYRef = useRef(0);
  // Keep the latest selection readable from the exit-intent listeners without
  // making them a dependency. Otherwise every radio change tears down and
  // re-arms the mouseout/scroll handlers.
  const selectedSlugRef = useRef(selectedSlug);

  if (tailoredFor !== pathname) {
    setTailoredFor(pathname);
    setSelectedSlug(resources[0].slug);
  }

  useEffect(() => {
    selectedSlugRef.current = selectedSlug;
  }, [selectedSlug]);

  const selectedResource =
    resources.find((resource) => resource.slug === selectedSlug) ??
    resources[0];

  const dismiss = useCallback(
    (method: string) => {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      setIsOpen(false);
      trackMarketingEvent("exit_intent_popup_dismiss", {
        method,
        slug: selectedSlug,
      });
    },
    [selectedSlug],
  );

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (isExcludedPath(window.location.pathname)) return;
    if (document.querySelector("[data-lead-capture-active='true']")) return;

    const storage = window.localStorage;
    if (window.sessionStorage.getItem(SESSION_KEY) === "true") return;
    if (storage.getItem(CONVERTED_KEY) === "true") return;
    if (isDismissedRecently(storage.getItem(DISMISSED_KEY))) return;

    const openPopup = () => {
      window.sessionStorage.setItem(SESSION_KEY, "true");
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setIsOpen(true);
      trackMarketingEvent("exit_intent_popup_view", {
        default_slug: selectedSlugRef.current,
      });
    };

    const onMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget !== null) return;
      if (event.clientY > EXIT_Y_THRESHOLD) return;
      openPopup();
    };

    const onScroll = () => {
      const currentY = window.scrollY;
      const scrolledEnough = currentY > MOBILE_MIN_SCROLL;
      const scrollingUp =
        lastScrollYRef.current - currentY > MOBILE_SCROLL_UP_DELTA;
      lastScrollYRef.current = currentY;
      if (window.innerWidth >= 768 || !scrolledEnough || !scrollingUp) return;
      openPopup();
    };

    lastScrollYRef.current = window.scrollY;
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
    // Intentionally arm once on mount: the listeners read the live selection via
    // selectedSlugRef, so they never need to re-bind on selection changes.
  }, [enabled]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const getFocusableElements = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(","),
        ) ?? [],
      );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss("escape");
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [dismiss, isOpen]);

  const onSuccess = () => {
    window.localStorage.setItem(CONVERTED_KEY, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss("outside");
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-intent-title"
        aria-describedby="exit-intent-description"
        className="relative grid max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl md:max-w-2xl md:grid-cols-[3fr_2fr]"
        data-lead-capture-active="true"
      >
        {/* Close button - first in DOM so focus-trap wraps correctly */}
        <button
          ref={closeButtonRef}
          type="button"
          className="absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Dismiss"
          onClick={() => dismiss("close_button")}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left panel - dark, resource picker */}
        <div className="bg-slate-950 p-6 text-white md:p-8 md:rounded-l-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">
            Free resource
          </p>
          <h2
            id="exit-intent-title"
            className="mt-3 text-2xl font-semibold leading-tight md:text-[1.6rem]"
          >
            Before you go, grab a free CAM tool.
          </h2>
          <p
            id="exit-intent-description"
            className="mt-2.5 text-base leading-6 text-slate-300 sm:text-sm"
          >
            Pick the one that fits what you&apos;re reviewing next.
          </p>

          <fieldset className="mt-5 space-y-2.5">
            <legend className="sr-only">Choose a free resource</legend>
            {resources.map((resource) => {
              const Icon = getIcon(resource.slug);
              const isSelected = resource.slug === selectedSlug;
              return (
                <label
                  key={resource.slug}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer gap-3 rounded-xl border p-3 transition",
                    isSelected
                      ? "border-teal-300 bg-teal-300/15"
                      : "border-white/15 bg-white/5 hover:border-white/30",
                  )}
                >
                  <input
                    type="radio"
                    name="exit-intent-resource"
                    value={resource.slug}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedSlug(resource.slug);
                      trackMarketingEvent("exit_intent_popup_resource_select", {
                        slug: resource.slug,
                      });
                    }}
                    className="mt-1 h-4 w-4 accent-teal-300"
                  />
                  <span className="flex min-w-0 gap-2.5">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">
                        {resource.name}
                        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-100">
                          {resource.format}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm leading-5 text-slate-400 sm:text-xs">
                        {resource.promise}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>

        {/* Right panel - light, email capture */}
        <div className="flex flex-col justify-center p-6 md:p-8 md:pt-14">
          <p className="text-base font-medium text-muted-foreground sm:text-sm">
            Sending you the{" "}
            <span className="font-semibold text-foreground">
              {selectedResource.name}
            </span>
          </p>

          <div className="mt-4">
            <LeadCaptureForm
              assetSlug={selectedSlug}
              ctaLabel="Send Me the Resource"
              source="exit_intent_popup"
              onSuccess={onSuccess}
              emailOnly
            />
          </div>

          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center justify-center self-center rounded-full px-3 text-sm text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => dismiss("maybe_later")}
          >
            Maybe later
          </button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {resourceDeliveryCopy}
          </p>
        </div>
      </section>
    </div>
  );
}
