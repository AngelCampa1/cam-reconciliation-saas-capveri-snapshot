import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, MapPin } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Commercial Tenant CAM Disclosure Requirements by State: 2026 Guide",
  description:
    "Which states require commercial landlords to disclose CAM charges to tenants? A 50-state guide to CAM disclosure obligations, reconciliation statement deadlines, and audit rights windows.",
  alternates: {
    canonical: `${SITE_URL}/resources/commercial-tenant-cam-disclosure-by-state`,
  },
  openGraph: {
    title: "Commercial Tenant CAM Disclosure Requirements by State: 2026 Guide",
    description:
      "Which states require commercial landlords to disclose CAM charges to tenants? A 50-state guide to CAM disclosure obligations, reconciliation statement deadlines, and audit rights windows.",
    url: `${SITE_URL}/resources/commercial-tenant-cam-disclosure-by-state`,
    type: "article",
  },
};

const faqSchema = structuredDataSchemas.faqPage([
  {
    question:
      "Do most states have specific commercial CAM disclosure statutes?",
    answer:
      "No. Most U.S. states do not have specific commercial CAM disclosure statutes. Commercial real estate is generally treated as a business-to-business transaction where the lease governs the disclosure and audit rights obligations. California is the most significant exception, with SB 1103 (effective January 1, 2025) imposing specific itemized CAM disclosure requirements for qualified commercial tenants.",
  },
  {
    question:
      "What are the market-standard CAM reconciliation deadlines in states without specific statutes?",
    answer:
      "In states without specific CAM disclosure statutes, well-drafted leases typically provide: reconciliation statement delivery within 90–120 days after the lease year end, tenant audit rights windows of 12–24 months after statement delivery, and tenant dispute windows of 30–60 days after receiving the statement. These are market standards, not legal requirements - the lease terms govern.",
  },
  {
    question:
      "Does California SB 1103 apply to all California commercial tenants?",
    answer:
      "No. SB 1103 applies only to'qualified commercial tenants' - those meeting ALL THREE conditions simultaneously: (1) annual gross receipts of $250 million or less, (2) leasing 10,000 SF or less of commercial space, AND (3) in a building of 100,000 SF or less in total. All three conditions must be met; a large tenant in a small building, a small tenant in a large building, or any tenant with more than $250M in revenues does not qualify.",
  },
  {
    question:
      "How can a landlord protect itself in states without statutory disclosure requirements?",
    answer:
      "In states without specific CAM disclosure statutes, the lease is the primary protection. Landlords should ensure their leases include: a defined reconciliation period with a stated delivery deadline, a tenant audit rights window that is reasonable but time-limited, an estoppel provision where failure to dispute within a specified window waives the tenant's right to dispute, and a clear definition of what supporting documentation will be provided.",
  },
]);

const breadcrumbSchema = structuredDataSchemas.breadcrumbList([
  { name: "Home", url: `${SITE_URL}/` },
  { name: "Resources", url: `${SITE_URL}/resources` },
  {
    name: "CAM Disclosure Requirements by State",
    url: `${SITE_URL}/resources/commercial-tenant-cam-disclosure-by-state`,
  },
]);

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Commercial Tenant CAM Disclosure Requirements by State: 2026 Guide",
  description:
    "State-by-state guide to commercial CAM disclosure obligations, reconciliation statement deadlines, and audit rights windows for major U.S. commercial real estate markets.",
  author: {
    "@type": "Person",
    name: "Angel Campa",
    url: `${SITE_URL}/about/angel-campa`,
  },
  publisher: { "@type": "Organization", name: "CapVeri", url: SITE_URL },
  dateModified: "2026-04-01",
  url: `${SITE_URL}/resources/commercial-tenant-cam-disclosure-by-state`,
};

export default function CamDisclosureByStatePage() {
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
            CAM Disclosure Requirements by State
          </span>
        </nav>

        <header className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Commercial Tenant CAM Disclosure Requirements by State: 2026 Guide
          </h1>
          <p className="mb-6 text-xl text-muted-foreground">
            Most U.S. states impose no specific statutory disclosure obligations
            on commercial landlords for CAM charges. The lease governs.
            California has enacted SB 1103, and other states are seeing
            increased legislative attention to commercial tenant transparency.
            This guide covers the states with statutes and the market standards
            that apply everywhere else.
          </p>
          <p className="text-sm text-muted-foreground">
            By{" "}
            <Link
              href="/about/angel-campa"
              className="text-foreground hover:underline"
            >
              Angel Campa, Founder, CapVeri
            </Link>
            {""}· Updated April 2026
          </p>
        </header>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">Methodology note:</span> State law
              changes frequently, and this guide reflects publicly available
              information as of April 2026. This is not legal advice. Verify
              current requirements with qualified real estate counsel in the
              applicable jurisdiction before relying on this guide for
              compliance decisions.
            </p>
          </div>
        </div>

        <div className="mb-10 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-lg font-semibold">Quick Answer</h2>
          <p className="text-muted-foreground">
            Most states have no specific commercial CAM disclosure statutes. The
            lease governs. California (SB 1103) is the most significant
            exception, imposing specific itemized disclosure requirements on
            qualified commercial tenants (ALL THREE of: revenues ≤ $250M, space
            ≤ 10,000 SF, building ≤ 100,000 SF). This guide covers the states
            with statutes and the market standard deadlines and audit rights
            windows for states that rely on lease terms.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            States with Statutory CAM Disclosure Requirements
          </h2>
          <p className="mb-4 text-muted-foreground">
            Commercial CAM disclosure statutes are rare. The commercial real
            estate industry has historically operated on the principle that
            sophisticated parties negotiate disclosure terms in the lease. That
            is changing at the margins, with California leading the way.
          </p>

          <div className="mb-6 rounded-lg border-2 border-primary/20 p-6">
            <div className="mb-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary" />
              <p className="text-lg font-semibold">
                California - SB 1103 (Cal. Civil Code §827.1)
              </p>
            </div>
            <p className="mb-4 text-muted-foreground">
              <strong>Effective:</strong> January 1, 2025
            </p>
            <p className="mb-3 text-muted-foreground">
              California is currently the only state with a specific,
              comprehensive commercial CAM disclosure statute. SB 1103 requires
              landlords to provide itemized CAM disclosures to{""}
              <strong>qualified commercial tenants</strong> - those meeting ALL
              THREE conditions:
            </p>
            <ul className="mb-4 space-y-1 text-sm text-muted-foreground">
              <li>(1) Annual gross receipts of $250 million or less</li>
              <li>(2) Leasing 10,000 SF or less of commercial space</li>
              <li>(3) In a building of 100,000 SF or less</li>
            </ul>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded bg-muted/40 p-3">
                <p className="font-medium">Initial disclosure deadline</p>
                <p className="text-muted-foreground">
                  Within 90 days of lease commencement
                </p>
              </div>
              <div className="rounded bg-muted/40 p-3">
                <p className="font-medium">Annual disclosure deadline</p>
                <p className="text-muted-foreground">
                  Within 90 days of reconciliation period end
                </p>
              </div>
              <div className="rounded bg-muted/40 p-3">
                <p className="font-medium">Penalty for willful violation</p>
                <p className="text-muted-foreground">
                  Actual damages + treble damages (qualified tenants only)
                </p>
              </div>
              <div className="rounded bg-muted/40 p-3">
                <p className="font-medium">What must be disclosed</p>
                <p className="text-muted-foreground">
                  Itemized charges, calculation basis, YOY comparison, contact
                  info
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              See the{""}
              <Link
                href="/resources/california-sb-1103-cam-guide"
                className="text-foreground hover:underline"
              >
                full SB 1103 guide
              </Link>
              {""}
              for the complete qualified tenant analysis, compliance checklist,
              and disclosure requirements.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/40 p-5">
            <p className="mb-2 font-medium">Other States: Emerging Activity</p>
            <p className="text-sm text-muted-foreground">
              Several states have seen legislative proposals or tenant advocacy
              efforts around commercial lease transparency:
            </p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Oregon:</span>
                {""}
                Commercial lease transparency has been discussed in the context
                of small business tenant advocacy, but no specific CAM
                disclosure statute has been enacted as of April 2026.
              </li>
              <li>
                <span className="font-medium text-foreground">New York:</span>
                {""}
                Commercial lease disclosure proposals have been introduced in
                the state legislature, particularly focused on retail tenants in
                New York City. None have been enacted into law as of April 2026.
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Monitor state legislative developments annually. The California SB
              1103 model may be adopted by other states with large
              small-business commercial tenant populations.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Market Standard for States Without Specific Statutes
          </h2>
          <p className="mb-4 text-muted-foreground">
            In the 49+ states without specific commercial CAM disclosure
            statutes, the lease governs entirely. Well-drafted leases in major
            commercial markets typically include the following market-standard
            provisions:
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 font-medium text-sm">
                Reconciliation Delivery
              </p>
              <p className="text-2xl font-bold">90–120</p>
              <p className="text-sm text-muted-foreground">
                days after lease year end
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Most institutional landlords target 90 days; 120 days is the
                outer limit in most market leases
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 font-medium text-sm">Audit Rights Window</p>
              <p className="text-2xl font-bold">12–24</p>
              <p className="text-sm text-muted-foreground">
                months after statement delivery
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                12 months is institutional standard; 24 months is more common in
                tenant-favorable markets
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 font-medium text-sm">Dispute Window</p>
              <p className="text-2xl font-bold">30–60</p>
              <p className="text-sm text-muted-foreground">
                days after receiving statement
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Failure to dispute within this window typically waives the
                tenant&apos;s right to challenge the statement
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            State-by-State Guide: 10 Major CRE Markets
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">State</th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    Specific Statute?
                  </th>
                  <th className="pb-2 pr-4 text-left font-medium">
                    Reconciliation Deadline
                  </th>
                  <th className="pb-2 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  [
                    "California",
                    "Yes - SB 1103",
                    "90 days (qualified tenants)",
                    "Itemized disclosure required; treble damages for willful violation affecting qualified tenants (all 3 conditions: ≤$250M revenue, ≤10K SF, ≤100K SF building)",
                  ],
                  [
                    "Texas",
                    "No",
                    "90 days (market standard)",
                    "Lease governs; strong landlord-favorable market. Houston and Dallas/Fort Worth leases often follow BOMA standards. No statewide disclosure statute.",
                  ],
                  [
                    "New York",
                    "No",
                    "90–120 days (market standard)",
                    "No specific statute; NYC market has strong tenant negotiating power, resulting in bespoke disclosure provisions in larger leases. Proposals introduced but not enacted.",
                  ],
                  [
                    "Florida",
                    "No",
                    "90–120 days (market standard)",
                    "Lease governs. Miami, Orlando, and Tampa markets follow national institutional standards. No statewide commercial disclosure requirement.",
                  ],
                  [
                    "Illinois",
                    "No",
                    "90–120 days (market standard)",
                    "Chicago market has strong tenant negotiating power in Class A office. Custom disclosure provisions common in larger leases; smaller properties follow standard market terms.",
                  ],
                  [
                    "Georgia",
                    "No",
                    "90–120 days (market standard)",
                    "Atlanta market follows institutional standards. Lease governs; no statewide disclosure requirement.",
                  ],
                  [
                    "Washington",
                    "No",
                    "90–120 days (market standard)",
                    "Seattle market follows institutional standards. Tech-company tenants often negotiate strong audit rights. Lease governs.",
                  ],
                  [
                    "Colorado",
                    "No",
                    "90–120 days (market standard)",
                    "Denver market follows institutional standards. Lease governs; no statewide commercial disclosure requirement.",
                  ],
                  [
                    "Arizona",
                    "No",
                    "90–120 days (market standard)",
                    "Phoenix market follows institutional standards. Lease governs; no statewide commercial disclosure requirement.",
                  ],
                  [
                    "Virginia",
                    "No",
                    "90–120 days (market standard)",
                    "DC metro market (Northern Virginia) follows institutional standards driven by government and tech tenants. Lease governs; no statewide commercial disclosure requirement.",
                  ],
                ].map(([state, statute, deadline, notes]) => (
                  <tr key={state} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{state}</td>
                    <td
                      className={`py-3 pr-4 font-medium ${
                        statute.startsWith("Yes")
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {statute}
                    </td>
                    <td className="py-3 pr-4">{deadline}</td>
                    <td className="py-3 text-xs">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Market standard deadlines are not legally required in states without
            specific statutes - they reflect common lease provisions in
            institutional-quality properties. Actual lease terms vary
            significantly.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold">
            Multi-State Portfolio: Compliance Framework
          </h2>
          <p className="mb-4 text-muted-foreground">
            For landlords operating in multiple states, the practical compliance
            approach is to:
          </p>
          <ol className="mb-4 space-y-3 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                1. Identify all California properties.
              </span>
              {""}
              For each California property, identify tenants in buildings at or
              below 100,000 SF and evaluate whether they meet all three SB 1103
              qualified tenant conditions. These tenants require statutory
              compliance regardless of lease terms.
            </li>
            <li>
              <span className="font-medium text-foreground">
                2. Review leases for explicit disclosure provisions.
              </span>
              {""}
              In all other states, the lease governs. Review each lease for
              reconciliation delivery deadlines, audit rights windows, and
              dispute periods. Calendar these dates in your property management
              system.
            </li>
            <li>
              <span className="font-medium text-foreground">
                3. Apply institutional market standards as a floor.
              </span>
              {""}
              Where leases are silent on disclosure details, apply the 90-day
              delivery / 12-month audit rights / 30-day dispute window standard
              as your operational baseline.
            </li>
            <li>
              <span className="font-medium text-foreground">
                4. Monitor state legislative activity annually.
              </span>
              {""}
              California&apos;s SB 1103 model may be replicated in other states.
              States with active small-business tenant advocacy communities (New
              York, Oregon, Illinois) are the most likely targets for new
              legislation.
            </li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">What Can Go Wrong</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Missing SB 1103 deadlines for California qualified tenants
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Landlords who apply national portfolio processes uniformly
                    may send California CAM statements in April or May - too
                    late for the SB 1103 90-day requirement for qualified
                    commercial tenants. California properties with small tenants
                    require a dedicated compliance track.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Assuming all states follow the same lease standard
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Using a uniform 120-day reconciliation delivery policy may
                    violate lease provisions in markets where the lease
                    specifies 90 days. In states with strong tenant negotiating
                    power (New York, San Francisco), lease audit rights windows
                    may be 24 months - missing a window can waive tenant rights
                    but also creates relationship and litigation risk for the
                    landlord.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive-strong">
                    Treating SB 1103 treble damages as applying to all tenants
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    SB 1103&apos;s treble damages provision applies only to
                    qualified commercial tenants - those meeting ALL THREE
                    conditions (revenues ≤ $250M, space ≤ 10,000 SF, building ≤
                    100,000 SF). Mischaracterizing the statute&apos;s scope
                    either creates unnecessary alarm or understates the actual
                    risk for the specific tenant category it covers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">
                Do most states have specific commercial CAM disclosure statutes?
              </h3>
              <p className="text-muted-foreground">
                No. Most U.S. states have no specific commercial CAM disclosure
                statutes. The lease governs in most states. California (SB 1103)
                is the most significant exception as of 2026.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                What are the market-standard CAM reconciliation deadlines?
              </h3>
              <p className="text-muted-foreground">
                Market standards in states without specific statutes: 90–120
                days for reconciliation delivery, 12–24 months for tenant audit
                rights, and 30–60 days for tenant dispute windows after
                receiving the statement. These are lease standards, not legal
                requirements.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                Does California SB 1103 apply to all California commercial
                tenants?
              </h3>
              <p className="text-muted-foreground">
                No. SB 1103 applies only to qualified commercial tenants meeting
                ALL THREE conditions: (1) annual gross receipts of $250 million
                or less, (2) leasing 10,000 SF or less, AND (3) in a building of
                100,000 SF or less. All three conditions must be satisfied
                simultaneously.
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">
                How can a landlord protect itself in states without statutory
                disclosure requirements?
              </h3>
              <p className="text-muted-foreground">
                Use strong lease language: a defined reconciliation delivery
                deadline, a time-limited tenant audit rights window (12 months
                is standard), an estoppel provision where failure to dispute
                within 30–60 days waives challenge rights, and a clear
                definition of what supporting documentation will be provided
                with the reconciliation.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-6 text-2xl font-semibold">Related Resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/resources/california-sb-1103-cam-guide"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">California SB 1103 CAM Guide</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Full qualified tenant analysis, compliance checklist, and
                disclosure requirements for SB 1103.
              </p>
            </Link>
            <Link
              href="/resources/cam-reconciliation-deadlines"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Reconciliation Deadlines</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Lease-year-end deadlines and the operational calendar for
                on-time CAM delivery.
              </p>
            </Link>
            <Link
              href="/resources/cam-overbilling-landlord-liability"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">CAM Overbilling Landlord Liability</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When CAM errors create legal liability and how to mitigate
                exposure.
              </p>
            </Link>
            <Link
              href="/resources/states/california/cam-compliance"
              className="rounded-lg border p-4 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <p className="font-medium">California CAM Compliance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete overview of California commercial lease CAM
                requirements.
              </p>
            </Link>
          </div>
        </section>

        <div className="rounded-xl bg-foreground p-8 text-center text-background">
          <h2 className="mb-3 text-2xl font-bold">
            Manage CAM Disclosure Compliance Across Every State
          </h2>
          <p className="mb-6 text-background/80">
            CapVeri tracks reconciliation deadlines, audit rights windows, and
            California SB 1103 qualified tenant classifications, giving you a
            single compliance view for your entire portfolio regardless of how
            many states you operate in.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-background text-foreground hover:bg-background/90"
          >
            <a
              href={buildTrialLink({
                content: "cam_disclosure_by_state_cta",
              })}
            >
              Start free trial <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </main>
    </>
  );
}
