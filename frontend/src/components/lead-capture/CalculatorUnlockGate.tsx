/**
 * CalculatorUnlockGate - Inline email gate for calculator dollar details.
 *
 * Unlike LeadCaptureForm (which navigates away), this component stays inline.
 * On success, it stores unlock state in localStorage so returning visitors
 * skip the gate automatically.
 */
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getEmailDomain,
  identifyLeadForAnalytics,
  trackEvent,
} from '@/lib/analytics'
import { resolveApiUrl } from '@/api/url'
import {
  TurnstileWidget,
  isTurnstileConfigured,
} from '@/components/TurnstileWidget'
import { HoneypotField } from '@/components/HoneypotField'

const STORAGE_KEY = 'boma_calculator_unlocked'

const unlockSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),
  work_email: z.string().email('Please enter a valid work email'),
})

type UnlockFormData = z.infer<typeof unlockSchema>

export interface CalculatorUnlockGateProps {
  slug: string
  onUnlock: () => void
  source?: string
  storageKey?: string
  teaserText?: string
  buttonLabel?: string
  submitLabel?: string
}

export function CalculatorUnlockGate({
  slug,
  onUnlock,
  source,
  storageKey = STORAGE_KEY,
  teaserText = 'Enter your email to see the dollar details.',
  buttonLabel = 'Send email for dollar details',
  submitLabel = 'Send email for dollar details',
}: CalculatorUnlockGateProps) {
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')

  // Auto-unlock returning visitors who already submitted
  useEffect(() => {
    if (localStorage.getItem(storageKey) === 'true') {
      onUnlock()
    }
  }, [onUnlock, storageKey])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockFormData>({
    resolver: zodResolver(unlockSchema),
  })

  const onSubmit = async (data: UnlockFormData) => {
    setIsSubmitting(true)
    setError(null)

    if (isTurnstileConfigured() && !turnstileToken) {
      setError('Please complete the verification challenge.')
      setIsSubmitting(false)
      return
    }

    try {
      const res = await fetch(
        resolveApiUrl('/api/v1/leads/calculator-unlock'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: data.first_name,
            email: data.work_email,
            slug,
            source,
            company_website: companyWebsite || undefined,
            turnstile_token: turnstileToken,
          }),
        }
      )

      if (res.status === 429) {
        // Already submitted: they're a returning lead, unlock anyway.
        localStorage.setItem(storageKey, 'true')
        onUnlock()
        trackEvent('lead_form_submit', {
          slug,
          ...(source !== undefined && { source }),
          ...(() => {
            const emailDomain = getEmailDomain(data.work_email)
            return emailDomain ? { email_domain: emailDomain } : {}
          })(),
        })
        void identifyLeadForAnalytics(data.work_email, {
          lead_type: 'calculator_unlock',
          asset_slug: slug,
          ...(source !== undefined && { source }),
        })
        return
      }

      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        return
      }

      trackEvent('lead_form_submit', {
        slug,
        ...(source !== undefined && { source }),
        ...(() => {
          const emailDomain = getEmailDomain(data.work_email)
          return emailDomain ? { email_domain: emailDomain } : {}
        })(),
      })
      void identifyLeadForAnalytics(data.work_email, {
        lead_type: 'calculator_unlock',
        asset_slug: slug,
        ...(source !== undefined && { source }),
      })
      localStorage.setItem(storageKey, 'true')
      onUnlock()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!showForm) {
    return (
      <div className="text-center space-y-3 py-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <p className="text-sm">{teaserText}</p>
        </div>
        <Button
          onClick={() => {
            setShowForm(true)
            trackEvent('tool_lead_gate_opened', {
              slug,
              ...(source !== undefined && { source }),
            })
            trackEvent('lead_form_view', {
              slug,
              ...(source !== undefined && { source }),
            })
          }}
        >
          {buttonLabel}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

      <div className="space-y-1.5">
        <Label htmlFor="unlock_first_name">First name</Label>
        <Input
          id="unlock_first_name"
          type="text"
          placeholder="Jane"
          autoComplete="given-name"
          {...register('first_name')}
          aria-invalid={!!errors.first_name}
        />
        {errors.first_name && (
          <p className="text-sm text-destructive-strong">
            {errors.first_name.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unlock_work_email">Work email</Label>
        <Input
          id="unlock_work_email"
          type="email"
          placeholder="jane@yourcompany.com"
          autoComplete="email"
          {...register('work_email')}
          aria-invalid={!!errors.work_email}
        />
        {errors.work_email && (
          <p className="text-sm text-destructive-strong">
            {errors.work_email.message}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <TurnstileWidget
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken('')}
        className="mb-2"
      />

      <Button
        type="submit"
        className="w-full min-h-[44px]"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        No spam. Unsubscribe anytime.
      </p>
    </form>
  )
}
