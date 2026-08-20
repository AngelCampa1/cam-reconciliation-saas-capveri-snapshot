import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart,
  ChevronRight,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Benchmarks by Property Type: 2026 Operating Expense Ranges",
  description:
    "What is a reasonable CAM rate for office, retail, and industrial properties in 2026? Operating expense benchmarks by property type, with sources and how to interpret them.",
  alternates: {
    canonical: `${SITE_URL}/resources/cam-benchmarks-by-property-type`,
  },
  openGraph: {
    title: "CAM Benchmarks by Property Type: 2026 Operating Expense Ranges",
    description:
      "What is a reasonable CAM rate for office, retail, and industrial properties in 2026? Operating expense benchmarks by property type, with sources and how to interpret them.",
    url: `${SITE_URL}/resources/cam-benchmarks-by-property-type`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question: "What is a typical CAM charge for an office building in 2026?",
    answer:
      "Class A office buildings typically carry a CAM component of $4–8 per rentable SF per year, with total operating expenses (including management fee, insurance, and taxes if included) ranging from $8–15/SF. Class B and suburban office runs lower at $3–6/SF for CAM. These ranges reflect institutional portfolios in major U.S. markets; older buildings, high-amenity properties, or buildings in high-cost markets (San Francisco, Manhattan) will often exceed these ranges.",
  },
  {
    question: "Are CAM benchmarks the same as typical outcomes?",
    answer:
      "No. Benchmarks are ranges drawn from observed portfolios and should be treated as reference points, not performance targets or caps. A $5/SF CAM rate at a 1975-vintage building with aging HVAC infrastructure is not comparable to a $5/SF rate at a 2018 Class A property. Benchmarks are most useful for flagging outliers that warrant investigation. Do not use them to make lease or budget decisions on their own.",
  },
  {
    question: "Why is industrial CAM so much lower than office CAM?",
    answer:
      "Industrial properties have far fewer amenity-driven expense categories. Office buildings carry significant costs for lobbies, elevators, restrooms, HVAC in occupied suites, concierge services, and high-finish common areas. A warehouse or distribution center has a concrete pad, a roof, dock doors, and a parking lot. The expense base is structurally smaller. Flex industrial has slightly higher CAM than pure warehouse because it typically includes office-finish common areas and restrooms.",
  },
  {
    question: "How should I adjust national benchmarks for my market?",
    answer:
      "Apply a cost-of-living adjustment for labor (janitorial, security) and a construction-cost index for maintenance and repairs. Markets like San Francisco, New York, Boston, and Seattle carry labor costs 40–80% above national averages, which flows directly into janitorial, security, and engineering expenses. National benchmarks should be treated as a floor in high-cost markets, not a ceiling.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: "/" },
  { name: "Resources", url: "/resources" },
  {
    name: "CAM Benchmarks by Property Type",
    url: "/resources/cam-benchmarks-by-property-type",
  },
]);

const articleSchema = structuredDataSchemas.article({
  headline: "CAM Benchmarks by Property Type: 2026 Operating Expense Ranges",
  description:
    "What is a reasonable CAM rate for office, retail, and industrial properties in 2026? Operating expense benchmarks by property type, with sources and how to interpret them.",
  url: `${SITE_URL}/resources/cam-benchmarks-by-property-type`,
  datePublished: "2026-01-15",
  dateModified: "2026-04-26",
  author: {
    name: "Angel Campa",
    jobTitle: "Founder, CapVeri",
    url: `${SITE_URL}/about/angel-campa`,
  },
  wordCount: 1400,
  articleSection: "Benchmarks",
});

const benchmarks = [
  {
    type: "Class A Office",
    camRange: "$4–8/SF",
    totalOpex: "$8–15/SF",
    keyDrivers:
      "HVAC, engineering staff, security, amenities, high-finish lobbies",
  },
  {
    type: "Class B / Suburban Office",
    camRange: "$3–6/SF",
    totalOpex: "$6–10/SF",
    keyDrivers: "HVAC maintenance, janitorial, parking lot, landscaping",
  },
  {
    type: "Retail – Neighborhood / Strip",
    camRange: "$3–6/SF",
    totalOpex: "Varies (often included in NNN base)",
    keyDrivers:
      "Parking lot maintenance, landscaping, exterior lighting, trash",
  },
  {
    type: "Retail – Power Center / Lifestyle",
    camRange: "$2–5/SF",
    totalOpex: "Varies by anchor structure",
    keyDrivers:
      "Shared parking, outdoor common area, management fee, insurance",
  },
  {
    type: "Industrial – Warehouse / Distribution",
    camRange: "$1–3/SF",
    totalOpex: "$1.50–4/SF",
    keyDrivers: "Roof, dock doors, truck court, exterior lighting, landscaping",
  },
  {
    type: "Industrial – Flex",
    camRange: "$2–4/SF",
    totalOpex: "$3–6/SF",
    keyDrivers: "Office-finish common areas, HVAC, janitorial, restrooms",
  },
];

export default function CamBenchmarksByPropertyTypePage() {
  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      <main className="mx-auto max-w-4xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
        <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-foreground">
            CAM Benchmarks by Property Type
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            CAM Benchmarks by Property Type: 2026 Operating Expense Ranges
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            CAM rates vary significantly by property type, location, and
            building vintage. This guide provides operating expense ranges for
            office, retail, and industrial properties, explains what drives
            variation within each category, and shows how to use benchmarks as a
            self-audit tool, not a budget ceiling.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>{" "}
            · Updated April 2026
          </p>
        </header>

        {/* Featured snippet */}
        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            CAM rates vary significantly by property type, location, and age of
            building. Office properties typically carry the highest CAM (driven
            by HVAC, security, engineering staff, and amenities), industrial the
            lowest. Class A office often runs $4–8/SF/year in CAM alone; a
            warehouse might run $1–3/SF. These figures are illustrative ranges
            from institutional portfolios. Individual properties vary
            significantly based on building age, market, and lease structure.
          </p>
        </div>

        {/* Benchmark table */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            2026 CAM Benchmark Ranges by Property Type
          </h2>
          <div className="mb-4 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">
                    Property Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Typical CAM Range
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Total Opex Range
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Key Cost Drivers
                  </th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((row, i) => (
                  <tr
                    key={row.type}
                    className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                  >
                    <td className="px-4 py-3 font-medium">{row.type}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.camRange}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.totalOpex}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.keyDrivers}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong>Data methodology:</strong> Ranges reflect operating expenses
            observed in institutional CRE portfolios across multiple U.S.
            markets. Sources include BOMA Experience Exchange Report (BOMA EER),
            CBRE market data, and IREM OEMA benchmarks for the 2024–2026 period.
            Individual properties vary significantly based on age, location,
            amenity level, and lease structure. These figures are illustrative
            examples, not guarantees of typical outcomes, and should not be used
            as the basis for financial projections or lease negotiations without
            property-specific analysis.
          </div>
        </section>

        {/* Office deep dive */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Office: What Drives the Wide Range
          </h2>
          <p className="mb-4 text-muted-foreground">
            The $4–8/SF CAM range for Class A office reflects a genuinely wide
            spread in operating profiles. The primary drivers of variation:
          </p>
          <ul className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <strong className="text-foreground">Building vintage:</strong> A
              1985-vintage office tower with original HVAC equipment will spend
              significantly more on maintenance and energy than a 2015 building
              with a high-efficiency system. Older buildings often carry HVAC
              operating costs 40–70% above newer equivalents.
            </li>
            <li>
              <strong className="text-foreground">Amenity level:</strong>{" "}
              Buildings with conference centers, fitness facilities, food and
              beverage, and concierge services carry materially higher
              janitorial, utility, and staffing costs than plain vanilla office.
            </li>
            <li>
              <strong className="text-foreground">Market labor costs:</strong>{" "}
              Janitorial and security are labor-intensive. In San Francisco or
              New York, wages for these roles run 50–80% above the national
              average, pushing CAM above the range floor even in buildings that
              would otherwise be unremarkable.
            </li>
          </ul>
        </section>

        {/* Retail deep dive */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Retail: Why CAM Varies Between Center Types
          </h2>
          <p className="mb-4 text-muted-foreground">
            Retail CAM is heavily influenced by the parking field. A
            neighborhood strip center may spend $1.00–$1.50/SF on parking lot
            maintenance, striping, sweeping, and snow removal alone. A lifestyle
            center with landscaped outdoor commons, fountains, and event
            infrastructure carries substantial ongoing maintenance costs that a
            power center with asphalt and minimal landscaping does not.
          </p>
          <p className="mb-4 text-muted-foreground">
            The management fee structure in retail leases also creates
            variation. An 8% management fee applied to a $4/SF operating expense
            base adds $0.32/SF to the recoverable pool. Some retail leases cap
            the management fee at a fixed dollar amount; others apply it to the
            gross recoverable expense pool including insurance and taxes. The
            management fee treatment is one of the most frequently audited line
            items in retail CAM.
          </p>
        </section>

        {/* Industrial deep dive */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Industrial: The Lean Profile and Its Exceptions
          </h2>
          <p className="mb-4 text-muted-foreground">
            Pure warehouse and distribution CAM is lean because the expense
            categories are few: roof maintenance and replacement (often
            amortized), dock door and leveler maintenance, truck court and
            parking pavement, exterior lighting, and landscaping. There is no
            HVAC in the warehouse bay (or minimal heating only), no janitorial
            beyond office areas, and no amenity infrastructure.
          </p>
          <p className="mb-4 text-muted-foreground">
            Flex industrial breaks from that pattern because it includes office
            buildouts with full HVAC, finished common areas, and restrooms. All
            of those require janitorial, HVAC maintenance, and periodic capital
            improvement. A flex portfolio that is benchmarked against pure
            warehouse standards will always look expensive on paper.
          </p>
        </section>

        {/* How to use benchmarks */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            How to Use These Benchmarks for Self-Auditing
          </h2>
          <p className="mb-4 text-muted-foreground">
            The most productive use of CAM benchmarks is outlier identification,
            not budget-setting. If your Class B suburban office building is
            running $9/SF in total operating expenses when the range is
            $6–10/SF, that is within bounds. If it is running $14/SF, that
            warrants investigation. The question is not whether the number is
            above the range. It may have a legitimate explanation. The real
            question is whether you can explain the variance with specific
            facts.
          </p>
          <p className="mb-4 text-muted-foreground">
            For internal portfolio benchmarking, normalize by building age
            cohort (pre-2000, 2000–2015, 2015+) and by submarket before
            comparing across properties. A portfolio that spans markets from
            Phoenix to Manhattan should never use a single national benchmark as
            its performance target. The structural cost differences are too
            large.
          </p>
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <BarChart className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Portfolio tip:</strong> Track
              CAM per SF by property over three or more years. A property that
              is within benchmark range but growing 8% per year while comparable
              properties are growing 3% is more concerning than one that sits
              slightly above the range with a stable year-over-year trend.
            </p>
          </div>
        </section>

        {/* What Can Go Wrong */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using retail benchmarks for mixed-use properties
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A mixed-use building with retail on the ground floor and
                    office above has a fundamentally different expense profile
                    than a pure retail center. The office portion requires HVAC
                    maintenance, elevator service, and restroom janitorial that
                    are not typical retail expenses. Applying retail benchmarks
                    to the entire building understates legitimate CAM in the
                    office component. This may cause a landlord to underbill
                    tenants or accept incorrect audit findings.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Using national benchmarks for high-cost markets without
                    adjustment
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A property manager who compares a San Francisco Class A
                    office building against national BOMA averages will conclude
                    the building is dramatically over-budget when it is actually
                    performing in line with the local market. San Francisco
                    janitorial rates, security costs, and elevator maintenance
                    contracts are 50–80% above national averages. The right
                    benchmark is the local market, not a national average that
                    includes Dallas and Kansas City.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating the benchmark as a cap rather than a reference
                    point
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A tenant audit firm that claims your $9/SF office CAM is
                    "above benchmark" and therefore overbilled has misused the
                    data. Benchmarks describe observed distributions. They do
                    not establish what is contractually recoverable. A lease
                    that allows recovery of all operating expenses does not
                    become invalid because those expenses exceed a national
                    average. Landlords should never accept audit settlements
                    based solely on benchmark comparisons without a
                    lease-specific analysis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                What is a typical CAM charge for an office building in 2026?
              </h3>
              <p className="text-sm text-muted-foreground">
                Class A office buildings typically carry a CAM component of $4–8
                per rentable SF per year, with total operating expenses ranging
                from $8–15/SF. Class B and suburban office runs lower at $3–6/SF
                for CAM. These ranges reflect institutional portfolios in major
                U.S. markets; older buildings or properties in high-cost markets
                will often exceed these ranges.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Are CAM benchmarks the same as typical outcomes?
              </h3>
              <p className="text-sm text-muted-foreground">
                No. Benchmarks are ranges drawn from observed portfolios and
                should be treated as reference points, not performance targets
                or caps. A $5/SF CAM rate at a 1975-vintage building with aging
                HVAC infrastructure is not comparable to a $5/SF rate at a 2018
                Class A property. Benchmarks are most useful for flagging
                outliers that warrant investigation. Do not use them to make
                lease or budget decisions on their own.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Why is industrial CAM so much lower than office CAM?
              </h3>
              <p className="text-sm text-muted-foreground">
                Industrial properties have far fewer amenity-driven expense
                categories. Office buildings carry significant costs for
                lobbies, elevators, restrooms, HVAC in occupied suites, and
                high-finish common areas. A warehouse has a concrete pad, a
                roof, dock doors, and a parking lot. The expense base is
                structurally smaller. Flex industrial is slightly higher because
                it includes office-finish common areas and restrooms.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How should I adjust national benchmarks for my market?
              </h3>
              <p className="text-sm text-muted-foreground">
                Apply a cost-of-living adjustment for labor (janitorial,
                security) and a construction-cost index for maintenance and
                repairs. Markets like San Francisco, New York, Boston, and
                Seattle carry labor costs 40–80% above national averages, which
                flows directly into janitorial, security, and engineering
                expenses. National benchmarks should be treated as a floor in
                high-cost markets, not a ceiling.
              </p>
            </div>
          </div>
        </section>

        {/* Related resources */}
        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/cam-benchmark-methodology"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">CAM Benchmark Methodology</p>
              <p className="mt-1 text-sm text-muted-foreground">
                How to interpret expense ranges and build portfolio benchmarks
              </p>
            </Link>
            <Link
              href="/resources/office-cam-reconciliation"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Office CAM Reconciliation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete guide to office property CAM reconciliation
              </p>
            </Link>
            <Link
              href="/resources/retail-cam-reconciliation"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Retail CAM Reconciliation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Retail-specific CAM issues including management fees and anchor
                exclusions
              </p>
            </Link>
            <Link
              href="/resources/industrial-cam-reconciliation"
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">Industrial CAM Reconciliation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Industrial and flex property CAM reconciliation guide
              </p>
            </Link>
          </div>
        </section>

        {/* Dark CTA */}
        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            See How Your Portfolio Compares
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri analyzes your reconciliation against property-type and
            market benchmarks, identifying line items that warrant a closer look
            and flagging potential billing errors before tenants find them.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a href={buildTrialLink({ content: "cam_benchmarks_cta" })}>
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
