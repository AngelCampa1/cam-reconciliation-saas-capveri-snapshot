import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import {
  structuredDataSchemas,
  AUTHOR_ANGEL_CAMPA,
} from "@/lib/structured-data";
import {
  Target,
  Lightbulb,
  Shield,
  Lock,
  FileText,
  Bot,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildTrialLink } from "@/lib/auditLink";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About CapVeri: CRE FinOps Platform",
  description:
    "CapVeri is the CRE FinOps platform for commercial real estate landlords. Deterministic BOMA 2024 calculations, no ERP integrations needed.",
  alternates: {
    canonical: `${publicKnowledge.company.siteUrl}/about`,
  },
};

const values = [
  {
    icon: Target,
    title: "Every dollar is traceable",
    description:
      "The math follows fixed rules, not AI guesses. You can check every number.",
  },
  {
    icon: Lightbulb,
    title: "No integration needed",
    description:
      "It works from a file you export. No ERP integration, no API fees, no setup consultants.",
  },
  {
    icon: Shield,
    title: "Your data stays safe",
    description:
      "Your data is encrypted. Access is scoped to your organization. Every financial change is logged.",
  },
];

const securityClaims = [
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    description:
      "We encrypt your data when it moves and when we store it. Stolen data stays unreadable.",
  },
  {
    icon: Shield,
    title: "Row-level multi-tenant isolation",
    description:
      "Every data table is partitioned by organization. PostgreSQL RLS enforces boundaries at the database layer.",
  },
  {
    icon: FileText,
    title: "Financial record retention",
    description:
      "Retention is set up for financial recordkeeping. Your data is kept as long as you need it.",
  },
  {
    icon: Target,
    title: "Append-only audit log",
    description:
      "Every change to GL entries, reconciliation snapshots, and leases is captured in an append-only audit log with before/after state and timestamp.",
  },
  {
    icon: Bot,
    title: "AI with mandatory human review",
    description:
      "AI is used only to extract lease terms from PDFs. Every extraction requires human review before it affects any calculation.",
  },
  {
    icon: Activity,
    title: "Built for year-end work",
    description:
      "Built on Supabase and Cloudflare with health checks. Made for year-end CAM work, when uptime matters most.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          { name: "About", url: buildSiteUrl("/about") },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          ...AUTHOR_ANGEL_CAMPA,
          worksFor: {
            "@type": "Organization",
            "@id": buildSiteUrl("/#organization"),
            name: "CapVeri.com",
          },
        }}
      />
      {/* Header */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            About CapVeri
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Correct CAM billing for commercial landlords
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <time dateTime="2026-06-20">Last updated: June 20, 2026</time>
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-6">
            Our Mission
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            CapVeri was built because small reconciliation misses turn into real
            money problems. Our sources page shows the public data we use to
            estimate that exposure, and where the estimate falls short.{" "}
            <a
              href="/sources"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Review the source methodology
            </a>
            .
          </p>
          <p className="text-lg text-muted-foreground mb-6">
            The calculation engine supports BOMA 2024 aligned workflows. It
            checks the same logic a property accountant reviews by hand. The
            math runs the same way every time.
          </p>
          <p className="text-lg text-muted-foreground">
            You should not have to replace your whole tech stack to check a CAM
            bill. CapVeri works with a CSV you export from any system. That
            includes Yardi, MRI, AppFolio, and Excel.
          </p>
        </div>
      </div>

      {/* Founder's note */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-6">
            From the Founder
          </h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              This is a solo-operated, bootstrapped business. That might be a
              reason to turn away from CapVeri, and that&apos;s fine. Reputation
              matters in CRE. CapVeri is not a private-equity rollup or a
              venture-backed startup with millions to burn.
            </p>
            <p>
              Here is what I can promise. I will work hard to give you a great
              CAM reconciliation tool. I read every message myself. I take every
              call myself. I read every feature request and take it seriously. I
              watch for bugs and fix them fast. I want to make your
              reconciliation cycle easier.
            </p>
            <p>
              My goal is fast, personal service. If that sounds good to you, you
              can{" "}
              <a
                href={buildTrialLink({ content: "about_founders_note" })}
                className="text-primary hover:text-primary/80 underline underline-offset-2"
              >
                start a free trial
              </a>
              . And even if you decide CapVeri isn&apos;t for you, I thank you
              for giving it a try. Any feedback you&apos;re willing to share
              means a lot.
            </p>
            <p>
              If you have questions, here&apos;s my{" "}
              <a
                href="https://www.linkedin.com/in/angelcampa1/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-2"
              >
                LinkedIn
              </a>
              .
            </p>
            <p className="font-medium text-foreground">Angel Campa, Founder</p>
          </div>
        </div>
      </div>

      {/* Values */}
      <div className="bg-muted py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-8 text-center">
            Our Values
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((value) => (
              <Card key={value.title} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Security & Compliance */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-3">
            Security &amp; Compliance
          </h2>
          <p className="text-muted-foreground mb-8">
            Built for property managers and CFOs who need to show their
            stakeholders the books are in good hands.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {securityClaims.map((claim) => (
              <Card key={claim.title} className="border shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <claim.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-1 text-base font-semibold text-foreground">
                    {claim.title}
                  </h3>
                  <p className="text-base text-muted-foreground">
                    {claim.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/privacy"
              className="text-primary hover:underline font-medium"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 p-12 text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-4">
            Ready to charge the right amount?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Start a 30-day trial with no credit card. Check one building first,
            then add billing before the trial ends to keep access.
          </p>
          <Button asChild size="lg">
            <a href={`${buildTrialLink({ content: "about_page_cta" })}`}>
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
