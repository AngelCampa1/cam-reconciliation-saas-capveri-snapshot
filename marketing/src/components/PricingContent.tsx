"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ShieldCheck,
  Clock,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { buildTrialLink } from "@/lib/auditLink";
import { trackMarketingEvent } from "@/lib/posthog";
import {
  FEATURES,
  TIERS,
  getAnnualTotal,
  getFeaturesForTier,
  type TierId,
} from "@/config/plans";
import {
  LAUNCH_OFFER,
  formatLaunchOfferPrice,
  getLaunchOfferPriceForPercent,
} from "@/config/launch-offer";
import { useActiveLaunchPhase } from "@/lib/launch-phase";
import { LaunchOfferProgress } from "@/components/LaunchOfferProgress";
import { PRICING_FAQS } from "@/data/pricing-faqs";
import { publicKnowledge } from "@/generated/public-knowledge";

const SLIDER_MAX_UNITS = 5000;
const UNIT_BANDS = [
  { min: 1, max: 25, label: "1-25 units: $4,990/year minimum" },
  { min: 26, max: 150, label: "26-150 units: $179 per extra unit/year" },
  { min: 151, max: 500, label: "151-500 units: $169 per extra unit/year" },
  { min: 501, max: 2500, label: "501-2,500 units: $159 per extra unit/year" },
  {
    min: 2501,
    max: Number.POSITIVE_INFINITY,
    label: "2,501+ units: $149 per extra unit/year",
  },
] as const;

function formatListPrice(tierId: TierId, unitCount: number) {
  const total = getAnnualTotal(tierId, unitCount);
  if (total == null) return "Published pricing";
  return `$${total.toLocaleString()}/yr`;
}

function formatLaunchPrice(
  tierId: TierId,
  discountPct: number,
  unitCount: number,
) {
  const launchPrice = getLaunchOfferPriceForPercent(
    tierId,
    discountPct,
    unitCount,
  );
  if (launchPrice == null) return "Published pricing";
  return `$${formatLaunchOfferPrice(launchPrice)}/yr`;
}

const COLLAPSED_FEATURE_COUNT = 9;
const GUARANTEE_FAQ_INDEX = PRICING_FAQS.findIndex((faq) =>
  faq.answer.toLowerCase().includes("refund"),
);

function TierFeatureList({ tierId }: { tierId: TierId }) {
  const [showAll, setShowAll] = useState(false);
  const featureKeys = getFeaturesForTier(tierId);
  const features = FEATURES.filter((feature) =>
    featureKeys.includes(feature.key),
  );
  const visibleFeatures = showAll
    ? features
    : features.slice(0, COLLAPSED_FEATURE_COUNT);
  const hiddenCount = features.length - COLLAPSED_FEATURE_COUNT;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {visibleFeatures.map((feature) => (
          <li
            key={feature.key}
            className="flex items-center gap-2 text-base sm:text-sm"
          >
            <Check className="h-4 w-4 flex-shrink-0 text-success" />
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="min-h-[44px] px-0 text-sm font-medium text-primary hover:bg-transparent hover:text-primary/80"
        >
          {showAll
            ? "See fewer features"
            : `See all ${features.length} features`}
          <ChevronDown
            className={cn(
              "ml-1 h-4 w-4 transition-transform duration-200",
              showAll && "rotate-180",
            )}
            aria-hidden="true"
          />
        </Button>
      ) : null}
    </div>
  );
}

export function PricingContent() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [unitCount, setUnitCount] = useState(25);
  const reconcileTier = TIERS.find((tier) => tier.id === "reconcile");
  const tierId: TierId = "reconcile";

  const activePhase = useActiveLaunchPhase();
  const hasActiveOffer =
    !activePhase.all_exhausted &&
    activePhase.code !== null &&
    activePhase.discount_percent !== null;
  const discountPct = hasActiveOffer ? activePhase.discount_percent : null;
  const activeCode = hasActiveOffer ? activePhase.code : null;
  const activeLabel = hasActiveOffer
    ? (activePhase.label ?? LAUNCH_OFFER.label)
    : null;
  const activeEndsDisplay = hasActiveOffer
    ? (activePhase.ends_at_display ?? LAUNCH_OFFER.endsAtDisplay)
    : null;
  const listPrice = formatListPrice(tierId, unitCount);
  const activePrice =
    discountPct === null
      ? listPrice
      : formatLaunchPrice(tierId, discountPct, unitCount);
  const moneyBackGuarantee =
    publicKnowledge.claims.byId["money-back-guarantee"].wording;

  useEffect(() => {
    trackMarketingEvent("pricing_viewed");
  }, []);

  useEffect(() => {
    const openGuaranteeFaqFromHash = () => {
      if (
        window.location.hash === "#money-back-guarantee" &&
        GUARANTEE_FAQ_INDEX >= 0
      ) {
        setOpenFaqIndex(GUARANTEE_FAQ_INDEX);
      }
    };

    openGuaranteeFaqFromHash();
    window.addEventListener("hashchange", openGuaranteeFaqFromHash);

    return () => {
      window.removeEventListener("hashchange", openGuaranteeFaqFromHash);
    };
  }, []);

  return (
    <div className="container mx-auto px-4 py-16 pb-24 sm:px-6 lg:px-8">
      <div className="mb-10 text-center">
        <h1 className="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
          Start free. Pay only when you keep it.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Start with one building. Test it on your own files. Add more when you
          are ready. CapVeri checks your CAM math before tenants get billed.
          Keep your current property system.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          <Link
            href="/roi"
            className="font-medium text-primary hover:text-primary/80"
          >
            See what CapVeri could find for your building.
          </Link>
        </p>
        {activeCode && activeLabel ? (
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-primary">
            Limited time offer: {activeLabel} with {activeCode}.
            {activeEndsDisplay ? ` Offer ends ${activeEndsDisplay}.` : ""}
          </p>
        ) : null}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          {hasActiveOffer
            ? publicKnowledge.marketingInfra.pricingArtifacts.notes[0]
            : "30-day free trial. No credit card required to start."}
        </p>
      </div>

      {/* Irresistible offer block */}
      <div className="mx-auto mb-8 max-w-2xl rounded-lg border border-primary/20 bg-primary/5 p-6 space-y-4">
        <h2 className="text-center text-lg font-bold text-foreground">
          What happens during the free trial
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base sm:text-sm">
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-success flex-shrink-0" />
            <span>{publicKnowledge.claims.byId["trial-no-card"].wording}</span>
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success flex-shrink-0" />
            <span>Add billing only when you decide to keep access.</span>
          </li>
          <li className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-success flex-shrink-0" />
            <span>Add annual billing before the trial ends.</span>
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success flex-shrink-0" />
            <span>{moneyBackGuarantee}</span>
          </li>
        </ul>
        <LaunchOfferProgress />
      </div>

      <Card className="mx-auto max-w-5xl shadow-sm">
        <CardHeader>
          <CardTitle>{reconcileTier?.name ?? "Reconcile"}</CardTitle>
          <p className="text-base text-muted-foreground sm:text-sm">
            {reconcileTier?.description}
          </p>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-6">
            <div>
              {discountPct !== null ? (
                <p className="text-sm font-medium text-muted-foreground line-through">
                  {listPrice}
                </p>
              ) : null}
              <p className="text-4xl font-bold">{activePrice}</p>
              {activeCode ? (
                <>
                  <p className="text-sm font-semibold text-primary">
                    Limited time offer: {activeLabel} with {activeCode}.
                    {activeEndsDisplay
                      ? ` Offer ends ${activeEndsDisplay}.`
                      : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Then {listPrice} after the first year.
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-muted-foreground">
                  Annual plan
                </p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                Minimum subscription: $4,990/year for up to 25 rentable units.
              </p>
            </div>
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <Label htmlFor="pricing-unit-count">Rentable units</Label>
                  <p className="text-sm text-muted-foreground">
                    Slide or type the count.
                  </p>
                </div>
                <Input
                  id="pricing-unit-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={unitCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value || "1");
                    const safeValue = Number.isFinite(nextValue)
                      ? Math.trunc(nextValue)
                      : 1;
                    setUnitCount(Math.max(safeValue, 1));
                  }}
                  className="w-full sm:w-40"
                />
              </div>
              <Slider
                min={1}
                max={SLIDER_MAX_UNITS}
                step={1}
                value={[Math.min(unitCount, SLIDER_MAX_UNITS)]}
                onValueChange={([value]) => setUnitCount(value ?? 1)}
                aria-label="Rentable units"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>5,000+</span>
              </div>
            </div>
            <Button asChild size="lg" className="w-full">
              <a
                href={buildTrialLink({
                  content: "pricing_reconcile_cta",
                  plan: tierId,
                  units: unitCount,
                  offer: activeCode,
                })}
                onClick={() =>
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Start free trial",
                    location: "pricing",
                    plan: tierId,
                    unit_count: unitCount,
                  })
                }
              >
                Start free trial
              </a>
            </Button>
          </div>
          <div className="space-y-5">
            <div className="rounded-lg border bg-background p-4">
              <p className="font-medium">
                {publicKnowledge.claims.byId["money-back-guarantee"].wording
                  .split(".")[0]
                  ?.replace("Reconcile has a ", "")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {moneyBackGuarantee}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="font-medium">Annual unit bands</p>
              <ul className="mt-3 space-y-1 text-sm">
                {UNIT_BANDS.map((band) => {
                  const isActive =
                    unitCount >= band.min && unitCount <= band.max;
                  return (
                    <li
                      key={band.label}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "rounded-md px-2 py-1",
                        isActive
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {band.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <TierFeatureList tierId={tierId} />
          </div>
        </CardContent>
      </Card>

      <Card className="mx-auto mt-8 max-w-4xl shadow-sm">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-muted-foreground sm:text-sm">
            Ready to check your first CAM statement? Start on your own data.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link
                href="#money-back-guarantee"
                onClick={() => {
                  if (GUARANTEE_FAQ_INDEX >= 0) {
                    setOpenFaqIndex(GUARANTEE_FAQ_INDEX);
                  }
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Read guarantee",
                    location: "pricing_self_serve",
                    plan: tierId,
                  });
                }}
              >
                Read guarantee
              </Link>
            </Button>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link
                href={buildTrialLink({
                  source: "pricing_page",
                  content: "pricing_self_serve_cta",
                })}
                onClick={() =>
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Start free trial",
                    location: "pricing_self_serve",
                    plan: tierId,
                  })
                }
              >
                Start free trial
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <section id="pricing-faq" className="mt-16 max-w-3xl mx-auto">
        <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl lg:text-4xl">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-border/50 rounded-lg border border-border/50 px-6">
          {PRICING_FAQS.map((faq, index) => {
            const panelId = `faq-panel-${index}`;
            const triggerId = `faq-trigger-${index}`;
            const isGuaranteeFaq = index === GUARANTEE_FAQ_INDEX;
            return (
              <div
                key={faq.question}
                id={isGuaranteeFaq ? "money-back-guarantee" : undefined}
                className="border-b border-border last:border-0"
              >
                <button
                  id={triggerId}
                  type="button"
                  onClick={() =>
                    setOpenFaqIndex(openFaqIndex === index ? null : index)
                  }
                  className="flex w-full items-center justify-between py-5 text-left text-base font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-expanded={openFaqIndex === index}
                  aria-controls={panelId}
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={cn(
                      "ml-4 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                      openFaqIndex === index && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  inert={openFaqIndex !== index}
                  className={cn(
                    "grid transition-all duration-200 ease-out",
                    openFaqIndex === index
                      ? "grid-rows-[1fr]"
                      : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pb-5 text-base leading-relaxed text-muted-foreground sm:text-sm">
                      {faq.answer}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <p className="mb-4 text-muted-foreground">Still have questions?</p>
          <Button variant="outline" asChild>
            <Link href="/contact">Contact support</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
