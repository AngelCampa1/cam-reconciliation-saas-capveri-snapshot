"use client";

import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { cn } from "@/lib/utils";
import { TRIAL_DAYS } from "@/config/plans";
import { publicKnowledge } from "@/generated/public-knowledge";
import { trackMarketingEvent } from "@/lib/posthog";

function featureName(key: string): string {
  return (
    publicKnowledge.productFeatures.find((feature) => feature.key === key)
      ?.name ?? key
  );
}

const checklist = [
  "Full access to every feature in the self-serve subscription",
  featureName("ingestion-csv-excel"),
  featureName("deterministic-calc-engine"),
  featureName("lease-ai-with-review"),
  featureName("multi-format-exports"),
  publicKnowledge.pricing.display.selfServeSummary,
  publicKnowledge.pricing.display.trialCopy,
];

export interface FreeAuditClaritySectionProps {
  className?: string;
}

export function FreeAuditClaritySection({
  className,
}: FreeAuditClaritySectionProps) {
  return (
    <section
      className={cn(
        "py-16 bg-gradient-to-br from-primary/5 to-primary/10 border-y border-primary/10",
        className,
      )}
      aria-labelledby="free-trial-heading"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="free-trial-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl mb-2"
          >
            What&apos;s included in your {TRIAL_DAYS}-day free trial
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground mb-8">
            Full platform access. No feature restrictions during your trial.
          </p>

          <ul className="text-left space-y-3 mb-8">
            {checklist.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="text-base text-foreground">{item}</span>
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="w-full sm:w-auto">
            <a
              href={buildTrialLink({ content: "free_trial_clarity" })}
              onClick={() =>
                trackMarketingEvent("cta_clicked", {
                  button_text: "Start free trial",
                  location: "free_trial_clarity",
                })
              }
            >
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
