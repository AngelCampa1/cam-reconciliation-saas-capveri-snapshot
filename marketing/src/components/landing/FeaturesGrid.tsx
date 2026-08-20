"use client";

import { useRef } from "react";
import {
  Calculator,
  Download,
  FileSearch,
  FolderInput,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type FeatureVariant = "wide" | "standard";

const features: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: FeatureVariant;
}> = [
  {
    icon: FolderInput,
    title: "ERP export ingestion",
    description:
      "Bring in GL, rent roll, recoverable expense, and lease files from the systems your team already uses.",
    variant: "wide",
  },
  {
    icon: Scale,
    title: "Lease-term mapping",
    description:
      "Connect each tenant to recovery pools, caps, exclusions, base years, gross-up clauses, and share rules.",
  },
  {
    icon: Calculator,
    title: "Deterministic CAM engine",
    description:
      "Exact decimal rules run the math for gross-ups, caps, base years, allocations, and pro-rata shares. AI never touches the numbers, and every result traces back to a rule.",
    variant: "wide",
  },
  {
    icon: FileSearch,
    title: "Exception review",
    description:
      "Surface missing backup, unusual variances, non-recoverable expenses, and lease-rule conflicts before tenant packets are issued.",
  },
  {
    icon: Download,
    title: "Tenant-ready exports",
    description:
      "Produce reconciliation packets, schedules, support files, and review materials for tenant questions.",
  },
  {
    icon: ShieldCheck,
    title: "Audit trail",
    description:
      "Keep a reviewable record of every input, mapping, calculation, and adjustment.",
  },
];

export interface FeaturesGridProps {
  className?: string;
}

export function FeaturesGrid({ className }: FeaturesGridProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section ref={sectionRef} className={cn("bg-foreground py-20", className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-background sm:text-4xl lg:text-5xl">
            Built for the reconciliation workflow
          </h2>
          <p className="text-base text-background/80 sm:text-lg">
            Everything you need to go from raw export files to tenant statements
            you can defend.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              data-delay={String(index * 75)}
              className={cn(
                "animate-on-scroll rounded-lg border border-background/15 bg-background/5 p-6 transition-colors duration-200 hover:border-background/30 hover:bg-background/10",
                feature.variant === "wide" && "md:col-span-2",
              )}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <feature.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-background">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-background/80 sm:text-base">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
