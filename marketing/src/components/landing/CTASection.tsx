"use client";

import { useRef } from "react";
import {
  ArrowRight,
  CheckCircle,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { trackMarketingEvent } from "@/lib/posthog";

const trustIndicators = [
  { icon: FileSpreadsheet, text: "Works with existing ERP exports" },
  { icon: CheckCircle, text: "Deterministic CAM calculations" },
  { icon: ShieldCheck, text: "Tenant-ready support packet" },
];

export interface CTASectionProps {
  className?: string;
}

export function CTASection({ className }: CTASectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "relative overflow-hidden bg-primary py-12 pb-24 sm:py-16 sm:pb-24 lg:py-20 lg:pb-24 text-primary-foreground",
        className,
      )}
    >
      <div className="absolute inset-0 bg-pattern-grid opacity-[0.06]" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl sm:text-4xl font-bold tracking-tight">
            Run one CAM file before your next billing.
          </h2>
          <p className="mb-10 text-base sm:text-lg leading-7 sm:leading-8 text-primary-foreground/90">
            Upload your GL, rent roll, and lease files. Map the recovery terms.
            Review the math before anything goes to tenants. You see where you
            under-billed and where you over-billed. You also see what proof
            belongs in the packet.
          </p>

          <div className="flex flex-col items-center gap-3">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="w-full text-base sm:w-auto sm:min-w-[260px]"
            >
              <a
                href={buildTrialLink({ content: "cta_homepage" })}
                onClick={() =>
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Start free trial",
                    location: "bottom_cta",
                  })
                }
              >
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
            {trustIndicators.map((indicator) => (
              <div
                key={indicator.text}
                className="flex items-center gap-2 text-sm text-primary-foreground/85"
              >
                <indicator.icon className="h-5 w-5" aria-hidden="true" />
                <span>{indicator.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
