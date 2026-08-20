"use client";

import { useRef } from "react";
import {
  Building2,
  FileSpreadsheet,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Catches errors both ways",
    description: "See over-bills and under-bills before statements go out.",
  },
  {
    icon: Workflow,
    title: "Math you can trace",
    description:
      "Fixed rules do the math, not AI. Every number ties back to your files.",
  },
  {
    icon: Building2,
    title: "Built on BOMA 2024",
    description: "Our CAM math follows the BOMA 2024 standard.",
  },
  {
    icon: FileSpreadsheet,
    title: "No new system needed",
    description:
      "Keep Yardi, MRI, or your current system. Upload a file you already export.",
  },
];

export interface SocialProofStripProps {
  className?: string;
}

export function SocialProofStrip({ className }: SocialProofStripProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useScrollReveal(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={cn("border-y border-border bg-muted/40 py-8", className)}
      aria-label="CapVeri trust points"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((point, index) => (
            <div
              key={point.title}
              className="animate-on-scroll flex gap-3 rounded-lg p-3"
              data-delay={String(Math.min(index * 100, 400))}
            >
              <point.icon
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {point.title}
                </p>
                <p className="mt-1 text-base leading-6 text-muted-foreground sm:text-sm">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
