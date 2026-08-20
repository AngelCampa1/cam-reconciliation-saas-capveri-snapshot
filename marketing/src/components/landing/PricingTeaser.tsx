"use client";

import { useRef } from "react";
import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildTrialLink } from "@/lib/auditLink";
import { trackMarketingEvent } from "@/lib/posthog";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";
import {
  FEATURES,
  TIERS,
  TRIAL_DAYS,
  getAnnualTotal,
  getFeaturesForTier,
} from "@/config/plans";
import {
  LAUNCH_OFFER,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  isLaunchOfferLive,
} from "@/config/launch-offer";
import { publicKnowledge } from "@/generated/public-knowledge";

export interface PricingTeaserProps {
  className?: string;
}

export function PricingTeaser({ className }: PricingTeaserProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  const tier = TIERS.find((item) => item.id === "reconcile");
  const tierId = "reconcile";
  const featureKeys = getFeaturesForTier(tierId);
  const features = FEATURES.filter((feature) =>
    featureKeys.includes(feature.key),
  );
  const price = getAnnualTotal(tierId, 25);
  const launchPrice = getLaunchOfferPrice(tierId, 25);

  return (
    <section
      ref={sectionRef}
      className={cn("bg-muted py-12 sm:py-16 lg:py-20", className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 sm:mb-12 max-w-2xl text-center">
          <Badge
            variant="default"
            className="mb-4 bg-primary text-primary-foreground"
          >
            {TRIAL_DAYS}-day free trial
          </Badge>
          <h2 className="mb-4 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            One plan, priced by your units.
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            {publicKnowledge.pricing.display.selfServeSummary}
          </p>
        </div>

        <Card className="mx-auto max-w-3xl shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {tier?.name ?? "Reconcile"}
            </CardTitle>
            <div>
              <p className="text-sm font-medium text-muted-foreground line-through">
                ${price?.toLocaleString()}/yr
              </p>
              <p className="text-3xl font-bold text-foreground">
                $
                {launchPrice == null
                  ? "Custom"
                  : formatLaunchOfferPrice(launchPrice)}
                /yr
              </p>
              <p className="text-sm font-semibold text-primary">
                Limited time offer: {LAUNCH_OFFER.label} with{" "}
                {LAUNCH_OFFER.code}.
                {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                  ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                  : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Then ${price?.toLocaleString()}/yr after the first year.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Minimum subscription includes up to 25 rentable units. Use the
              pricing page calculator for more units.
            </p>
            <p className="text-sm text-muted-foreground">
              {publicKnowledge.claims.byId["money-back-guarantee"].wording}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="space-y-3">
              {features.slice(0, 5).map((feature) => (
                <li key={feature.key} className="flex items-center gap-3">
                  <Check
                    className="h-5 w-5 flex-shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{feature.label}</span>
                </li>
              ))}
            </ul>

            <Button asChild className="w-full">
              <a
                href={buildTrialLink({
                  content: "pricing_teaser_reconcile",
                  plan: tierId,
                  units: 25,
                  offer: LAUNCH_OFFER.code,
                })}
                onClick={() =>
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Start free trial",
                    location: "pricing_teaser",
                    plan: tierId,
                    unit_count: 25,
                  })
                }
              >
                Start free trial
              </a>
            </Button>
          </CardContent>
        </Card>

        <div className="mt-10 text-center">
          <Link
            href="/pricing"
            className="inline-flex min-h-[44px] items-center px-3 py-2.5 text-primary hover:underline"
          >
            See full pricing
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
