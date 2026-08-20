"use client";

import { useRef } from "react";
import {
  ArrowRight,
  Calculator,
  FileKey2,
  PackageCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const steps = [
  {
    number: 1,
    icon: Upload,
    title: "Upload the source files",
    description:
      "Export GL, rent roll, and lease files from Yardi, MRI, or your current system. Upload them into CapVeri.",
  },
  {
    number: 2,
    icon: FileKey2,
    title: "Map lease terms",
    description:
      "Connect each tenant to recovery pools, caps, base years, and exclusions. Set the pro-rata share rules before calculations run.",
  },
  {
    number: 3,
    icon: Calculator,
    title: "Run CAM calculations",
    description:
      "Run deterministic logic for gross-ups, caps, base years, and tenant shares. Every dollar can be traced back to source.",
  },
  {
    number: 4,
    icon: PackageCheck,
    title: "Export tenant-ready support",
    description:
      "Review flagged exceptions and finalize adjustments. Export reconciliation packets with backup for tenant questions.",
  },
];

export interface HowItWorksSectionProps {
  className?: string;
}

export function HowItWorksSection({ className }: HowItWorksSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className={cn("bg-background py-20", className)}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            How CapVeri works
          </h2>
          <p className="text-base text-muted-foreground sm:text-lg">
            Go from files you already export to a checked CAM packet.
          </p>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 top-24 hidden h-px w-[calc(100%-200px)] -translate-x-1/2 bg-border lg:block" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4 lg:gap-10">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="animate-on-scroll relative flex flex-col items-center rounded-lg p-4 text-center transition-colors duration-200 hover:bg-muted/50"
                data-delay={String(index * 100) as "0" | "100" | "200" | "300"}
              >
                <div className="relative mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <step.icon className="h-8 w-8" aria-hidden="true" />
                  </div>
                  <div className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                    {step.number}
                  </div>
                </div>

                <h3 className="mb-3 text-xl font-bold text-foreground">
                  {step.title}
                </h3>
                <p className="max-w-xs text-base leading-relaxed text-muted-foreground">
                  {step.description}
                </p>

                {index < steps.length - 1 && (
                  <div className="my-4 text-primary md:hidden">
                    <ArrowRight
                      className="h-5 w-5 rotate-90"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/product-tour"
            className="inline-flex min-h-11 items-center gap-2 px-3 py-2.5 text-base font-medium text-primary transition-colors duration-200 hover:text-primary/80"
          >
            See the product tour
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
