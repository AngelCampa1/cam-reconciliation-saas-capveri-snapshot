"use client";

import { useRef } from "react";
import { Calculator, FileCheck2, SearchCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const valueProps = [
  {
    icon: FileCheck2,
    title: "Close CAM without rebuilding your stack",
    description:
      "Keep Yardi, MRI, RealPage, spreadsheets, and your current approvals. CapVeri works from files you export and your lease documents. No integration needed.",
  },
  {
    icon: Calculator,
    title: "Get every CAM number right",
    description:
      "Gross-ups, caps, base years, exclusions, allocation pools, and pro-rata shares all run on exact decimal rules. AI never touches the numbers. Your finance team can trace every step.",
  },
  {
    icon: SearchCheck,
    title: "Your statement matches the lease, line by line",
    description:
      "CapVeri works out the correct CAM number on its own. Then it compares that to what your other system billed. Every charge lands right, over and under. What tenants get ties back to the lease.",
  },
];

export interface ValuePropositionSectionProps {
  className?: string;
}

export function ValuePropositionSection({
  className,
}: ValuePropositionSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section ref={sectionRef} className={cn("bg-muted/30 py-20", className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
              What CapVeri solves
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              CAM closeout is too important for spreadsheets.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              A good reconciliation ties the GL, rent roll, leases, math, and
              backup together. CapVeri keeps all of it in one place you can
              review.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {valueProps.map((prop, index) => (
              <Card
                key={prop.title}
                className="animate-on-scroll border-border bg-card shadow-sm"
                data-delay={String(index * 100)}
              >
                <CardContent className="p-6">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <prop.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold leading-7 text-foreground">
                    {prop.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-sm sm:leading-6">
                    {prop.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
