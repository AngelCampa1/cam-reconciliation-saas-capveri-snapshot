import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Angel Campa, Founder of CapVeri",
  description:
    "Angel Campa founded CapVeri. He built it to automate CAM reconciliation. It catches billing errors before tenant auditors do.",
  alternates: {
    canonical: buildSiteUrl("/about/angel-campa"),
  },
};

const profilePageSchema = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "@id": buildSiteUrl("/about/angel-campa#profilepage"),
  name: "Angel Campa, Founder of CapVeri",
  url: buildSiteUrl("/about/angel-campa"),
  dateCreated: "2025-01-09",
  dateModified: "2026-03-27",
  mainEntity: {
    "@type": "Person",
    "@id": buildSiteUrl("/about/angel-campa#person"),
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: buildSiteUrl("/about/angel-campa"),
    sameAs: ["https://www.linkedin.com/in/angelcampa1/", buildSiteUrl("/")],
    knowsAbout: [
      "CAM Reconciliation",
      "Commercial Real Estate Financial Operations",
      "BOMA 2024 Standards",
      "Lease Abstraction",
      "CAM Gross-Up Calculations",
      "CAM Cap Enforcement",
      "NNN Lease Structures",
      "CRE FinOps",
      "Property Management Accounting",
      "Tenant Audit Defense",
    ],
    worksFor: {
      "@type": "Organization",
      "@id": buildSiteUrl("/#organization"),
      name: "CapVeri.com",
      url: buildSiteUrl("/"),
    },
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is Angel Campa's background in commercial real estate?",
    answer:
      "Angel Campa is the founder of CapVeri, a CRE FinOps platform for commercial landlords. He built CapVeri after observing the billing errors that occur in CAM reconciliation. His work focuses on automating the deterministic math behind CAM reconciliation to catch those errors before tenant auditors find them.",
  },
  {
    question: "What does Angel Campa write about?",
    answer:
      "Angel writes about CAM reconciliation best practices, BOMA 2024 standards, lease clause interpretation, gross-up calculations, cap enforcement, and CRE FinOps strategy. His writing draws on first-hand experience building reconciliation software and analyzing commercial lease billing scenarios.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: buildSiteUrl("/") },
  { name: "About", url: buildSiteUrl("/about") },
  { name: "Angel Campa", url: buildSiteUrl("/about/angel-campa") },
]);

const WRITTEN_CONTENT = [
  {
    title: "CAM Reconciliation Guide",
    href: "/cam-reconciliation-guide",
    description: "Step-by-step guide to the full reconciliation process.",
  },
  {
    title: "What Are CAM Charges?",
    href: "/cam-charges",
    description:
      "Comprehensive breakdown of common area maintenance charges in commercial leases.",
  },
  {
    title: "BOMA 2024 Standards for CAM Reconciliation",
    href: "/resources/boma/boma-2024-adoption-roadmap",
    description:
      "How BOMA 2024 changes rentable area measurement and CAM recovery.",
  },
  {
    title: "CAM Gross-Up: Complete Guide",
    href: "/resources/calculations/gross-up-adjustment",
    description:
      "How gross-up works, when to apply it, and how to calculate it correctly.",
  },
  {
    title: "Triple Net Lease CAM Guide",
    href: "/resources/lease-types/nnn-lease/cam-guide",
    description:
      "CAM reconciliation mechanics specific to NNN lease structures.",
  },
];

export default function AngelCampaPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={profilePageSchema} />
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Header */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link
              href="/about"
              className="hover:text-foreground transition-colors duration-200"
            >
              About
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Angel Campa</span>
          </nav>
          <div className="flex items-start gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Angel Campa
              </h1>
              <p className="mt-1 text-lg text-muted-foreground">
                Founder, CapVeri
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href="https://www.linkedin.com/in/angelcampa1/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
                >
                  LinkedIn
                  <ExternalLink className="h-3 w-3" />
                </a>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  About CapVeri
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-3xl">
        {/* Bio */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">Background</h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Angel Campa is the founder of{" "}
              <Link href="/" className="text-primary hover:text-primary/80">
                CapVeri
              </Link>
              , the CRE FinOps platform for commercial landlords. He built
              CapVeri after observing a consistent pattern in commercial real
              estate: billing errors in CAM reconciliation go undetected until
              tenant auditors find them. By then, landlords face demand letters,
              credits, and strained tenant relationships.
            </p>
            <p>
              His work is grounded in the mechanics of how operating expenses
              are billed and recovered under NNN, NN, modified gross, and gross
              lease structures. The CapVeri calculation engine reflects
              first-hand analysis of the specific failure modes (incorrect
              gross-up thresholds, cap misapplication, wrong denominator
              definitions, base year errors) that appear repeatedly across
              portfolios.
            </p>
            <p>
              CapVeri needs no integration. It works with CSV and Excel exports
              from any ERP (Yardi, MRI, AppFolio) instead of costly API
              connections. That makes accurate reconciliation easy for landlords
              of any size.
            </p>
          </div>
        </section>

        {/* Areas of expertise */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">
            What CapVeri Covers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "CAM reconciliation automation",
              "BOMA 2024 measurement standards",
              "Gross-up calculation methodology",
              "CAM cap enforcement (cumulative vs. non-cumulative)",
              "Pro-rata share denominator structures",
              "NNN and modified gross lease mechanics",
              "Tenant audit defense",
              "Lease abstraction for FinOps",
              "CRE operating expense recovery",
              "SB 1103 compliance (California)",
            ].map((area) => (
              <div
                key={area}
                className="flex items-start gap-2 text-base text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                {area}
              </div>
            ))}
          </div>
        </section>

        {/* Written content */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Selected Writing
          </h2>
          <div className="space-y-4">
            {WRITTEN_CONTENT.map((item) => (
              <div
                key={item.href}
                className="border border-border rounded-lg p-4 hover:border-primary/40 transition-colors duration-200"
              >
                <Link
                  href={item.href}
                  className="font-medium text-foreground hover:text-primary transition-colors duration-200"
                >
                  {item.title}
                </Link>
                <p className="mt-1 text-base text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors duration-200 mt-2"
            >
              View all blog posts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                What is Angel Campa&apos;s background in commercial real estate?
              </h3>
              <p className="text-base text-muted-foreground leading-relaxed">
                Angel Campa is the founder of CapVeri, a CRE FinOps platform for
                commercial landlords. He built CapVeri after observing the
                billing errors that occur in CAM reconciliation. His work
                focuses on automating the deterministic math behind CAM
                reconciliation to catch those errors before tenant auditors find
                them.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                What does Angel Campa write about?
              </h3>
              <p className="text-base text-muted-foreground leading-relaxed">
                Angel writes about CAM reconciliation best practices, BOMA 2024
                standards, lease clause interpretation, gross-up calculations,
                cap enforcement, and CRE FinOps strategy. His writing draws on
                first-hand experience building reconciliation software and
                analyzing commercial lease billing scenarios.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="rounded-xl bg-muted/50 border border-border p-8 text-center">
          <h2 className="text-lg font-bold text-foreground mb-2">
            Try CapVeri Free
          </h2>
          <p className="text-base text-muted-foreground mb-4">
            Upload a GL export and see the billing errors in your
            reconciliations before your tenants do.
          </p>
          <Button asChild>
            <a href={buildTrialLink({ content: "author_bio_cta" })}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
