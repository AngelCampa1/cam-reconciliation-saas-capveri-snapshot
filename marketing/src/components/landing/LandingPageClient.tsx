"use client";

import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";
import { HeroSection } from "./HeroSection";
import { SocialProofStrip } from "./SocialProofStrip";
import { ValuePropositionSection } from "./ValuePropositionSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { ProductDemoSection } from "./ProductDemoSection";
import { FreeAuditClaritySection } from "./FreeAuditClaritySection";
import { FeaturesGrid } from "./FeaturesGrid";
import { FAQSection } from "./FAQSection";
import { PricingTeaser } from "./PricingTeaser";
import { CTASection } from "./CTASection";

export function LandingPageClient() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <SocialProofStrip />
      <ValuePropositionSection />
      <HowItWorksSection />
      <ProductDemoSection />
      <FreeAuditClaritySection />
      <FeaturesGrid />
      {/* CAM Knowledge Hub */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight">
              CAM knowledge hub
            </h2>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
              In-depth guides for commercial landlords, property controllers,
              and asset managers.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto mb-8">
            {[
              {
                href: "/cam-audit",
                title: "CAM Audit Software",
                description:
                  "Run your CAM numbers right. They hold up to any tenant audit.",
              },
              {
                href: "/cam-charges",
                title: "What Are CAM Charges?",
                description:
                  "Complete breakdown of CAM charges, what's recoverable, and billing norms.",
              },
              {
                href: "/cam-reconciliation-guide",
                title: "Reconciliation Guide",
                description:
                  "Step-by-step CAM reconciliation process from GL export to demand letter.",
              },
              {
                href: "/lease-abstraction",
                title: "Lease Abstraction",
                description:
                  "Extract CAM-critical fields from lease PDFs automatically.",
              },
            ].map(({ href, title, description }) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <p className="font-semibold text-base mb-1">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { href: "/case-studies", label: "Case Studies" },
              { href: "/resources", label: "All Resources" },
              { href: "/glossary", label: "CAM Glossary" },
              { href: "/blog", label: "Blog" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors duration-200"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <FAQSection />
      <PricingTeaser />
      {/* Free Tools callout */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            Free tools
          </p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-4">
            No-signup calculators for property controllers
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8">
            Texas landlord? Use the{" "}
            <Link
              href="/tools/hcad-tax-normalizer"
              className="text-primary underline-offset-4 hover:underline font-medium"
            >
              HCAD Tax Base Year Normalizer
            </Link>
            . It shows how much more tax you can recover after an ARB protest.
            Free, instant, no signup.
          </p>
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center gap-2 rounded-button bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
          >
            <Calculator className="h-4 w-4" aria-hidden="true" />
            Browse free tools
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
      <CTASection />
    </div>
  );
}
