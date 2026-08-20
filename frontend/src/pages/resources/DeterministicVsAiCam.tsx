/**
 * Resource Page: Deterministic vs. AI CAM Reconciliation
 *
 * SEO content pillar C targeting "AI CAM reconciliation software" keyword.
 * Positions CapVeri's deterministic engine as the auditable, court-defensible
 * alternative to probabilistic AI calculation.
 */

import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Scale,
  Calculator,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { buildSiteUrl } from '@/lib/domains'

// ============================================================================
// Data
// ============================================================================

const faqData = [
  {
    question:
      'Can AI software accurately calculate CAM reconciliation charges?',
    answer:
      'AI language models can generate plausible-looking CAM reconciliation outputs, but they cannot guarantee accuracy in the way financial documentation requires. The core problem is reproducibility: an LLM may produce a different answer on two runs with the same inputs. For a financial calculation that must be auditable and defensible, that is not acceptable. AI is better suited to extraction tasks (reading leases, classifying GL codes, flagging anomalies) than to the calculation itself.',
  },
  {
    question: 'What makes a CAM reconciliation audit-trail compliant?',
    answer:
      'A compliant audit trail shows every step of the calculation: the gross-up formula and inputs, each expense category determination, the pro-rata share calculation, cap application, and the final settlement figure. It must be reproducible. A CPA should be able to take the same inputs and arrive at the same number. It should also be stored in a way that is retrievable years later, since CAM disputes often arise 12 to 24 months after the reconciliation period.',
  },
  {
    question:
      'How does deterministic calculation differ from probabilistic reconciliation?',
    answer:
      'A deterministic calculation engine applies explicit formulas to inputs and produces the same output every time. If you run a $2.1 million expense pool with a 73.4% occupancy rate and a 95% gross-up cap, the answer is the same today, tomorrow, and three years from now. A probabilistic reconciliation estimates what the right answer probably is based on patterns. The output may be accurate, but it cannot be proven to be, and it may change between runs.',
  },
  {
    question: 'Can a tenant dispute an AI-generated CAM reconciliation?',
    answer:
      'Yes, and with increasing frequency. Tenants and their auditors are aware that AI-generated outputs are not reproducible, and some lease audit firms specifically flag AI-generated reconciliations as a red flag. If a landlord cannot produce a step-by-step calculation methodology that an independent auditor can verify, the reconciliation is open to dispute, and potentially to reversal.',
  },
  {
    question: 'What is the risk of using AI for CAM math in commercial leases?',
    answer:
      "Three distinct risks. First, legal risk: if a tenant disputes a charge and you cannot reproduce the calculation, your position in arbitration or litigation is weak. Second, compliance risk: GAAP requires that financial calculations supporting reported figures be traceable. An AI-generated number without a calculation ledger may not meet that standard. Third, operational risk: if you cannot reproduce last year's reconciliation, you cannot audit your own errors or demonstrate that a corrected reconciliation is actually correct.",
  },
  {
    question: 'Does CapVeri use AI for calculations?',
    answer:
      'No. CapVeri uses AI only for document extraction: reading leases, identifying relevant clauses, and classifying GL entries. All of this requires human verification before the data enters the calculation pipeline. The calculations themselves run on a deterministic Python engine using exact Decimal arithmetic. Every step is logged, stored, and reproducible.',
  },
]

const comparisonRows = [
  {
    dimension: 'Accuracy',
    deterministic: 'Exact (IEEE 754 / Decimal)',
    ai: 'Approximate (probabilistic)',
  },
  {
    dimension: 'Reproducibility',
    deterministic: 'Identical re-runs guaranteed',
    ai: 'Output may vary per run',
  },
  {
    dimension: 'Audit trail',
    deterministic: 'Full step-by-step ledger',
    ai: 'Black-box reasoning',
  },
  {
    dimension: 'Court defensibility',
    deterministic: 'Yes, traceable math',
    ai: 'High risk, unexplainable',
  },
  {
    dimension: 'Edge case handling',
    deterministic: 'Explicit business rules',
    ai: 'May hallucinate precedent',
  },
]

// ============================================================================
// Page Component
// ============================================================================

export function DeterministicVsAiCamPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Deterministic vs. AI CAM Reconciliation"
        description="AI CAM reconciliation software sounds appealing, until a tenant disputes a charge. Learn why deterministic calculation, not AI, is the defensible approach for CAM math."
        canonical="/resources/deterministic-vs-ai-cam"
        structuredData={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline:
              'Deterministic vs. AI: Why CAM Reconciliation Requires Reproducible Math',
            description:
              'AI CAM reconciliation software sounds appealing, until a tenant disputes a charge. Learn why deterministic calculation, not AI, is the defensible approach for CAM math.',
            author: { '@type': 'Organization', name: 'CapVeri' },
            publisher: { '@type': 'Organization', name: 'CapVeri' },
            datePublished: '2026-02-24',
            dateModified: '2026-02-24',
            url: buildSiteUrl('/resources/deterministic-vs-ai-cam'),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqData.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer },
            })),
          },
          structuredDataSchemas.breadcrumbList([
            { name: 'Home', url: buildSiteUrl('/') },
            { name: 'Resources', url: '/resources' },
            {
              name: 'Deterministic vs. AI CAM Reconciliation',
              url: '/resources/deterministic-vs-ai-cam',
            },
          ]),
        ]}
      />
      <LandingNav variant="light" />

      <div className="pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-4xl">
          {/* Back Navigation */}
          <Link
            to="/resources"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Resources
          </Link>

          {/* Main Content */}
          <article className="prose  max-w-none">
            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
              Deterministic vs. AI: Why CAM Reconciliation Requires Reproducible
              Math
            </h1>

            {/* Byline */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
              <span>
                By{''}
                <strong className="font-medium text-foreground">CapVeri</strong>
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime="2026-02-24">Updated February 24, 2026</time>
            </div>

            {/* TL;DR */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 mb-8 not-prose">
              <h2 className="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
                <Scale className="w-5 h-5" />
                The Short Version
              </h2>
              <p className="text-foreground">
                AI CAM reconciliation software can generate plausible-looking
                outputs, but it cannot produce the same answer twice. CAM math
                has to survive tenant disputes, audits, and litigation. That
                makes this a real limitation, not a small one. Deterministic
                calculation engines apply exact arithmetic to explicit rules and
                produce identical results on every run. That is what an audit
                trail requires.
              </p>
            </div>

            {/* Section 1: The Court Test */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Scale className="w-6 h-6 text-primary" />
                The Court Test: Can Your Reconciliation Stand Up to a Tenant's
                Attorney?
              </h2>
              <p className="text-muted-foreground mb-4">
                When a tenant's attorney requests documentation for a $47,000
                CAM charge, the question isn't just "is the math right?" It's
                "can you prove it, step by step, three years from now?"
              </p>
              <p className="text-muted-foreground mb-4">
                That's the court test. And it's where AI CAM reconciliation
                software runs into a problem that no product roadmap can fix:
                probabilistic systems don't produce the same answer twice.
              </p>
              <p className="text-muted-foreground mb-4">
                A tenant files a dispute. Their auditor requests the calculation
                methodology. You hand them the output from your probabilistic
                platform. They ask: "Can you re-run this with the same inputs
                and get the same result?" In many cases, the answer is no. That
                is not how language models work.
              </p>
              <p className="text-muted-foreground">
                Courts don't accept "the AI said so" as a defensible accounting
                methodology. Neither do most lease agreements. For more on what
                a CAM reconciliation process actually involves, see our{''}
                <Link
                  to="/resources/what-is-cam-reconciliation"
                  className="text-primary hover:underline"
                >
                  CAM reconciliation guide
                </Link>
                .
              </p>
            </section>

            {/* Section 2: What Deterministic Means */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Calculator className="w-6 h-6 text-primary" />
                What "Deterministic" Means, and Why It Matters for Finance
              </h2>
              <p className="text-muted-foreground mb-4">
                A deterministic calculation is simple in concept: the same
                inputs always produce the same output. Not approximately the
                same. Identical.
              </p>
              <p className="text-muted-foreground mb-4">
                For CAM math, this means every expense allocation, every
                gross-up adjustment, and every cap calculation traces back to a
                specific formula with a specific result. You hand the inputs to
                any CPA, three years later, and they arrive at the same number.
                That's the standard financial documentation requires.
              </p>
              <p className="text-muted-foreground mb-4">
                GAAP requires that supporting calculations be reproducible and
                verifiable. An auditor needs to trace from the reconciliation
                statement back to source data and verify the arithmetic at each
                step. Deterministic CAM calculation makes that possible.
              </p>
              <p className="text-muted-foreground">
                At a technical level, deterministic engines use exact
                arithmetic. They use Python's <code>Decimal</code> type, not
                floating-point math. The difference between{''}
                <code>Decimal("2.10")</code> and <code>float(2.10)</code> is
                invisible in most contexts, but it adds up across hundreds of
                tenants and dozens of expense categories over a multi-year lease
                term. See our{''}
                <Link to="/pricing" className="text-primary hover:underline">
                  pricing
                </Link>
                {''}
                for plans that include full calculation audit logs.
              </p>
            </section>

            {/* Section 3: Audit Trail Problem */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-warning" />
                The Audit Trail Problem with Probabilistic AI
              </h2>
              <p className="text-muted-foreground mb-4">
                AI language models generate output by sampling token
                probabilities. Two calls with identical inputs can produce
                different results. Models drift between versions. There's no
                step-by-step ledger showing how each dollar was allocated, just
                a plausible-sounding answer.
              </p>
              <p className="text-muted-foreground mb-4">
                This isn't a flaw. It's how the technology works. But it creates
                a specific problem for financial documentation: you can't show
                your work.
              </p>
              <p className="text-muted-foreground mb-3">
                A proper CAM reconciliation audit trail requires:
              </p>
              <ul className="space-y-2 not-prose mb-4">
                {[
                  'The gross-up formula applied, including the specific occupancy percentage used',
                  'Each expense category and whether it was included, excluded, or capped',
                  'The pro-rata share calculation, with denominator and numerator',
                  'The cap calculation, showing base year, cumulative increases, and any floor adjustments',
                  "The tenant's estimated payments versus the calculated actual",
                  'The final settlement amount and how it was derived',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground text-sm">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                A deterministic engine produces all of this. An LLM produces a
                number and a plausible explanation. When a tenant's attorney
                asks for the underlying calculation, those are very different
                things.
              </p>
            </section>

            {/* Section 4: Comparison Table */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4">
                Side-by-Side Comparison
              </h2>
              <div className="not-prose overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Deterministic vs AI CAM comparison
                  </caption>
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th scope="col" className="text-left p-3 font-semibold">
                        Dimension
                      </th>
                      <th
                        scope="col"
                        className="text-left p-3 font-semibold text-success-strong"
                      >
                        Deterministic Engine
                      </th>
                      <th
                        scope="col"
                        className="text-left p-3 font-semibold text-warning-strong"
                      >
                        AI/LLM Calculation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row, index) => (
                      <tr
                        key={row.dimension}
                        className={
                          index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                        }
                      >
                        <td className="p-3 font-medium">{row.dimension}</td>
                        <td className="p-3 text-muted-foreground">
                          {row.deterministic}
                        </td>
                        <td className="p-3 text-muted-foreground">{row.ai}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                The reproducibility row is the one that matters most in
                practice. A 2% discrepancy between two runs of the "same"
                calculation isn't an edge case. It's a documentation failure.
              </p>
            </section>

            {/* Section 5: When AI Is Appropriate */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-success" />
                When AI Is Appropriate: Document Extraction, Not Math
              </h2>
              <p className="text-muted-foreground mb-4">
                AI is genuinely useful in the CAM reconciliation workflow. Just
                not for the math.
              </p>
              <p className="text-muted-foreground mb-4">
                Document extraction is where AI earns its place. OCR and
                intelligent classification can parse a 200-page PDF lease,
                identify the relevant CAM clauses, and flag which GL codes map
                to which expense categories. Done manually, that work takes
                hours. AI can cut it to minutes.
              </p>
              <p className="text-muted-foreground mb-4">
                CapVeri uses AI for exactly this: extraction and classification,
                with human verification required before any extracted value
                feeds into a calculation. The math itself runs on a
                deterministic Python engine using <code>Decimal</code>
                {''}
                arithmetic. No floating-point. No approximation.
              </p>
              <div className="space-y-3 not-prose">
                {[
                  {
                    step: '1',
                    label: 'Extract',
                    desc: 'AI reads the lease and identifies CAM inclusions, exclusions, caps, and gross-up provisions',
                  },
                  {
                    step: '2',
                    label: 'Verify',
                    desc: 'A human reviews and confirms the extracted values before they enter the pipeline',
                  },
                  {
                    step: '3',
                    label: 'Calculate',
                    desc: 'The deterministic engine runs the math, identically every time',
                  },
                  {
                    step: '4',
                    label: 'Audit',
                    desc: 'The full calculation ledger is stored and retrievable for disputes or audits',
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 items-start">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {item.step}
                    </span>
                    <div>
                      <h3 className="font-semibold">{item.label}</h3>
                      <p className="text-muted-foreground text-sm">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 6: FAQ */}
            <section className="mb-10">
              <h2 className="text-2xl font-semibold mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6 not-prose">
                {faqData.map((faq) => (
                  <div key={faq.question} className="border-b pb-4">
                    <h3 className="font-semibold mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground text-sm">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA Section */}
            <section className="bg-primary/5 border border-primary/10 rounded-lg p-8 text-center not-prose">
              <h2 className="text-2xl font-bold mb-3">
                See CapVeri's Deterministic Calculation Engine
              </h2>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                CAM reconciliation errors are rarely caught until a tenant hires
                an auditor. CapVeri's deterministic engine runs your
                reconciliation with the same rigor a tenant's auditor would
                apply. You get a full calculation ledger before the statements
                go out.
              </p>
              <Button asChild size="lg">
                <Link to="/auth/register">
                  Start Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </section>
          </article>
        </div>
      </div>

      <Footer />
    </div>
  )
}
