"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CapVeriDemoFrame,
  ReconciliationDashboardMock,
} from "@/components/product-demo";
import { buildTrialLink } from "@/lib/auditLink";
import { cn } from "@/lib/utils";
import { trackMarketingEvent } from "@/lib/posthog";

export interface HeroSectionProps {
  className?: string;
}

export function HeroSection({ className }: HeroSectionProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden bg-background pt-20 pb-16 sm:pt-24 lg:pt-28",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-border" />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:gap-14">
          <div className="max-w-3xl">
            <p className="mb-5 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
              CAM reconciliation software for commercial property teams
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Bill CAM correctly before statements go to tenants.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              CapVeri reads your GL, rent roll, billed amounts, and lease terms.
              It flags where you over-billed and where you under-billed. You fix
              both before the packet reaches tenants. Keep Yardi, MRI, or your
              current system. Just upload a file you export.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full text-base sm:w-auto">
                <a
                  href={buildTrialLink({ content: "hero_clarity" })}
                  onClick={() =>
                    trackMarketingEvent("cta_clicked", {
                      button_text: "Start free trial",
                      location: "hero_primary",
                    })
                  }
                >
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full text-base sm:w-auto"
              >
                <a
                  href="#how-it-works"
                  onClick={() =>
                    trackMarketingEvent("cta_clicked", {
                      button_text: "See the workflow",
                      location: "hero_secondary",
                    })
                  }
                >
                  See the workflow
                </a>
              </Button>
            </div>

            <p className="mt-3 flex flex-wrap items-center justify-start gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-start">
              <span className="flex items-center gap-1">
                <ShieldCheck
                  className="h-3 w-3 text-success"
                  aria-hidden="true"
                />{" "}
                30-day trial
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck
                  className="h-3 w-3 text-success"
                  aria-hidden="true"
                />{" "}
                No credit card
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck
                  className="h-3 w-3 text-success"
                  aria-hidden="true"
                />{" "}
                No integration needed
              </span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Start with one live building or sample data. Add billing before
              the trial ends to keep access.
            </p>
          </div>

          <CapVeriDemoFrame className="lg:translate-y-4">
            <ReconciliationDashboardMock />
          </CapVeriDemoFrame>
        </div>
      </div>
    </section>
  );
}
