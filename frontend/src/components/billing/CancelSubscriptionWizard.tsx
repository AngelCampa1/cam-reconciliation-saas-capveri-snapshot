/**
 * Cancel Subscription Wizard
 *
 * Steps:
 *   guarantee (step 0, shown only when eligible): 30-day money-back offer
 *   survey: exit survey
 *   offer: save offer based on cancel reason
 *   confirm: final cancellation
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import {
  apiClient,
  cancelSubscriptionApiV1BillingSubscriptionCancelPost,
} from '@/api/client'
import { resolveApiUrl } from '@/api/url'
import { getAmountBucket, trackEvent } from '@/lib/analytics'
import { formatMoney } from '@/lib/money'
import { useSubscription } from '@/hooks/use-subscription'

type WizardStep = 'guarantee' | 'survey' | 'offer' | 'confirm'

type CancelReason =
  | 'too_expensive'
  | 'not_using_enough'
  | 'missing_feature'
  | 'switching_competitor'
  | 'business_closed'
  | 'other'

type SaveOfferType = 'discount_20pct_1inv' | 'feature_roadmap' | 'none'

interface SaveOfferResponse {
  attempt_id: string
  offer_type: SaveOfferType
  discount_percent: number | null
}

interface GuaranteeEligibilityResponse {
  eligible: boolean
  days_remaining: number
  first_invoice_amount: number | null
  first_invoice_currency: string
}

interface GuaranteeClaimResponse {
  refund_id: string
  amount_refunded: number
  currency: string
}

export interface CancelSubscriptionWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const CANCEL_REASONS: { value: CancelReason; label: string }[] = [
  { value: 'too_expensive', label: "It costs more than I'm getting out of it" },
  {
    value: 'not_using_enough',
    label: "I'm not logging in enough to justify it",
  },
  { value: 'missing_feature', label: "Something I need isn't there yet" },
  { value: 'switching_competitor', label: "I'm switching to a different tool" },
  { value: 'business_closed', label: "We're shutting down or downsizing" },
  { value: 'other', label: 'Something else' },
]

const UPCOMING_FEATURES = [
  'Automated lease abstraction from scanned PDFs',
  'Expanded import formats for Yardi and MRI exports',
  'Multi-property batch reconciliation',
  'Tenant-facing audit reports with e-signature',
]

export function CancelSubscriptionWizard({
  open,
  onOpenChange,
  onSuccess,
}: CancelSubscriptionWizardProps) {
  const queryClient = useQueryClient()
  // null = auto-derived from eligibility; set when user explicitly navigates
  const [manualStep, setManualStep] = useState<WizardStep | null>(null)
  const [selectedReason, setSelectedReason] = useState<CancelReason | ''>('')
  const [otherText, setOtherText] = useState('')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [offerType, setOfferType] = useState<SaveOfferType | null>(null)
  const { data: subscription } = useSubscription()

  const billingEventProps = useMemo(
    () => ({
      ...(subscription?.organization_id
        ? { organization_id: subscription.organization_id }
        : {}),
      ...(subscription?.plan ? { plan: subscription.plan } : {}),
      ...(subscription?.status
        ? { subscription_status: subscription.status }
        : {}),
      ...(subscription?.billing_interval
        ? { billing_period: subscription.billing_interval }
        : {}),
      ...(subscription?.building_count !== undefined
        ? { building_count: subscription.building_count }
        : {}),
    }),
    [subscription]
  )

  const { data: guaranteeEligibility } = useQuery<GuaranteeEligibilityResponse>(
    {
      queryKey: ['guarantee-eligibility'],
      queryFn: async () => {
        const res = await fetch(
          resolveApiUrl('/api/v1/billing/guarantee/eligibility'),
          { credentials: 'include' }
        )
        if (!res.ok) throw new Error('Failed to check eligibility')
        return res.json() as Promise<GuaranteeEligibilityResponse>
      },
      enabled: open,
      staleTime: 0,
    }
  )

  // Derive the current step:
  //   - Once the user manually navigates, use that step
  //   - Before query resolves (or on error): default to 'survey'
  //   - After query resolves eligible=true: show 'guarantee'
  const step: WizardStep =
    manualStep ?? (guaranteeEligibility?.eligible ? 'guarantee' : 'survey')

  useEffect(() => {
    if (!open) return
    if (!subscription || !guaranteeEligibility) return
    trackEvent('cancel_flow_opened', {
      ...billingEventProps,
      is_guarantee_eligible: guaranteeEligibility.eligible,
      days_until_period_end: guaranteeEligibility.days_remaining,
    })
  }, [billingEventProps, guaranteeEligibility, open, subscription])

  const resetState = () => {
    setManualStep(null)
    setSelectedReason('')
    setOtherText('')
    setAttemptId(null)
    setOfferType(null)
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  const claimGuaranteeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        resolveApiUrl('/api/v1/billing/guarantee/claim'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )
      if (!res.ok) throw new Error('Failed to claim refund')
      return res.json() as Promise<GuaranteeClaimResponse>
    },
    onSuccess: (data) => {
      trackEvent('guarantee_claimed', {
        ...billingEventProps,
        amount_bucket: getAmountBucket(data.amount_refunded),
        currency: data.currency,
      })
      const formatted = formatMoney(data.amount_refunded, data.currency)
      toast.success(
        `Refund of ${formatted} is on its way. Your subscription has been canceled.`
      )
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      queryClient.invalidateQueries({ queryKey: ['guarantee-eligibility'] })
      handleClose()
      if (onSuccess) onSuccess()
    },
    onError: () => {
      toast.error('Something went wrong. Please try again or contact support.')
    },
  })

  const surveyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        resolveApiUrl('/api/v1/billing/save-offer'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: selectedReason,
            other_text: otherText || null,
          }),
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to submit survey')
      }

      return (await response.json()) as SaveOfferResponse
    },
    onSuccess: (data) => {
      setAttemptId(data.attempt_id)
      setOfferType(data.offer_type)
      trackEvent('cancel_reason_submitted', {
        ...billingEventProps,
        cancel_reason: selectedReason,
        has_other_text: Boolean(otherText.trim()),
      })
      if (data.offer_type === 'none') {
        setManualStep('confirm')
      } else {
        trackEvent('save_offer_shown', {
          ...billingEventProps,
          cancel_reason: selectedReason,
          offer_type: data.offer_type,
        })
        setManualStep('offer')
      }
    },
    onError: () => {
      toast.error('Something went wrong. Please try again.')
    },
  })

  const acceptOfferMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        resolveApiUrl(`/api/v1/billing/save-offer/${attemptId}/accept`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to apply offer')
      }

      return response.json()
    },
    onSuccess: () => {
      trackEvent('save_offer_accepted', {
        ...billingEventProps,
        cancel_reason: selectedReason,
        offer_type: offerType ?? undefined,
      })
      toast.success(
        "20% off your next annual renewal invoice is applied - you're all set."
      )
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      handleClose()
      if (onSuccess) onSuccess()
    },
    onError: () => {
      toast.error('Something went wrong. Please try again or contact support.')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (attemptId) {
        await fetch(
          resolveApiUrl(`/api/v1/billing/save-offer/${attemptId}/decline`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          }
        ).catch(() => {
          // Non-critical. Ignore errors.
        })
      }

      const result = await cancelSubscriptionApiV1BillingSubscriptionCancelPost(
        {
          client: apiClient,
          body: { immediate: false, attempt_id: attemptId ?? null },
        }
      )

      if (result.error) {
        const errorMessage =
          typeof result.error.detail === 'string'
            ? result.error.detail
            : 'Failed to cancel subscription'
        throw new Error(errorMessage)
      }

      return result.data
    },
    onSuccess: () => {
      trackEvent('subscription_cancel_scheduled', {
        ...billingEventProps,
        cancel_reason: selectedReason || undefined,
        offer_type: offerType ?? undefined,
      })
      toast.success('Your subscription has been canceled')
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      handleClose()
      if (onSuccess) onSuccess()
    },
    onError: () => {
      toast.error('Failed to cancel subscription')
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {step === 'guarantee' && (
          <GuaranteeStep
            daysRemaining={guaranteeEligibility?.days_remaining ?? 0}
            firstInvoiceAmount={
              guaranteeEligibility?.first_invoice_amount ?? null
            }
            firstInvoiceCurrency={
              guaranteeEligibility?.first_invoice_currency ?? 'usd'
            }
            onClaimRefund={() => claimGuaranteeMutation.mutate()}
            onSkip={() => setManualStep('survey')}
            isClaiming={claimGuaranteeMutation.isPending}
          />
        )}

        {step === 'survey' && (
          <SurveyStep
            selectedReason={selectedReason}
            onReasonChange={setSelectedReason}
            otherText={otherText}
            onOtherTextChange={setOtherText}
            onKeepSubscription={handleClose}
            onContinue={() => {
              if (selectedReason) surveyMutation.mutate()
            }}
            isLoading={surveyMutation.isPending}
          />
        )}

        {step === 'offer' && offerType === 'discount_20pct_1inv' && (
          <DiscountOfferStep
            onAccept={() => acceptOfferMutation.mutate()}
            onDecline={() => {
              trackEvent('save_offer_declined', {
                ...billingEventProps,
                cancel_reason: selectedReason,
                offer_type: offerType,
              })
              setManualStep('confirm')
            }}
            isAccepting={acceptOfferMutation.isPending}
          />
        )}

        {step === 'offer' && offerType === 'feature_roadmap' && (
          <FeatureRoadmapStep
            onStay={() => {
              trackEvent('save_offer_accepted', {
                ...billingEventProps,
                cancel_reason: selectedReason,
                offer_type: offerType,
              })
              handleClose()
            }}
            onDecline={() => {
              trackEvent('save_offer_declined', {
                ...billingEventProps,
                cancel_reason: selectedReason,
                offer_type: offerType,
              })
              setManualStep('confirm')
            }}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            onKeep={handleClose}
            onConfirmCancel={() => cancelMutation.mutate()}
            isCanceling={cancelMutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function GuaranteeStep({
  daysRemaining,
  firstInvoiceAmount,
  firstInvoiceCurrency,
  onClaimRefund,
  onSkip,
  isClaiming,
}: {
  daysRemaining: number
  firstInvoiceAmount: number | null
  firstInvoiceCurrency: string
  onClaimRefund: () => void
  onSkip: () => void
  isClaiming: boolean
}) {
  const amountDisplay =
    firstInvoiceAmount != null
      ? formatMoney(firstInvoiceAmount, firstInvoiceCurrency)
      : 'your first charge'

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success" />
          30-Day Money-Back Guarantee
        </DialogTitle>
        <DialogDescription>
          {`You're within your 30-day guarantee window. ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining.`}
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-md border bg-muted/50 p-4 text-sm space-y-2">
        <p className="text-muted-foreground">
          {`We'll refund your full first charge of ${amountDisplay} and cancel your subscription immediately. No questions asked.`}
        </p>
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
        <Button variant="ghost" onClick={onSkip} disabled={isClaiming}>
          Skip. I just want to cancel.
        </Button>
        <Button
          onClick={onClaimRefund}
          disabled={isClaiming}
          className="bg-success hover:bg-success/90 text-success-foreground"
        >
          {isClaiming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            'Claim my refund'
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

function SurveyStep({
  selectedReason,
  onReasonChange,
  otherText,
  onOtherTextChange,
  onKeepSubscription,
  onContinue,
  isLoading,
}: {
  selectedReason: CancelReason | ''
  onReasonChange: (reason: CancelReason) => void
  otherText: string
  onOtherTextChange: (text: string) => void
  onKeepSubscription: () => void
  onContinue: () => void
  isLoading: boolean
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Before you go, help us understand why.</DialogTitle>
        <DialogDescription>
          Your feedback helps us improve. This takes about 10 seconds.
        </DialogDescription>
      </DialogHeader>

      <div className="py-2">
        <RadioGroup
          value={selectedReason}
          onValueChange={(v) => onReasonChange(v as CancelReason)}
          className="space-y-3"
        >
          {CANCEL_REASONS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem value={value} id={`reason-${value}`} />
              <Label
                htmlFor={`reason-${value}`}
                className="cursor-pointer font-normal"
              >
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {selectedReason === 'other' && (
          <Textarea
            className="mt-3"
            placeholder="Tell us more (optional)"
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            rows={3}
          />
        )}
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
        <Button variant="ghost" onClick={onKeepSubscription}>
          Keep my subscription
        </Button>
        <Button onClick={onContinue} disabled={!selectedReason || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

function DiscountOfferStep({
  onAccept,
  onDecline,
  isAccepting,
}: {
  onAccept: () => void
  onDecline: () => void
  isAccepting: boolean
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          How about 20% off your next annual renewal invoice?
        </DialogTitle>
        <DialogDescription>
          Keep everything you have, and save 20% on your next annual renewal
          invoice. After that, your normal rate resumes.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-md border bg-muted/50 p-4 text-sm space-y-1">
        <p className="font-medium">What you get:</p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Full access to all features</li>
          <li>20% off your next annual renewal invoice</li>
          <li>Cancel anytime after the renewal</li>
        </ul>
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
        <Button variant="ghost" onClick={onDecline}>
          No thanks, keep canceling
        </Button>
        <Button onClick={onAccept} disabled={isAccepting}>
          {isAccepting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            'Apply discount'
          )}
        </Button>
      </DialogFooter>
    </>
  )
}
function FeatureRoadmapStep({
  onStay,
  onDecline,
}: {
  onStay: () => void
  onDecline: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>That feature is on the way.</DialogTitle>
        <DialogDescription>{"Here's what's coming next."}</DialogDescription>
      </DialogHeader>

      <div className="rounded-md border bg-muted/50 p-4 text-sm space-y-2">
        <ul className="space-y-2 text-muted-foreground">
          {UPCOMING_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">→</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
        <Button variant="ghost" onClick={onDecline}>
          No thanks, keep canceling
        </Button>
        <Button onClick={onStay}>Stay and see what ships</Button>
      </DialogFooter>
    </>
  )
}

function ConfirmStep({
  onKeep,
  onConfirmCancel,
  isCanceling,
}: {
  onKeep: () => void
  onConfirmCancel: () => void
  isCanceling: boolean
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Cancel your subscription?
        </DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-2">
            <p>
              Your access continues through the end of your billing period. You
              can reactivate anytime before then.
            </p>
            <p className="text-sm text-muted-foreground">
              This only schedules the cancellation. Nothing stops working today.
            </p>
          </div>
        </DialogDescription>
      </DialogHeader>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
        <Button variant="outline" onClick={onKeep}>
          Keep my subscription
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirmCancel}
          disabled={isCanceling}
        >
          {isCanceling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Canceling...
            </>
          ) : (
            'Yes, cancel my subscription'
          )}
        </Button>
      </DialogFooter>
    </>
  )
}
