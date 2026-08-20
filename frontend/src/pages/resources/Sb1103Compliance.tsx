/* eslint-disable react-refresh/only-export-components */
import { Link } from 'react-router-dom'
import { ContentPageLayout } from '@/components/content/ContentPageLayout'
import { buildSiteUrl } from '@/lib/domains'

export interface FaqItem {
  question: string
  answer: string
}

export const faqData: FaqItem[] = [
  {
    question: 'Does SB 1103 apply to all California commercial leases?',
    answer:
      'No. SB 1103 protections apply only to Qualified Commercial Tenants. These are microenterprises with 5 or fewer employees (including the owner) under B&P §18000(a), restaurants with fewer than 10 employees, and §501(c)(3) nonprofits with fewer than 20 employees. Standard commercial tenants (corporations, partnerships, and larger businesses) are not covered.',
  },
  {
    question: 'What happens if we miss the 30-day production deadline?',
    answer:
      "Civil Code §1950.9 creates a private right of action for QCT tenants who do not receive compliant documentation within 30 days of a written request. Courts may award actual damages, statutory damages, and attorney's fees. The treble damages provision applies if the court finds the landlord's non-compliance was willful. Missing the deadline once can generate liability exceeding the total CAM charges in dispute.",
  },
  {
    question:
      'Can a tenant self-certify QCT status or do we need to verify it?',
    answer:
      'The law allows self-attestation: the tenant provides a signed written statement confirming they meet the headcount threshold. You are not required to independently verify the attestation. However, once you receive a signed attestation and act on it as though the tenant qualifies, you cannot later deny QCT protections to that tenant without evidence of fraud in the attestation.',
  },
  {
    question:
      'Are property management companies considered the "landlord" for purposes of Civil Code §1950.9?',
    answer:
      "Yes. A property management company acting as the landlord's authorized representative bears the same obligations as the property owner. The 30-day clock runs against whoever controls the documentation and bills the CAM charges. Property managers who do not have primary-source invoice retention procedures in place are personally exposed, and their clients are as well.",
  },
  {
    question:
      'Do the SB 1103 provisions apply to leases signed before January 1, 2025?',
    answer:
      'Yes. The documentation production obligations, notice requirements, and rent increase notice requirements apply to existing QCT tenancies, not just new leases. The only provision that applies only prospectively is the pre-execution notice requirement. You cannot retroactively provide a notice that was due before signing. But all other obligations apply to current QCT tenants regardless of when the lease was signed.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}

const howToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Achieve SB 1103 CAM Compliance',
  description:
    'Five steps California landlords should complete before a QCT tenant submits a written documentation request under Civil Code §1950.9.',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Audit every current lease for QCT status',
      position: 1,
      text: 'Pull your full tenant roster and send written self-attestation forms to every commercial tenant with 20 or fewer employees. Annotate each lease file with the attestation receipt date.',
    },
    {
      '@type': 'HowToStep',
      name: 'Add pre-execution notice to all new leases',
      position: 2,
      text: 'Draft a QCT Rights Notice modeled on Civil Code §1950.9 language and require tenants to sign it as a lease exhibit before execution.',
    },
    {
      '@type': 'HowToStep',
      name: 'Digitize and attach invoices real-time to tenant ledger',
      position: 3,
      text: 'Receive every vendor invoice in original PDF form, tag it to the property and expense period, and retain it in a system that allows retrieval by tenant and date range.',
    },
    {
      '@type': 'HowToStep',
      name: 'Build the 30-day production kit',
      position: 4,
      text: 'Prepare a template production package for each QCT-occupied property: invoices organized by month and GL category, an allocation matrix template, and a signed attestation template.',
    },
    {
      '@type': 'HowToStep',
      name: 'Set calendar alerts for statutory notice deadlines',
      position: 5,
      text: 'Calendar 90-day alerts for rent increases exceeding 10%, 60-day alerts before lease expiration, and a 30-day production target for any CAM documentation request received.',
    },
  ],
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: buildSiteUrl('/'),
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Resources',
      item: buildSiteUrl('/resources'),
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'SB 1103 Compliance',
      item: buildSiteUrl('/resources/sb-1103-compliance'),
    },
  ],
}

export function Sb1103CompliancePage() {
  return (
    <ContentPageLayout
      title="SB 1103 CAM Compliance Guide | CapVeri"
      description="SB 1103 landlord CAM reconciliation compliance guide: what California landlords must produce in 30 days and 5 gaps that create treble-damage liability."
      canonical="/resources/sb-1103-compliance"
      pageName="SB 1103 Compliance"
      structuredData={[faqSchema, howToSchema, breadcrumbSchema]}
    >
      <article className="prose prose-gray max-w-none">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          SB 1103 CAM Compliance: What California Landlords Must Have Ready
          Before a Tenant Asks
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Updated: February 2026 &middot; For controllers and property managers
          at California commercial PMCs
        </p>

        {/* Intro summary */}
        <div className="mt-6 rounded-lg bg-primary/5 p-4 text-sm leading-relaxed text-primary/90">
          <strong>What this is:</strong> California Senate Bill 1103, the
          Commercial Tenant Protection Act, took effect January 1, 2025. For
          landlords with qualifying small-business tenants, it changed the
          default rules on CAM documentation, lease notice, rent increase
          timing, and language access. The 30-day production clock starts the
          moment a qualifying tenant sends a written request. This guide covers
          what Civil Code §1950.9 requires and how to build a defensible
          documentation package before anyone asks.
        </div>

        {/* Section 1 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          1. What SB 1103 Actually Requires
        </h2>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          The Qualified Commercial Tenant Definition
        </h3>
        <p>
          SB 1103 protections apply only to Qualified Commercial Tenants (QCTs).
          A tenant qualifies under one of three categories:
        </p>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Microenterprise:</strong> A commercial tenant that qualifies
            as a microenterprise under Business &amp; Professions Code
            §18000(a). This means it has{' '}
            <strong>five or fewer employees</strong>, including the owner
          </li>
          <li>
            <strong>Restaurant:</strong> A food service business with{' '}
            <strong>fewer than ten employees</strong>
          </li>
          <li>
            <strong>Nonprofit:</strong> An organization holding §501(c)(3)
            status with <strong>fewer than twenty employees</strong>
          </li>
        </ul>
        <p className="mt-4">
          <strong>Self-attestation requirement:</strong> Under Civil Code
          §1950.9(a), a tenant establishes QCT status by providing a written
          self-attestation. Once a landlord receives that attestation, all SB
          1103 protections activate for that tenancy. Landlords cannot challenge
          the attestation absent evidence of fraud.
        </p>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          Statutory Provisions in Play
        </h3>
        <p>SB 1103 amended or added four Civil Code provisions:</p>
        <ul className="mt-3 space-y-3">
          <li>
            <strong>Civil Code §1950.9:</strong> The primary new provision.
            Establishes CAM documentation production obligations and the 30-day
            deadline. Requires itemized primary-source invoices, explicit
            allocation methodology, and a signed landlord attestation.
          </li>
          <li>
            <strong>Civil Code §827:</strong> Restricts rent increases for QCT
            tenants to one increase per 12-month period. Requires 90 days&apos;
            advance written notice for any increase exceeding 10% of the lowest
            rent charged in the prior 12 months.
          </li>
          <li>
            <strong>Civil Code §1632:</strong> Language access requirement. If a
            commercial lease was negotiated primarily in Spanish, Chinese,
            Tagalog, Vietnamese, or Korean, the landlord must provide a written
            translation before execution.
          </li>
          <li>
            <strong>Civil Code §1946.1:</strong> Restricts automatic renewal.
            For QCT tenants with leases of 12 months or more, termination
            requires 60 days&apos; written notice. Continued rent acceptance
            after lease expiration triggers month-to-month continuation under
            QCT protections.
          </li>
        </ul>

        {/* Section 2 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          2. The 30-Day Clock
        </h2>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          What Triggers It
        </h3>
        <p>
          Under Civil Code §1950.9, the 30-day production clock starts when a
          QCT submits <strong>any written request</strong> for CAM
          documentation. An email asking for "the invoices behind our CAM
          charges" qualifies. A text message asking for "the reconciliation
          backup" qualifies. The trigger is a written request, not a formal
          legal demand.
        </p>
        <p className="mt-2">
          Once the clock starts, it cannot be stopped by offering a partial
          production or claiming the documents are being assembled.
        </p>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          What Must Be Produced Within 30 Days
        </h3>
        <p>
          Civil Code §1950.9 specifies three mandatory components. All three
          must be present:
        </p>
        <ol className="mt-3 list-decimal space-y-3 pl-6">
          <li>
            <strong>
              Itemized primary-source invoices from licensed contractors:
            </strong>{' '}
            Summary ledgers and management system printouts do not satisfy this
            requirement. The law requires the actual invoices: line-itemized,
            from the vendor or contractor, showing the property address, work
            description, and amount charged.
          </li>
          <li>
            <strong>
              Explicit allocation tabulation showing numerator and denominator:
            </strong>{' '}
            The documentation must show the pro-rata calculation: the
            tenant&apos;s rentable square footage as numerator, the total
            rentable square footage (or contractual denominator) as denominator,
            for each expense line.
          </li>
          <li>
            <strong>Signed landlord attestation:</strong> A written attestation,
            signed by the landlord or an authorized representative, confirming
            that the documented expenses are accurate and the allocation
            methodology conforms to the lease. Unsigned boilerplate does not
            satisfy this requirement.
          </li>
        </ol>

        <h3 className="mt-6 text-xl font-medium text-foreground">
          Temporal Scope
        </h3>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>18 months retrospectively:</strong> A QCT tenant can request
            documentation for CAM charges assessed up to 18 months before the
            written request date.
          </li>
          <li>
            <strong>12 months prospectively:</strong> If a QCT tenant requests
            projected CAM estimates, the landlord must provide the projected
            allocation for the 12-month period following the request.
          </li>
        </ul>

        {/* Section 3 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          3. The 5 Documentation Gaps That Create Liability
        </h2>

        <div className="mt-4 space-y-6">
          <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive-strong">
              Gap 1: No Pre-Execution Notice of Right to Inspect
            </p>
            <p className="mt-2 text-sm text-destructive-strong/80">
              Civil Code §1950.9 requires landlords to provide written notice of
              QCT documentation rights <em>before lease execution</em>. Without
              it, tenants may argue the landlord cannot enforce CAM charges
              because the tenant was not informed of the right to verify them at
              the time of signing. New leases executed after January 1, 2025,
              without this notice are exposed.
            </p>
          </div>

          <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive-strong">
              Gap 2: Summary Ledger Instead of Itemized Primary-Source Invoices
            </p>
            <p className="mt-2 text-sm text-destructive-strong/80">
              Yardi and MRI-generated CAM ledger printouts are accounting
              entries, not invoices. A tenant or their attorney who receives a
              ledger printout instead of contractor invoices can reject the
              production as non-compliant and restart the 30-day clock.
            </p>
          </div>

          <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive-strong">
              Gap 3: Missing Landlord Attestation
            </p>
            <p className="mt-2 text-sm text-destructive-strong/80">
              Most legacy reconciliation packages do not include a signed
              attestation. Producing a complete invoice set without it leaves
              the package legally incomplete. The attestation must be signed by
              the landlord or an authorized management company representative,
              not a cover letter from accounts receivable.
            </p>
          </div>

          <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive-strong">
              Gap 4: Automated Rent Acceptance Post-Lease-Expiry
            </p>
            <p className="mt-2 text-sm text-destructive-strong/80">
              Under Civil Code §1946.1, accepting rent from a QCT tenant after
              lease expiration (via ACH, auto-pay, or system auto-charge)
              triggers automatic month-to-month continuation under QCT
              protections. Landlords with QCT tenants whose leases expire within
              90 days should audit their payment processing settings
              immediately.
            </p>
          </div>

          <div className="rounded border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive-strong">
              Gap 5: No Translation for Leases Negotiated in a Covered Language
            </p>
            <p className="mt-2 text-sm text-destructive-strong/80">
              Under Civil Code §1632(k), if a lease was negotiated primarily in
              Spanish, Chinese, Tagalog, Vietnamese, or Korean, the tenant may{' '}
              <strong>rescind the contract</strong> if no translation was
              provided before signing. There is no time limit tied to this
              right. A five-year-old lease negotiated in Spanish without a
              Spanish translation is potentially voidable today.
            </p>
          </div>
        </div>

        {/* Section 4 */}
        <h2 className="mt-10 text-2xl font-semibold text-foreground">
          4. How to Achieve Compliance Before a Tenant Asks
        </h2>
        <p>
          The five steps below create a defensible compliance position before
          any request arrives.
        </p>
        <ol className="mt-4 list-decimal space-y-4 pl-6">
          <li>
            <strong>Audit every current lease for QCT status.</strong> Pull your
            full tenant roster and send written self-attestation forms to every
            commercial tenant with 20 or fewer employees. Annotate each lease
            file with the attestation receipt date. This establishes when
            protections became active.
          </li>
          <li>
            <strong>Add pre-execution notice to all new leases.</strong> Draft a
            one-page QCT Rights Notice modeled on Civil Code §1950.9 language.
            Require tenants to sign it as a lease exhibit before execution. This
            eliminates Gap 1 for all new leases.
          </li>
          <li>
            <strong>
              Digitize and attach invoices real-time to tenant ledger.
            </strong>{' '}
            Every vendor invoice for a QCT-occupied property must be received in
            original PDF form, tagged to the property and expense period, and
            stored for retrieval by tenant and date range. Year-end batch
            collection will not produce a compliant 30-day response.
          </li>
          <li>
            <strong>Build the 30-day production kit.</strong> Prepare a template
            production package for each QCT-occupied property: invoices
            organized by month and GL category, a pre-formatted allocation
            matrix template, and a signed attestation template awaiting only the
            current date. When a request arrives, production should take hours,
            not weeks.
          </li>
          <li>
            <strong>Set calendar alerts for statutory notice deadlines.</strong>{' '}
            90-day alerts before any planned rent increase exceeding 10% (Civil
            Code §827); 60-day alerts before lease expiration (Civil Code
            §1946.1); 30-day production target for any CAM documentation
            request.
          </li>
        </ol>

        {/* FAQ Section */}
        <h2 className="mt-12 text-2xl font-semibold text-foreground">
          Frequently Asked Questions
        </h2>
        <dl className="mt-6 space-y-8">
          {faqData.map((faq) => (
            <div key={faq.question}>
              <dt className="text-base font-semibold text-foreground">
                {faq.question}
              </dt>
              <dd className="mt-2 text-base text-muted-foreground">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>

        {/* CTA */}
        <div className="mt-12 rounded-xl bg-primary p-8 text-center text-primary-foreground">
          <p className="text-lg font-semibold">
            Build a compliant CAM statement faster
          </p>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Primary-source invoice organization, allocation matrix generation,
            and an attestation template. All from a file you export from Yardi
            or MRI.
          </p>
          <Link
            to="/auth/register"
            className="mt-4 inline-flex items-center rounded-button bg-background px-6 py-3 text-sm font-semibold text-primary shadow hover:bg-primary/5 transition-colors duration-200"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Related links */}
        <div className="mt-8 flex flex-wrap gap-4 border-t pt-6 text-sm">
          <span className="text-muted-foreground">Related:</span>
          <Link
            to="/resources/what-is-cam-reconciliation"
            className="text-primary hover:underline"
          >
            What Is CAM Reconciliation?
          </Link>
        </div>
      </article>
    </ContentPageLayout>
  )
}
