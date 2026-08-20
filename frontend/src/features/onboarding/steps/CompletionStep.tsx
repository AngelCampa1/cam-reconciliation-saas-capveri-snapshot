/**
 * Completion Step Component
 *
 * Final step of onboarding - success message and next steps.
 */
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  CheckCircle2,
  Building2,
  Upload,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FreeAuditUpgradeModal } from '@/components/billing/FreeAuditUpgradeModal'
import { useFreeAuditStatus } from '@/hooks/use-free-audit-status'
import { useOnboarding } from '../OnboardingContext'
import { formatMoney } from '@/lib/money'

const nextSteps = [
  {
    icon: ClipboardCheck,
    title: 'Review your reconciliation',
    description: 'See the draft reconciliation CapVeri built from your files',
    href: 'RECONCILIATION_REVIEW',
  },
  {
    icon: Building2,
    title: 'Add more properties',
    description: 'Manage your entire portfolio in one place',
    href: '/properties/new',
  },
  {
    icon: Upload,
    title: 'Upload lease documents',
    description: 'Import a lease PDF so CapVeri can read the key terms.',
    href: '/ingestion',
  },
]

export function CompletionStep() {
  const navigate = useNavigate()
  const { completeOnboarding, state } = useOnboarding()
  const { data: freeAuditStatus } = useFreeAuditStatus()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const handleGoToDashboard = () => {
    completeOnboarding()
    navigate('/dashboard')
  }

  const glDataYear = state.data.glDataYear ?? new Date().getFullYear() - 1
  const propertyId = state.data.propertyId

  const handleNavigate = (href: string) => {
    if (
      href === '/properties/new' &&
      freeAuditStatus &&
      !freeAuditStatus.can_add_property
    ) {
      setUpgradeModalOpen(true)
      return
    }
    completeOnboarding()
    if (href === 'RECONCILIATION_REVIEW' && propertyId) {
      navigate(`/properties/${propertyId}/reconciliations?year=${glDataYear}`)
    } else if (href === 'RECONCILIATION_REVIEW') {
      navigate('/dashboard')
    } else {
      navigate(href)
    }
  }

  const handleReviewReconciliation = () => {
    completeOnboarding()
    if (propertyId) {
      navigate(`/properties/${propertyId}/reconciliations?year=${glDataYear}`)
    } else {
      navigate('/dashboard')
    }
  }

  const recoveryAmount = state.data.leakage ?? 0
  const hasRecovery = recoveryAmount > 0

  // Build summary of what was created
  const summary = []
  if (state.data.propertyId) {
    summary.push(`Created property: ${state.data.propertyName}`)
  }
  if (state.data.hasLeases) {
    summary.push('Added lease data')
  }
  if (state.data.importBatchId) {
    summary.push('Uploaded GL data')
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      {/* Success icon */}
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>

      {/* Success message */}
      <h1 className="mb-3 text-xl md:text-2xl lg:text-3xl font-bold">
        You&apos;re all set!
      </h1>
      <p className="mb-6 text-lg text-muted-foreground">
        Setup is done. Your data is ready in CapVeri.
      </p>

      {/* Summary of what was done */}
      {summary.length > 0 && (
        <div className="mb-8 rounded-lg border bg-muted/50 p-4 text-left">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            What you've accomplished:
          </h2>
          <ul className="space-y-1">
            {summary.map((item, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <CheckCircle2
                  className="h-4 w-4 text-success"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">
          What's next?
        </h2>
        <div className="space-y-3 text-left">
          {nextSteps.map((step, index) => (
            <button
              key={index}
              onClick={() => handleNavigate(step.href)}
              className="flex w-full items-center gap-4 rounded-lg border p-4 text-left shadow-sm transition-all duration-fast hover:bg-muted/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <step.icon
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1">
                <span className="font-medium">{step.title}</span>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
              <ArrowRight
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Upgrade CTA */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-left">
        <p className="mb-3 text-sm font-medium">
          {hasRecovery ? (
            <>
              This check caught{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(recoveryAmount)}
              </span>{' '}
              to fix before you send. Upgrade to unlock full reports.
            </>
          ) : (
            `Add your other buildings to reconcile your whole portfolio.`
          )}
        </p>
        <Button asChild size="sm" className="w-full">
          <Link to="/pricing">View Plans</Link>
        </Button>
      </div>

      {/* Primary CTA */}
      {propertyId && (
        <Button
          onClick={handleReviewReconciliation}
          size="lg"
          className="w-full mb-3"
        >
          Review Your Reconciliation
        </Button>
      )}
      <Button
        onClick={handleGoToDashboard}
        size="lg"
        variant="outline"
        className="w-full"
      >
        Go to Dashboard
      </Button>

      <FreeAuditUpgradeModal
        open={upgradeModalOpen}
        potentialRecovery={hasRecovery ? recoveryAmount : null}
        onClose={() => setUpgradeModalOpen(false)}
        onSubscribe={() => {
          completeOnboarding()
          setUpgradeModalOpen(false)
          navigate('/settings/billing')
        }}
      />
    </div>
  )
}
