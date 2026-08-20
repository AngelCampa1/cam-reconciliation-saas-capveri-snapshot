import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildTrialLink } from "@/lib/auditLink";
import {
  FileSearch,
  Shield,
  Scale,
  ArrowRight,
  CheckCircle,
  Clock,
  Target,
} from "lucide-react";
import { CaseStudyTabs } from "./CaseStudyTabs";
import { fieldLabel } from "./fieldLabel";
import type { CaseStudy } from "./CaseStudyTabs";
import { buildSiteUrl } from "@/lib/site";

const CASE_STUDIES_TITLE =
  "CAM Lease Extraction Case Studies: Real Lease Results";
const CASE_STUDIES_DESC =
  "See how CapVeri pulls CAM lease terms from 5 real commercial leases. Every field shows the exact clause it came from. You can check the work yourself.";

export const metadata: Metadata = {
  title: CASE_STUDIES_TITLE,
  description: CASE_STUDIES_DESC,
  alternates: { canonical: buildSiteUrl("/case-studies") },
  openGraph: {
    title: CASE_STUDIES_TITLE,
    description: CASE_STUDIES_DESC,
    url: buildSiteUrl("/case-studies"),
    type: "article",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CAM Lease Extraction Case Studies")}&category=Resource`,
        ),
        width: 1200,
        height: 630,
        alt: CASE_STUDIES_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: CASE_STUDIES_TITLE,
    description: CASE_STUDIES_DESC,
  },
};

const caseStudies: CaseStudy[] = [
  {
    id: "houston",
    tabLabel: "Stella Link",
    propertyName: "Stella Link Shopping Center",
    tenant: "Neurogene",
    leaseType: "NNN Multi-Tenant",
    leaseTypeBadgeVariant: "default",
    fields: [
      {
        field: "base_year",
        value: "2024",
        source: "§4.1",
      },
      {
        field: "base_year_amount",
        value: "Not stated",
        source: "§4.1",
      },
      {
        field: "gross_up_base_year",
        value: "95%",
        source: "§4.1",
      },
      {
        field: "pro_rata_share",
        value: "63.54%",
        source: "§23.1",
      },
      {
        field: "cap_type",
        value: "non-cumulative",
        source: "§23.3",
        isBadge: true,
      },
      {
        field: "cap_rate",
        value: "5%",
        source: "§23.3",
      },
      {
        field: "admin_fee_percentage",
        value: "15%",
        source: "§23.5",
      },
      {
        field: "excluded_pools",
        value: "Capital, structural",
        source: "§23.2",
      },
      {
        field: "accounting_basis",
        value: "cash",
        source: "§23.1",
        isBadge: true,
      },
    ],
    advantage: "15% admin fee buried in §23.5",
    advantageDetail:
      "Single-pass models frequently miss admin fee clauses embedded deep in long retail leases. The adversarial pass confirmed the 15% rate with ≥70% confidence, preventing a common landlord under-collection error.",
  },
  {
    id: "oaks",
    tabLabel: "Oaks Retail",
    propertyName: "Oaks Retail Center",
    tenant: "Third Coast Bancshares",
    leaseType: "NNN Retail",
    leaseTypeBadgeVariant: "default",
    fields: [
      {
        field: "base_year",
        value: "2023",
        source: "§5.1",
      },
      {
        field: "base_year_amount",
        value: "Not stated",
        source: "§5.1",
      },
      {
        field: "gross_up_base_year",
        value: "Not applicable",
        source: "§5.1",
      },
      {
        field: "pro_rata_share",
        value: "7.62%",
        source: "§5.2",
      },
      {
        field: "cap_type",
        value: "none",
        source: "§5.3",
        isBadge: true,
      },
      {
        field: "cap_rate",
        value: "N/A",
        source: "§5.3",
      },
      {
        field: "admin_fee_percentage",
        value: "15%",
        source: "§5.4 (stated 3×)",
      },
      {
        field: "excluded_pools",
        value: "Capital improvements",
        source: "§5.3",
      },
      {
        field: "accounting_basis",
        value: "accrual",
        source: "§5.1",
        isBadge: true,
      },
    ],
    advantage: "Consistent extraction across adversarial passes",
    advantageDetail:
      "The 15% admin fee appeared three times in different sections. The adversarial pass verified all three references agreed, giving high-confidence output without human escalation.",
  },
  {
    id: "kissimmee",
    tabLabel: "Kissimmee",
    propertyName: "Kissimmee Office Condo",
    tenant: "La Rosa Realty",
    leaseType: "Office Condo",
    leaseTypeBadgeVariant: "secondary",
    fields: [
      {
        field: "base_year",
        value: "2022",
        source: "§6.1",
      },
      {
        field: "base_year_amount",
        value: "Not stated",
        source: "§6.1",
      },
      {
        field: "gross_up_base_year",
        value: "Not applicable",
        source: "§6.1",
      },
      {
        field: "pro_rata_share",
        value: "5.25%",
        source: "§6.2",
      },
      {
        field: "cap_type",
        value: "none",
        source: "§6.3",
        isBadge: true,
      },
      {
        field: "cap_rate",
        value: "N/A",
        source: "§6.3",
      },
      {
        field: "admin_fee_percentage",
        value: "0%",
        source: "§6.4 (management excluded)",
      },
      {
        field: "excluded_pools",
        value: "Management, capital, structural, HVAC",
        source: "§6.3",
      },
      {
        field: "accounting_basis",
        value: "cash",
        source: "§6.1",
        isBadge: true,
      },
    ],
    advantage: "Catches negative info: management fee explicitly excluded",
    advantageDetail:
      "Most single-pass extractions return null for admin_fee when the lease is silent. This lease explicitly excluded management fees. The pipeline correctly extracted 0% rather than treating absence as unknown.",
  },
  {
    id: "research-park",
    tabLabel: "Research Park",
    propertyName: "Research Park",
    tenant: "Exact Sciences",
    leaseType: "Single-Tenant Net",
    leaseTypeBadgeVariant: "outline",
    fields: [
      {
        field: "base_year",
        value: "2021",
        source: "§5.1",
      },
      {
        field: "base_year_amount",
        value: "Not stated",
        source: "§5.1",
      },
      {
        field: "gross_up_base_year",
        value: "Not applicable",
        source: "§5.1",
      },
      {
        field: "pro_rata_share",
        value: "100%",
        source: "§5.2 (single tenant)",
      },
      {
        field: "cap_type",
        value: "none",
        source: "§5.5",
        isBadge: true,
      },
      {
        field: "cap_rate",
        value: "N/A",
        source: "§5.5",
      },
      {
        field: "admin_fee_percentage",
        value: "Ambiguous",
        source: "§5.6 (reasonable allowance)",
      },
      {
        field: "excluded_pools",
        value: "Capital (§5.5), structural",
        source: "§5.5",
      },
      {
        field: "accounting_basis",
        value: "accrual",
        source: "§5.1",
        isBadge: true,
      },
    ],
    advantage: "Distinguishes penalty clause from standard admin fee",
    advantageDetail:
      "The lease contained both a 'reasonable allowance' admin provision and a separate 20% penalty clause for landlord self-management. The tiebreaker pass correctly identified these as distinct and flagged admin_fee as ambiguous rather than extracting the wrong rate.",
  },
  {
    id: "generation",
    tabLabel: "Best Buy",
    propertyName: "Best Buy - Ames, IA",
    tenant: "Best Buy",
    leaseType: "NNN Standalone",
    leaseTypeBadgeVariant: "default",
    fields: [
      {
        field: "base_year",
        value: "2020",
        source: "§4.1",
      },
      {
        field: "base_year_amount",
        value: "Not stated",
        source: "§4.1",
      },
      {
        field: "gross_up_base_year",
        value: "Not applicable",
        source: "§4.1",
      },
      {
        field: "pro_rata_share",
        value: "100%",
        source: "§4.2 (single tenant)",
      },
      {
        field: "cap_type",
        value: "none",
        source: "§4.3",
        isBadge: true,
      },
      {
        field: "cap_rate",
        value: "N/A",
        source: "§4.3",
      },
      {
        field: "admin_fee_percentage",
        value: "10% (REA costs only)",
        source: "§4.5",
      },
      {
        field: "excluded_pools",
        value: "Non-REA building costs",
        source: "§4.5",
      },
      {
        field: "accounting_basis",
        value: "cash",
        source: "§4.1",
        isBadge: true,
      },
    ],
    advantage: "REA vs. building-level cost distinction",
    advantageDetail:
      "The 10% admin fee applied only to REA-governed shared costs, not all building expenses. Single-pass models misread this as a blanket 10% admin fee. The adversarial pass correctly scoped the fee to REA costs only.",
  },
];

const camFields = [
  {
    name: "base_year",
    description: "Calendar year used as the expense baseline for stops",
  },
  {
    name: "base_year_amount",
    description: "Dollar amount of the base year stop, if explicitly stated",
  },
  {
    name: "gross_up_base_year",
    description:
      "Occupancy percentage to normalize base year to full-occupancy costs",
  },
  {
    name: "pro_rata_share",
    description: "Tenant's percentage share of CAM expenses",
  },
  {
    name: "cap_type",
    description:
      "Whether expense cap is cumulative (compounding) or non-cumulative",
  },
  {
    name: "cap_rate",
    description: "Annual percentage ceiling on CAM expense increases",
  },
  {
    name: "admin_fee_percentage",
    description:
      "Management / administrative fee added on top of direct expenses",
  },
  {
    name: "excluded_pools",
    description:
      "Expense categories explicitly excluded from CAM (capital, structural, etc.)",
  },
  {
    name: "accounting_basis",
    description: "Whether expenses are tracked on cash or accrual basis",
  },
];

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          { name: "Case Studies", url: buildSiteUrl("/case-studies") },
        ])}
      />
      <JsonLd
        data={structuredDataSchemas.article({
          headline: CASE_STUDIES_TITLE,
          description: CASE_STUDIES_DESC,
          url: buildSiteUrl("/case-studies"),
          datePublished: "2026-03-19",
          dateModified: "2026-03-20",
          author: {
            name: "Angel Campa",
            jobTitle: "Founder, CapVeri",
            url: buildSiteUrl("/about"),
          },
          articleSection: "Case Studies",
        })}
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/80 py-16 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-grid-white/[0.05]"
          style={{ backgroundSize: "40px 40px" }}
        />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Extraction Accuracy
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
              Real Lease Extraction Results
            </h1>
            <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto mb-4">
              Five commercial leases. Nine CAM fields each. Verified against SEC
              EDGAR public filings. No synthetic data.
            </p>
            <p className="text-sm text-primary-foreground/60">
              SEC EDGAR public filings · No synthetic data · Verified results
            </p>
            <p className="text-xs text-primary-foreground/50 mt-3">
              By{" "}
              <a
                href="/about"
                className="underline underline-offset-2 hover:text-primary-foreground/70"
              >
                Angel Campa
              </a>{" "}
              · <time dateTime="2026-03-19">Published March 19, 2026</time> ·{" "}
              <time dateTime="2026-03-20">Updated March 20, 2026</time>
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline Overview */}
      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              How the Pipeline Works
            </h2>
            <p className="text-muted-foreground">
              Three specialized models in sequence. Each has a different job.
            </p>
          </div>

          <div className="relative max-w-5xl mx-auto">
            {/* Desktop connecting line */}
            <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />

            <div className="grid md:grid-cols-3 gap-8">
              {/* Pass 1 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <FileSearch className="h-7 w-7" />
                  </div>
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    1
                  </Badge>
                </div>
                <h3 className="font-semibold mb-1">Full Extraction</h3>
                <p className="text-sm text-muted-foreground">
                  Reads the entire lease and extracts all 9 CAM fields in a
                  single structured pass.
                </p>
              </div>

              {/* Pass 2 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Shield className="h-7 w-7" />
                  </div>
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    2
                  </Badge>
                </div>
                <h3 className="font-semibold mb-1">Adversarial Validation</h3>
                <p className="text-sm text-muted-foreground">
                  A second model challenges the first pass. Corrections require
                  ≥70% confidence to override.
                </p>
              </div>

              {/* Pass 3 */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Scale className="h-7 w-7" />
                  </div>
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    3
                  </Badge>
                </div>
                <h3 className="font-semibold mb-1">Escalation Tiebreaker</h3>
                <p className="text-sm text-muted-foreground">
                  A third model breaks the tie on the under-20% of leases where
                  the first two passes disagree on high-stakes fields.
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center mt-10 max-w-xl mx-auto">
            Merge priority: Pass 2 corrections override Pass 1 only at ≥70%
            confidence. Pass 3 tiebreaker takes precedence over both when
            triggered.
          </p>
        </div>
      </section>

      {/* Headline Stats */}
      <section className="bg-muted/50 border-y border-border py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="pt-6">
                <Target className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-primary">9 fields</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Per lease, every CAM reconciliation variable
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-primary">Every field</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Cited to the exact lease clause
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-primary">3 models</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Two check every lease. A third breaks ties.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Case Study Tabs */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-2xl mx-auto text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight mb-4">
                Five Leases, Verified Results
              </h2>
              <p className="text-muted-foreground">
                Each lease sourced from SEC EDGAR public filings. Extraction
                results verified against lease text.
              </p>
            </div>
            <CaseStudyTabs studies={caseStudies} />
          </div>
        </div>
      </section>

      {/* 9 Fields Reference */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              The 9 CAM Reconciliation Fields
            </h2>
            <p className="text-muted-foreground">
              Every field required to fully reconstruct a tenant&apos;s CAM
              exposure.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {camFields.map((f) => (
              <Card key={f.name}>
                <CardContent className="pt-4 pb-4">
                  <p className="font-semibold text-sm mb-1">
                    {fieldLabel(f.name)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Related Resources */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Related Resources</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  href: "/lease-abstraction",
                  title: "Lease Abstraction Software",
                  description:
                    "The AI extraction pipeline behind these case study results.",
                },
                {
                  href: "/cam-audit",
                  title: "CAM Audit Software",
                  description:
                    "Run your CAM numbers right. They hold up to any tenant audit.",
                },
                {
                  href: "/tools/lease-abstract-matrix",
                  title: "Lease Abstract Matrix",
                  description:
                    "Free tool to organize and compare extracted lease terms.",
                },
                {
                  href: "/pricing",
                  title: "CapVeri Pricing",
                  description: `${publicKnowledge.pricing.display.tierPriceLabels.reconcile}. ${publicKnowledge.pricing.display.trialCopy}`,
                },
              ].map(({ href, title, description }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <p className="font-semibold text-sm mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-gradient-to-br from-primary to-primary/80 relative overflow-hidden">
        <div
          className="absolute inset-0 bg-grid-white/[0.05]"
          style={{ backgroundSize: "40px 40px" }}
        />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
              See It Work on Your Leases
            </h2>
            <p className="text-primary-foreground/90 mb-8">
              Upload a lease PDF and get structured CAM fields in minutes.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="min-w-[200px] sm:min-w-[260px]"
            >
              <a href={buildTrialLink({ content: "case_studies_cta" })}>
                Extract My Lease Fields
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>

            <div className="flex flex-wrap justify-center gap-6 mt-8">
              <div className="flex items-center gap-2 text-primary-foreground/80 text-sm">
                <Shield className="h-4 w-4" />
                <span>Your lease data stays private</span>
              </div>
              <div className="flex items-center gap-2 text-primary-foreground/80 text-sm">
                <Clock className="h-4 w-4" />
                <span>Results in minutes</span>
              </div>
              <div className="flex items-center gap-2 text-primary-foreground/80 text-sm">
                <CheckCircle className="h-4 w-4" />
                <span>{publicKnowledge.pricing.display.trialCopy}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
