import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { publicKnowledge } from "@/generated/public-knowledge";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sources & Research",
  description:
    "Sources, citations, and methodology behind the statistics and claims on capveri.com.",
  robots: {
    index: false,
    follow: true,
  },
};

type Reliability = "high" | "medium" | "low";

interface IndustryStat {
  id: string;
  claim: string;
  source: string;
  detail: string;
  urls?: { label: string; href: string }[];
  type: string;
  reliability: Reliability;
  reliabilityNote: string;
}

const industryStats: IndustryStat[] = [
  {
    id: "cam-errors-40-percent",
    claim: "40% of CAM reconciliations contain material errors",
    source: "Attributed to Tango Analytics (2023) via secondary sources",
    detail:
      'Widely cited in industry content. The original Tango Analytics report has not been independently located or verified. Secondary sources (PredictAP, Springbord) restate the figure without linking to the underlying study, methodology, or definition of "material error." We cite this figure as commonly referenced in industry discussions, not as a verified statistic.',
    urls: [
      {
        label: "PredictAP blog (2026)",
        href: "https://blog.predictap.com/the-15-billion-problem-hiding-in-plain-sight",
      },
      {
        label: "Springbord blog (2025)",
        href: "https://www.springbord.com/blog/how-cam-audits-help-tenants-control-real-estate-expenses/",
      },
    ],
    type: "Secondary sources",
    reliability: "low",
    reliabilityNote:
      "No primary study located. Definition of 'material' and methodology not disclosed.",
  },
  {
    id: "tenant-audit-recovery-15-20-percent",
    claim: "15-20% of billed CAM charges recovered by tenant auditors",
    source: "Springbord (2025), PredictAP (2026)",
    detail:
      "Stated in vendor educational content. No primary JLL, Deloitte, or Big 4 report publishing this figure with methodology was located in publicly available 2020-2026 materials. The figure is presented as industry insight without disclosed sample size, asset class mix, or audit protocol.",
    urls: [
      {
        label: "Springbord blog (2025)",
        href: "https://www.springbord.com/blog/how-cam-audits-help-tenants-control-real-estate-expenses/",
      },
      {
        label: "PredictAP blog (2026)",
        href: "https://blog.predictap.com/the-15-billion-problem-hiding-in-plain-sight",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote:
      "No primary study or dataset located. Commonly cited but unverified.",
  },
  {
    id: "operating-recovery-loss-3-5-percent",
    claim: "3-5% of operating expense recoveries lost annually",
    source: "Agora Real (2024), industry estimates",
    detail:
      'Agora Real states "annual third-party reconciliations often uncover 3-5% in overcharges or misclassifications." This frames the figure as audit findings, not specifically landlord under-collection. No specific BOMA study was located for this claim despite prior attribution to "BOMA industry research."',
    urls: [
      {
        label: "Agora Real (2024)",
        href: "https://agorareal.com/learn/cam-charges/",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote:
      "No primary BOMA study located. Nearest source is a vendor educational article.",
  },
  {
    id: "yardi-interface-program-pricing",
    claim: "$25K+ per year for ERP/API integration (Yardi)",
    source: "Yardi Systems - official interface program",
    detail:
      "Yardi's official \"Become an Interface Partner\" page states participation requires an annual fee per interface, with pricing varying by interface type. Propexo's Yardi interface guide separately describes the cost structure as commonly starting around $25,000 per interface per year.",
    urls: [
      {
        label: "Yardi Interface Program (US)",
        href: "https://www.yardi.com/company/become-an-interface-partner/",
      },
      {
        label: "Propexo Yardi interface guide",
        href: "https://kb.propexo.com/articles/6920009722-how-many-yardi-interfaces-can-i-access",
      },
    ],
    type: "Vendor program terms",
    reliability: "medium",
    reliabilityNote:
      "Yardi is the primary source for the fee structure. The dollar figure comes from a secondary integration guide.",
  },
  {
    id: "mri-gcloud-pricing",
    claim: "MRI integration costs (UK G-Cloud procurement data)",
    source: "MRI Software - UK public procurement pricing",
    detail:
      "UK G-Cloud pricing documents show MRI Property Management at \u00a355,000/year entry-level (500 leases, 10 users) and list integration line items including RESTful API Web Service at \u00a310,560 and various supplier integrations at \u00a38,040-\u00a313,400.",
    urls: [
      {
        label: "MRI G-Cloud 14 pricing (2024)",
        href: "https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/709203/342191134164561-pricing-document-2024-05-03-1542.pdf",
      },
      {
        label: "MRI G-Cloud 14 pricing (2025)",
        href: "https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/709203/180846299709117-pricing-document-2025-07-03-1452.pdf",
      },
    ],
    type: "Public procurement",
    reliability: "medium",
    reliabilityNote:
      "Primary source (official pricing). UK-specific; may not represent US commercial terms.",
  },
  {
    id: "manual-cam-hours-datagrid",
    claim: "400+ hours per year on manual CAM reconciliation",
    source: "Datagrid (2025)",
    detail:
      'Datagrid blog states "manual CAM reconciliation consumes 40+ hours monthly," which annualizes to 480+ hours/year. No disclosed study design, sample size, or benchmarking methodology. Likely illustrative positioning for an AI vendor.',
    urls: [
      {
        label: "Datagrid blog (2025)",
        href: "https://datagrid.com/blog/ai-lease-administrators-cam-reconciliation-billing",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote: "No disclosed methodology. Vendor marketing claim.",
  },
  {
    id: "invoice-cycle-time",
    claim: "Invoice cycle time: 9.2 days manual vs. 3.1 days automated",
    source: "PredictAP (2026)",
    detail:
      "PredictAP reports invoice processing cycle times comparing manual and automated workflows. Figures come from vendor marketing content without disclosed methodology or sample size.",
    urls: [
      {
        label: "PredictAP blog (2026)",
        href: "https://blog.predictap.com/the-15-billion-problem-hiding-in-plain-sight",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote: "No disclosed methodology. Vendor marketing claim.",
  },
  {
    id: "invoice-cost-manual-vs-automated",
    claim: "Invoice cost: $12.88 manual vs. $2.78 automated",
    source: "PredictAP (2026)",
    detail:
      "PredictAP reports per-invoice processing costs comparing manual and automated workflows. Figures come from vendor marketing content without disclosed methodology.",
    urls: [
      {
        label: "PredictAP blog (2026)",
        href: "https://blog.predictap.com/the-15-billion-problem-hiding-in-plain-sight",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote: "No disclosed methodology. Vendor marketing claim.",
  },
  {
    id: "portfolio-savings-nakisa",
    claim: "$10.3M savings for 3,500-lease portfolio",
    source: "Nakisa (2025)",
    detail:
      "Nakisa cites potential savings from lease administration automation across a large portfolio. Vendor case study without disclosed audit methodology.",
    urls: [
      {
        label: "Nakisa lease management",
        href: "https://www.nakisa.com/lease-management",
      },
    ],
    type: "Vendor content",
    reliability: "low",
    reliabilityNote:
      "Vendor marketing claim. No disclosed methodology or peer review.",
  },
  {
    id: "houston-vacancy",
    claim: "Houston office vacancy: 26.3% (Q4 2025)",
    source: "Partners Real Estate - Q4 2025 Quarterly Market Report",
    detail:
      "Partners Real Estate publishes quarterly Houston office market reports with vacancy rates by submarket. The Q4 2025 report shows 26.3% overall office vacancy with submarket extremes of 49.1% (Greenspoint) and 37.8% (FM 1960).",
    urls: [
      {
        label: "Partners Real Estate Q4 2025 Report",
        href: "https://partnersrealestate.com/research/houston-office-q4-2025-quarterly-market-report/",
      },
    ],
    type: "Market research report",
    reliability: "high",
    reliabilityNote:
      "Primary source: licensed brokerage firm publishing periodic market data.",
  },
  {
    id: "boma-2024-rsf-increase",
    claim: "2-5% RSF increase from BOMA 2024 adoption",
    source: "Gensler (2024), Building Engines",
    detail:
      "Gensler and Building Engines estimate that adopting the BOMA 2024 standard (ANSI/BOMA Z65.1-2024) may increase rentable square footage by 2-5% due to outdoor amenity measurement changes.",
    urls: [
      {
        label: "BOMA Standards Portal",
        href: "https://boma.org/boma-standards/",
      },
    ],
    type: "Industry analysis",
    reliability: "medium",
    reliabilityNote:
      "Industry estimates from credible firms. Actual impact varies by building configuration.",
  },
  {
    id: "cpa-busy-season",
    claim: "CPA busy season drives reconciliation delays",
    source: "CPA Trendlines (2024)",
    detail:
      "CPA Trendlines reports on seasonal workload patterns in accounting firms. January-April busy season creates bottlenecks for commercial real estate reconciliations that depend on CPA review.",
    urls: [
      {
        label: "CPA Trendlines",
        href: "https://cpatrendlines.com/",
      },
    ],
    type: "Industry publication",
    reliability: "medium",
    reliabilityNote:
      "Established accounting industry publication. Seasonal pattern is well-documented.",
  },
];

const internalClaims = [
  {
    claim: "Modeled billing variance per building: ~$5.9K-$35.3K/year",
    methodology:
      "Modeled from a 200,000 SF building using IREM office opex benchmark ($11.15/SF in 2023), CPI-adjusted to 2025 dollars, and scenario leakage rates of 0.25%-1.5%. This is an assumption-driven estimate, not a universal outcome claim.",
  },
  {
    claim:
      "Modeled billing variance range: $5.9K-$35.3K per building vs. subscription cost",
    methodology:
      "Based on modeled billing variance and current annual subscription cost. Actual value depends on lease structure, CAM pool size, and data quality.",
  },
  {
    claim: "Modeled building value impact range at 7% cap rate",
    methodology:
      "Uses the modeled billing variance range ($5.9K-$35.3K). At a 7% cap rate, this implies value lift. The range is roughly $84K-$505K per building. Actual cap rates vary by market and asset type.",
  },
  {
    claim: "Modeled portfolio leakage range",
    methodology:
      "Portfolio estimates should be modeled from each property's CAM pool and scenario rates rather than a fixed per-building average.",
  },
  {
    claim: "28% of tenants discover CAM errors without an auditor",
    methodology:
      "Secondary benchmark from JLL-referenced summaries on tenant self-discovery of billing errors. Treat as directional because a primary study was not independently verified in our February 2026 audit.",
  },
  {
    claim: "$445,500 additional NOI on 250K RSF building from BOMA 2024",
    methodology:
      "Modeled by CapVeri assuming 3% RSF increase on a 250,000 SF building at $11.15/SF IREM benchmark OpEx, with resulting NOI increase capitalized at 7%. This is a scenario illustration, not a guarantee.",
  },
];

interface Standard {
  id?: string;
  name: string;
  description: string;
  url?: string;
}

const standards: Standard[] = [
  {
    id: "boma-2024",
    name: "ANSI/BOMA Z65.1-2024",
    description:
      "Office building measurement standard. CapVeri supports BOMA 2024 aligned gross-up and area calculation workflows including outdoor amenities measurement updates.",
    url: "https://boma.org/boma-standards/",
  },
  {
    id: "sb-1103",
    name: "California SB 1103",
    description:
      "California commercial lease disclosure requirements effective January 1, 2025. CapVeri helps assemble documentation for customer review against SB 1103 response workflows.",
    url: "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB1103",
  },
  {
    id: "irs-record-retention",
    name: "IRS \u00a7 6001 / Rev. Proc. 98-25",
    description:
      "Federal record retention requirements. CapVeri retains financial records for 10 years per IRS requirements for commercial real estate documentation.",
  },
  {
    id: "irs-162",
    name: "IRS \u00a7162 - Routine Maintenance Safe Harbor",
    description:
      "Defines deductible trade or business expenses, including the routine maintenance safe harbor used to distinguish operating expenses from capital expenditures in CAM classifications.",
    url: "https://www.law.cornell.edu/uscode/text/26/162",
  },
  {
    id: "irs-263a",
    name: "IRS \u00a7263(a) - Capital Expenditures",
    description:
      "Defines capital expenditure rules that determine when a cost must be capitalized rather than expensed. Critical for CapEx/OpEx classification in CAM reconciliations.",
    url: "https://www.law.cornell.edu/uscode/text/26/263",
  },
  {
    id: "asc-842",
    name: "ASC 842 - Lease Accounting",
    description:
      "FASB lease accounting standard requiring operating and finance lease recognition on the balance sheet. Affects how CAM expenses are classified and reported.",
    url: "https://dart.deloitte.com/USDART/home/publications/roadmap/leasing?id=us%3A2el%3A3dp%3Armleases%3Aeng%3Aaud%3A121823%3Aiaspl",
  },
  {
    id: "irem-benchmarks",
    name: "IREM Operating Expense Benchmarks",
    description:
      "Institute of Real Estate Management publishes annual operating expense benchmarks used as the basis for CAM cost reasonableness testing and recovery modeling.",
    url: "https://www.irem.org/",
  },
  {
    id: "icsc-standards",
    name: "ICSC Shopping Center Standards",
    description:
      "International Council of Shopping Centers provides CAM and operating expense guidance for retail properties, including anchor tenant exclusion conventions.",
    url: "https://www.icsc.com/",
  },
  {
    id: "texas-property-code-93-012",
    name: "Texas Property Code \u00a7 93.012",
    description:
      "Texas statute governing commercial lease disclosure and tenant rights related to common area maintenance charges.",
  },
  {
    id: "california-civil-code-1950-9",
    name: "California Civil Code \u00a71950.9",
    description:
      "Enacted by SB 1103. Requires landlords of qualifying commercial tenants to provide itemized CAM statements and respond to documentation requests within 30 days.",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1950.9.&lawCode=CIV",
  },
];

interface LegalCase {
  id: string;
  name: string;
  description: string;
  url?: string;
}

const legalCases: LegalCase[] = [
  {
    id: "medic-pharmacy-case",
    name: "Medic Pharmacy, LLC v. AVK Properties, LLC (Harris County, 2022)",
    description:
      "Harris County case involving CAM gross-up disputes in a high-vacancy commercial property. Illustrates the financial impact of incorrect gross-up calculations in Texas markets.",
  },
  {
    id: "mata-v-avianca",
    name: "Mata v. Avianca, Inc. (S.D.N.Y., 2023)",
    description:
      "Federal court case where attorneys were sanctioned for submitting AI-generated legal citations that cited nonexistent cases. Established precedent for verification requirements when AI tools are used in legal filings.",
    url: "https://storage.courtlistener.com/recap/gov.uscourts.nysd.575368/gov.uscourts.nysd.575368.54.0_3.pdf",
  },
  {
    id: "clear-lake-center-case",
    name: "Clear Lake Center v. Garden Ridge (Texas, 2013)",
    description:
      "Texas case involving CAM charge disputes between a commercial landlord and anchor tenant. Addressed issues of expense pass-through interpretation in multi-tenant retail properties.",
  },
  {
    id: "sb-1103-bill-text",
    name: "SB 1103 Full Bill Text",
    description:
      "California Senate Bill 1103, effective January 1, 2025. Creates new disclosure and documentation requirements for landlords of qualifying commercial tenants.",
    url: "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB1103",
  },
  {
    id: "california-bp-code-18000",
    name: "California B&P Code \u00a718000(a)",
    description:
      'Defines "qualified commercial tenant" for purposes of SB 1103 protections. Businesses with fewer than 100 employees may qualify for enhanced CAM disclosure rights.',
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=18000.&lawCode=BPC",
  },
];

interface MarketReport {
  id: string;
  name: string;
  description: string;
  url?: string;
}

const marketReports: MarketReport[] = [
  {
    id: "partners-houston-q4-2025",
    name: "Partners Real Estate - Houston Office Q4 2025",
    description:
      "Quarterly market report covering Houston office vacancy rates, absorption, and submarket performance. Source for Houston 26.3% vacancy and submarket data.",
    url: "https://partnersrealestate.com/research/houston-office-q4-2025-quarterly-market-report/",
  },
  {
    id: "hcad-reappraisal-2025",
    name: "HCAD 2025-2026 Reappraisal Plan",
    description:
      "Harris County Appraisal District reappraisal schedule and methodology. Affects tax expense projections in CAM reconciliations for Harris County properties.",
    url: "https://hcad.org/hcad-resources/reappraisal/",
  },
  {
    id: "boma-operating-benchmark",
    name: "BOMA 2024 Operating Benchmark Report",
    description:
      "Annual operating expense benchmarks for office buildings. Used for CAM cost reasonableness comparisons.",
    url: "https://www.boma.org/",
  },
  {
    id: "cremodels-cam-deadlines",
    name: "CREModels - CAM Reconciliation Deadlines",
    description:
      "Analysis of CAM reconciliation deadline patterns and common causes of late delivery across commercial portfolios.",
    url: "https://www.cremodels.com/cam-reconciliation-deadlines-loom-large",
  },
];

interface ProfessionalReference {
  id: string;
  name: string;
  description: string;
  url?: string;
}

const professionalReferences: ProfessionalReference[] = [
  {
    id: "bdo-gross-up",
    name: "BDO - Lease Audit Spotlight: Gross-Up Adjustments",
    description:
      "BDO advisory publication explaining gross-up provision mechanics and common audit findings in commercial lease reconciliations.",
    url: "https://www.bdo.com/insights/advisory/2020-lease-audit-spotlight-gain-clarity-on-gross-up-adjustments",
  },
  {
    id: "parr-brown-gross-up",
    name: "Parr Brown - Leasing Basics: Gross-Up Provisions",
    description:
      "Legal analysis of gross-up provisions in commercial leases, including common drafting issues and tenant protections.",
    url: "https://parrbrown.com/leasing-basics-gross-up-provisions/",
  },
  {
    id: "mbm-gross-up",
    name: "MBM LLC - CAM Gross-Up Clauses",
    description:
      "Practical guide to gross-up clauses in commercial leases, covering calculation methods and common landlord-tenant disputes.",
    url: "https://www.mbmllc.com/cam-gross-up-clauses-commercial-leases.html",
  },
  {
    id: "calawyers-sb-1103",
    name: "CalLawyers - New Protections Under SB 1103",
    description:
      "California Lawyers Association analysis of SB 1103's impact on commercial tenant rights and landlord disclosure obligations.",
    url: "https://calawyers.org/real-property-law/new-protections-for-qualified-commercial-tenants-under-ca-sb-1103/",
  },
  {
    id: "carlton-fields-sb-1103",
    name: "Carlton Fields - SB 1103: What Landlords and Tenants Need to Know",
    description:
      "Law firm analysis of SB 1103 compliance requirements, including documentation timelines and qualifying tenant thresholds.",
    url: "https://www.carltonfields.com/insights/publications/2025/sb-1103-what-california-landlords-and-tenants-need-to-know",
  },
  {
    id: "holland-knight-sb-1103",
    name: "Holland & Knight - New Changes to California Commercial Leasing",
    description:
      "Legal briefing on SB 1103 and its implications for commercial lease administration in California.",
    url: "https://www.hklaw.com/en/insights/publications/2025/01/new-changes-to-california-commercial-leasing",
  },
  {
    id: "xfinbench",
    name: "XFinBench - Financial AI Benchmark",
    description:
      "Academic benchmark evaluating LLM accuracy on financial calculation tasks. Demonstrates that current AI models achieve only 38.9% accuracy on multi-step financial math, supporting the case for deterministic calculation engines.",
    url: "https://arxiv.org/abs/2409.03991",
  },
  {
    id: "riw-audit-rights",
    name: "RIW - Audit Rights and Restrictions",
    description:
      "Legal strategies for understanding and defending audit rights in commercial leases, including common lease clause pitfalls.",
    url: "https://www.riw.com/2024/09/four-strategies-to-understand-and-defend-against-poor-audit-rights-and-restrictions/",
  },
  {
    id: "fiserv-reconciliation",
    name: "Fiserv - Reconciliation Whitepaper",
    description:
      "Industry whitepaper on financial reconciliation automation, including time and cost benchmarks for manual vs. automated processes.",
    url: "https://www.fiserv.com/content/dam/fiserv-ent/archive-files/final-files/white-papers/Frontier-Reconciliation_whitepaper_1020.pdf",
  },
  {
    id: "jpmorgan-cam-overview",
    name: "J.P. Morgan - What Are CAM Charges in CRE?",
    description:
      "Introductory guide to common area maintenance charges in commercial real estate, covering standard inclusions and landlord-tenant allocation methods.",
    url: "https://www.jpmorgan.com/insights/real-estate/commercial-term-lending/what-are-common-area-maintenance-cam-charges-in-cre",
  },
  {
    id: "irem-cam-presentation",
    name: "IREM Oregon - CAM Reconciliation: Art or Science",
    description:
      "Professional presentation on CAM reconciliation best practices, including common errors and recommended verification procedures.",
    url: "https://iremoregon.org/images/meeting/021820/irem_cam_recs_art_or_science_pres.pdf",
  },
  {
    id: "fasb-conceptual-framework",
    name: "FASB Conceptual Framework",
    description:
      "Financial Accounting Standards Board conceptual framework for financial reporting. Provides the theoretical basis for expense classification in CAM reconciliations.",
    url: "https://www.sec.gov/newsroom/speeches-statements/munter-statement-fasb-081224",
  },
];

const reliabilityColors: Record<Reliability, string> = {
  high: "bg-success/10 text-success-strong",
  medium: "bg-warning/10 text-warning-foreground",
  low: "bg-destructive/10 text-destructive-strong",
};

function ExternalLinkCard({
  id,
  name,
  description,
  url,
}: {
  id?: string;
  name: string;
  description: string;
  url?: string;
}) {
  return (
    <div id={id} className="border rounded-lg p-5">
      <h3 className="font-semibold text-foreground mb-2">{name}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
        >
          {url.replace("https://", "").split("/")[0]}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

export default function SourcesPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          {
            name: "Sources & Research",
            url: buildSiteUrl("/sources"),
          },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": buildSiteUrl("/sources#webpage"),
          name: "Sources & Research - CapVeri",
          url: buildSiteUrl("/sources"),
          description:
            "Sources, citations, and methodology behind the statistics and claims on capveri.com.",
          lastReviewed: "2026-02-28",
          reviewedBy: {
            "@type": "Organization",
            "@id": buildSiteUrl("/#organization"),
            name: "CapVeri.com",
          },
        }}
      />
      {/* Header */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          <Link
            href="/"
            className="mb-8 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Sources & Research
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Every statistic on this site should be traceable. This page
            documents the sources behind our claims and the methodology behind
            our calculations.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <time dateTime="2026-02-28">Last reviewed: February 28, 2026</time>
          </p>
        </div>
      </div>

      <div className="pt-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
          <p className="text-muted-foreground mb-12">
            In February 2026, we conducted a deep-research audit of every
            statistical claim on capveri.com. Several claims that were
            previously attributed to formal industry studies could not be traced
            to publicly accessible primary sources. This page reflects that
            audit. Where sources are weak, we say so.
          </p>

          {/* Industry Statistics */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Industry Statistics</h2>
            <p className="text-muted-foreground mb-6">
              Third-party data points cited across the marketing site. Each
              claim includes its source, reliability rating, and links to the
              best available references. Reliability reflects whether a primary,
              methodology-disclosing source was located.
            </p>
            <div className="space-y-6">
              {industryStats.map((stat) => (
                <div
                  key={stat.id}
                  id={stat.id}
                  className="border rounded-lg p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-foreground">
                      {stat.claim}
                    </h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap",
                          reliabilityColors[stat.reliability],
                        )}
                      >
                        {stat.reliability} reliability
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-primary mb-1">
                    {stat.source}
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    {stat.detail}
                  </p>
                  <p className="text-xs text-muted-foreground/80 italic mb-2">
                    {stat.reliabilityNote}
                  </p>
                  {stat.urls && stat.urls.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {stat.urls.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {link.label}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* CapVeri-Specific Claims */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">
              CapVeri-Specific Claims
            </h2>
            <p className="text-muted-foreground mb-6">
              These figures are derived from internal customer data and standard
              CRE calculations. They are not third-party research and have not
              been independently validated.
            </p>
            <div className="space-y-6">
              {internalClaims.map((claim) => (
                <div key={claim.claim} className="border rounded-lg p-5">
                  <h3 className="font-semibold text-foreground mb-2">
                    {claim.claim}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {claim.methodology}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Standards Referenced */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">
              Standards Referenced
            </h2>
            <div className="space-y-6">
              {standards.map((standard) => (
                <ExternalLinkCard
                  key={standard.name}
                  id={standard.id}
                  name={standard.name}
                  description={standard.description}
                  url={standard.url}
                />
              ))}
            </div>
          </section>

          {/* Legal & Case Law */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Legal & Case Law</h2>
            <p className="text-muted-foreground mb-6">
              Court cases, legislation, and legal references cited in our
              content. Case citations are for educational purposes and do not
              constitute legal advice.
            </p>
            <div className="space-y-6">
              {legalCases.map((item) => (
                <ExternalLinkCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  description={item.description}
                  url={item.url}
                />
              ))}
            </div>
          </section>

          {/* Market Data & Reports */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">
              Market Data & Reports
            </h2>
            <p className="text-muted-foreground mb-6">
              Market research reports and data sources used for regional vacancy
              rates, operating expense benchmarks, and industry trends.
            </p>
            <div className="space-y-6">
              {marketReports.map((item) => (
                <ExternalLinkCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  description={item.description}
                  url={item.url}
                />
              ))}
            </div>
          </section>

          {/* Professional & Educational References */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">
              Professional & Educational References
            </h2>
            <p className="text-muted-foreground mb-6">
              Law firm analyses, industry publications, and educational
              resources cited across our blog and resource articles.
            </p>
            <div className="space-y-6">
              {professionalReferences.map((item) => (
                <ExternalLinkCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  description={item.description}
                  url={item.url}
                />
              ))}
            </div>
          </section>

          {/* Methodology Notes */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Methodology Notes</h2>
            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Value Range Method
                </h3>
                <p className="text-sm">
                  Value figures compare two numbers. First uses modeled annual
                  billing variance. Second is current subscription cost from the
                  pricing page. The modeled range uses benchmark assumptions.
                  These include 200,000 SF, IREM office opex, CPI adjustment,
                  and scenario leakage rates. Results vary by lease complexity
                  and process quality.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Building Value Impact
                </h3>
                <p className="text-sm">
                  We calculate building value impact using the standard
                  income-capitalization method: increased NOI divided by cap
                  rate. We use a 7% cap rate as representative of mid-market
                  commercial properties. Actual cap rates range from 4% to 10%+
                  depending on market, asset class, and property condition.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Source Verification Process
                </h3>
                <p className="text-sm">
                  In February 2026, we attempted to trace every statistical
                  claim on this site to a publicly accessible primary source
                  (published study, survey, or official documentation). Claims
                  rated &ldquo;low reliability&rdquo; could only be found in
                  secondary blog posts or vendor marketing without disclosed
                  methodology. Claims rated &ldquo;high reliability&rdquo; have
                  primary sources with published documentation. We continue to
                  update these ratings as better sources become available.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Corrections Policy
                </h3>
                <p className="text-sm">
                  If you believe any claim on this site is inaccurate or
                  inadequately sourced, contact us at{" "}
                  <a
                    href={
                      publicKnowledge.contacts.byId["source-feedback"].mailto
                    }
                    className="text-primary hover:underline"
                  >
                    {publicKnowledge.contacts.byId["source-feedback"].email}
                  </a>
                  . We will investigate and update this page.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
