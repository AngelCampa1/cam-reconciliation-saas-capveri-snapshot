/**
 * Email Capture Step, PLG onboarding Step 6.
 *
 * Captures first name and work email after the user has seen their reconciliation result.
 * POSTs to /api/v1/leads/plg-signup (Apollo sync, no auth required).
 */
import { useState, useEffect } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnboarding } from '../OnboardFlowContext'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'
import {
  TurnstileWidget,
  isTurnstileConfigured,
} from '@/components/TurnstileWidget'
import { HoneypotField } from '@/components/HoneypotField'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailCaptureStep() {
  const { nextStep, setStepData, state } = useOnboarding()

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 6,
      step_label: 'Your Email',
    })
  }, [])

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [orgName, setOrgName] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')

  const validate = (): boolean => {
    if (!email.trim()) {
      setEmailError('Email is required')
      return false
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    if (isTurnstileConfigured() && !turnstileToken) {
      setEmailError('Please complete the verification challenge.')
      return
    }

    setIsSubmitting(true)
    try {
      const resp = await fetch(resolveApiUrl('/api/v1/leads/plg-signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          first_name: firstName.trim() || 'Friend',
          organization_name: orgName.trim() || undefined,
          leakage_amount: state.data.leakage ?? undefined,
          property_name: state.data.propertyName ?? undefined,
          company_website: companyWebsite || undefined,
          turnstile_token: turnstileToken,
        }),
      })

      if (!resp.ok) {
        setEmailError('Something went wrong. Please try again.')
        return
      }

      setStepData('email', email.trim())
      setStepData('firstName', firstName.trim())
      if (orgName.trim()) setStepData('organizationName', orgName.trim())
      setStepData('emailCaptured', true)

      trackEvent('onboard_step_completed', {
        step: 6,
        step_label: 'Your Email',
      })
      nextStep()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-bold">Save your reconciliation</h2>
        <p className="text-muted-foreground">
          Enter your work email to save this reconciliation. You can come back
          without uploading files again.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            placeholder="Alex"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="alex@company.com"
            value={email}
            required
            aria-required="true"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? 'email-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(null)
            }}
          />
          {emailError && (
            <p
              id="email-error"
              role="alert"
              className="text-sm text-destructive-strong"
            >
              {emailError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="orgName">Organization name (optional)</Label>
          <Input
            id="orgName"
            placeholder="Acme Properties"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </div>

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
          {isSubmitting ? 'Saving...' : 'Save my reconciliation'}
        </Button>
      </form>
    </div>
  )
}
