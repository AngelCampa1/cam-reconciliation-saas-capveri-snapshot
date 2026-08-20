import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Learn how CapVeri works: BOMA 2024 calculations, gross-up methodology, expense caps, and supported ERP systems like Yardi and MRI.",
  robots: {
    index: false,
    follow: true,
  },
};

import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import {
  BookOpen,
  Calculator,
  Shield,
  Zap,
  Database,
  CheckCircle2,
  FileText,
  Upload,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRODUCT_FEATURE_DOMAINS } from "@/config/plans";
import { buildSiteUrl } from "@/lib/site";

const domainIcons = {
  "data-ingestion": Upload,
  "calculation-engine": Calculator,
  "lease-management": FileText,
  "reconciliation-workflow": TrendingUp,
  "tenant-portal": CheckCircle2,
  "compliance-legal": Shield,
  "exports-reporting": BookOpen,
  "billing-subscriptions": Zap,
  "platform-infrastructure": Database,
} as const;

function DocumentationPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          { name: "Documentation", url: buildSiteUrl("/docs") },
        ])}
      />
      <JsonLd
        data={structuredDataSchemas.howTo(
          "How to Run a CAM Reconciliation with CapVeri",
          "Step-by-step guide to running a BOMA 2024 aligned CAM reconciliation using CapVeri.",
          [
            {
              name: "Upload Your Data",
              text: "Export your General Ledger and Rent Roll from Yardi, MRI, AppFolio, or any system that produces CSV/Excel exports. Drag and drop the files into CapVeri's upload interface.",
              url: buildSiteUrl("/docs#how-it-works"),
            },
            {
              name: "Automated Validation",
              text: "CapVeri validates your data, maps columns to a standardized schema, and flags anomalies: negative expenses in positive-only accounts, dates outside the reconciliation period, and unusual GL patterns.",
              url: buildSiteUrl("/docs#how-it-works"),
            },
            {
              name: "Deterministic Calculation Engine",
              text: "The calculation engine applies BOMA 2024 aligned gross-up, enforces expense caps, normalizes base years, and allocates pro-rata shares as specified in your lease agreements.",
              url: buildSiteUrl("/docs#how-it-works"),
            },
            {
              name: "Export Reconciliation Packets",
              text: "Generate professional reconciliation packets for each tenant: PDF for delivery, Excel for analysis, Journal Entry files for ERP posting. Demand letters generated automatically.",
              url: buildSiteUrl("/docs#how-it-works"),
            },
          ],
          "PT4H",
        )}
      />
      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
            Documentation
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            How CapVeri works: uploads, calculations, exports, and security.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <time dateTime="2026-02-26">Updated February 26, 2026</time>
          </p>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <h2 className="text-lg font-semibold mb-4 text-foreground">
            Quick Navigation
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <a
              href="#overview"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Product Overview</span>
            </a>
            <a
              href="#features"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Key Features</span>
            </a>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">How It Works</span>
            </a>
            <a
              href="#security"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Security & Compliance</span>
            </a>
            <a
              href="#supported-systems"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Supported Systems</span>
            </a>
            <a
              href="#technical"
              className="flex items-center gap-2 p-3 rounded-full border hover:bg-muted transition-colors duration-200"
            >
              <Calculator className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                Technical Specifications
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Section 1: Product Overview */}
      <div id="overview" className="bg-background">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                Product Overview
              </h2>
            </div>

            <div className="space-y-6 text-muted-foreground">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  What is CapVeri.com?
                </h3>
                <p className="leading-relaxed">
                  CapVeri.com is a financial operations platform for commercial
                  real estate. CapVeri automates Common Area Maintenance (CAM)
                  reconciliation. Manual calculation errors push CAM bills 3-5%
                  off the correct amount. That happens in both directions.
                  CapVeri catches over-billing and under-billing so you charge
                  the right amount.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Get every CAM number right
                </h3>
                <p className="leading-relaxed">
                  Manual CAM reconciliation in spreadsheets causes billing
                  errors. The errors go both ways. Under-billing costs landlords
                  money. Over-billing leads to tenant disputes and refunds.
                  Calculation mistakes, missed expense inclusions, and wrong
                  lease terms drive both. CapVeri.com replaces fragile Excel
                  spreadsheets with a deterministic calculation engine. It
                  checks that every CAM charge matches the correct amount.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Works with Your Existing Systems
                </h3>
                <p className="leading-relaxed">
                  CapVeri.com works beside your existing property management
                  system without expensive API integrations or vendor fees.
                  Export your General Ledger and Rent Roll data (CSV or Excel
                  files you already generate), upload them to CapVeri, and run
                  the calculation workflow. No integration projects, no IT
                  overhead.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Who Uses CapVeri?
                </h3>
                <p className="leading-relaxed">
                  Our platform is designed for mid-market property management
                  firms, lease audit consultants, and CPA firms performing CAM
                  reconciliation. Whether you manage office buildings, retail
                  centers, or industrial properties, CapVeri provides the
                  accuracy and transparency needed for effective financial
                  operations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Key Features */}
      <div id="features" className="bg-muted">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                Key Features
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {PRODUCT_FEATURE_DOMAINS.map((domain) => {
                const Icon = domainIcons[domain.id as keyof typeof domainIcons];
                return (
                  <Card key={domain.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        {domain.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{domain.summary}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: How It Works */}
      <div id="how-it-works" className="bg-background">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                How It Works
              </h2>
            </div>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Upload Your Data
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Export your General Ledger and Rent Roll from your existing
                    property management system (Yardi, MRI, AppFolio, or any
                    system that produces CSV/Excel exports). Drag and drop the
                    files into CapVeri's upload interface. Our intelligent file
                    detection automatically recognizes formats from major
                    systems.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Automated Validation
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    CapVeri validates your data and maps columns to our
                    standardized schema. The system flags anomalies such as
                    negative expenses in positive-only accounts or dates outside
                    the reconciliation period, helping you catch data quality
                    issues before they affect calculations.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Deterministic Calculation Engine
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Our calculation engine processes your data using
                    industry-standard methodologies. Gross-up calculations
                    follow BOMA 2024 standards. Base years, expense caps, and
                    pro-rata shares are all applied exactly as specified in your
                    lease agreements. The engine is 100% deterministic: the same
                    inputs always produce identical outputs.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Export Reconciliation Packets
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Generate professional reconciliation packets for each tenant
                    showing detailed expense breakdowns, calculation
                    methodologies, and billable amounts. Export to PDF for
                    tenant delivery, Excel for further analysis, or Journal
                    Entry files for posting back to your accounting system.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Security & Compliance */}
      <div id="security" className="bg-muted">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                Security & Compliance
              </h2>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Data Protection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Customer data is protected with encryption in transit and at
                    rest, organization-scoped access controls, and audit logging
                    for financial record changes.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Multi-Tenant Isolation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Customer records are separated by organization. Our database
                    implements row-level security policies so each organization
                    can access only its authorized records.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>BOMA 2024 Aligned Workflows</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Area calculations and gross-up workflows are aligned with
                    ANSI/BOMA Z65.1-2024 concepts for office buildings. Lease
                    terms and counsel review still govern billing rights.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Finalized Audit Records</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    Once a reconciliation is finalized, CapVeri preserves a
                    traceable record. Changes are logged with timestamps and
                    user information, providing audit support for compliance and
                    dispute resolution.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI with Mandatory Human Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-muted-foreground">
                    AI is used only to extract lease terms from uploaded PDFs.
                    Every extracted field goes through a human verification
                    screen before it can affect any calculation. Anthropic does
                    not use API inputs to train their models.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Supported Systems */}
      <div id="supported-systems" className="bg-background">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                Supported Systems
              </h2>
            </div>

            <div className="space-y-6 text-muted-foreground">
              <p className="leading-relaxed">
                CapVeri.com works with standard CSV and Excel exports from all
                major property management systems. No expensive integrations or
                vendor fees required.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Yardi Voyager</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base text-muted-foreground">
                      Supports General Ledger exports, Rent Roll reports, and
                      custom financial statements. Our parser handles
                      Yardi-specific formatting including merged cells and
                      multi-row headers.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">MRI Commercial</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base text-muted-foreground">
                      Supports MRI Rent Roll exports, GL transaction reports,
                      and tenant billing data. Compatible with both MRI Software
                      and RealPage MRI platforms.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">AppFolio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base text-muted-foreground">
                      Works with AppFolio's standard GL and Rent Roll exports.
                      Handles both commercial and residential property data
                      formats.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Generic CSV/Excel
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-base text-muted-foreground">
                      For systems not explicitly supported, use our column
                      mapping wizard to define how your data maps to CapVeri's
                      schema. Works with any system that can export tabular
                      data.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
                <h3 className="font-semibold text-foreground mb-2">
                  No Integration Required
                </h3>
                <p className="text-sm">
                  Unlike traditional software that requires expensive API
                  connections, CapVeri works with the exports you're already
                  generating. This means no integration projects, no vendor
                  approvals, and no ongoing API fees. You own your data. Use it
                  how you want.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 6: Technical Specifications */}
      <div id="technical" className="bg-muted">
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Calculator className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                Technical Specifications
              </h2>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  ANSI/BOMA Z65.1-2024 Alignment
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  All area calculations follow the latest BOMA standard for
                  office buildings. This includes proper handling of:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>Rentable Area vs. Usable Area distinctions</li>
                  <li>Load Factor (R/U Ratio) calculations</li>
                  <li>
                    Outdoor amenities measurement per 2024 standard updates
                  </li>
                  <li>Building and floor common areas allocation</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Gross-Up Methodology
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Our gross-up calculations follow industry-standard
                  methodology:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>
                    Variable expenses (janitorial, utilities) are grossed up
                    based on occupancy
                  </li>
                  <li>
                    Fixed expenses (taxes, insurance) are never grossed up
                  </li>
                  <li>
                    Gross-up factor = Target Occupancy ÷ Average Physical
                    Occupancy
                  </li>
                  <li>
                    Safety valve: Grossed amount never exceeds theoretical 100%
                    occupancy cost
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Expense Cap Types
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  CapVeri handles all standard cap calculation types:
                </p>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-1">
                      Non-Cumulative Caps
                    </h4>
                    <p className="text-base text-muted-foreground">
                      Resets each year. Unused capacity is lost. Maximum
                      billable = Previous Year × (1 + Cap Rate).
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">
                      Cumulative Caps
                    </h4>
                    <p className="text-base text-muted-foreground">
                      Unused capacity carries forward with linear growth from
                      base year. Tracks historical spending to maximize
                      recoverable amounts.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground mb-1">
                      Cumulative Compounding Caps
                    </h4>
                    <p className="text-base text-muted-foreground">
                      Base grows exponentially: Maximum = Base × (1 + Cap
                      Rate)^Years. Unused capacity compounds year over year.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Base Year Normalization
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  When base years occur during low-occupancy periods (below
                  95%), CapVeri automatically normalizes the base to prevent
                  unfair expense spikes in future years. This ensures tenants
                  aren't penalized when building occupancy returns to normal
                  levels.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-foreground mb-3">
                  Pro-Rata Share Calculations
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Tenant shares are calculated using BOMA-aligned rentable
                  square footage inputs. The system tracks area changes over
                  time (remeasurements, renovations) and applies the correct
                  square footage for each calculation period.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help CTA */}
      <div className="bg-background">
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <Card className="bg-muted border-0">
              <CardContent className="p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground mb-1">
                    Have a question?
                  </h3>
                  <p className="text-muted-foreground">
                    Browse our Help Center for step-by-step guides. Or reach our
                    support team for direct help.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button asChild variant="outline">
                    <Link href="/help">Browse Help Center</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/contact">Contact Support</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentationPage;
