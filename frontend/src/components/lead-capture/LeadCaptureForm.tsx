/**
 * LeadCaptureForm - Reusable 3-field email gate for content downloads.
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle } from 'lucide-react'
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

const leadSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),
  work_email: z.string().email('Please enter a valid work email'),
  company: z.string().optional(),
})

type LeadFormData = z.infer<typeof leadSchema>

export interface LeadCaptureFormProps {
  assetSlug: string
  ctaLabel?: string
  onSuccess: () => void
  source?: string
}

export function LeadCaptureForm({
  assetSlug,
  ctaLabel = 'Download Free Calculator',
  onSuccess,
  source,
}: LeadCaptureFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
  })

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    if (isTurnstileConfigured() && !turnstileToken) {
      setSubmitError('Please complete the verification challenge.')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch(
        resolveApiUrl('/api/v1/leads/content-download'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: data.first_name,
            email: data.work_email,
            company: data.company || undefined,
            asset_slug: assetSlug,
            source: source,
            company_website: companyWebsite || undefined,
            turnstile_token: turnstileToken,
          }),
        }
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        if (response.status === 429) {
          setSubmitError(
            body.detail || 'You already requested this. Check your inbox.'
          )
        } else {
          setSubmitError(
            body.detail || 'Something went wrong. Please try again.'
          )
        }
        return
      }

      trackEvent('lead_form_submit', {
        slug: assetSlug,
        ...(source !== undefined ? { source } : {}),
        ...(() => {
          const emailDomain = getEmailDomain(data.work_email)
          return emailDomain ? { email_domain: emailDomain } : {}
        })(),
      })
      void identifyLeadForAnalytics(data.work_email, {
        lead_type: 'content_download',
        asset_slug: assetSlug,
        ...(source !== undefined ? { source } : {}),
      })
      onSuccess()
    } catch {
      setSubmitError(
        'Network error. Please check your connection and try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

      <div className="space-y-1.5">
        <Label htmlFor="first_name">First name</Label>
        <Input
          id="first_name"
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
        <Label htmlFor="work_email">Work email</Label>
        <Input
          id="work_email"
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

      <div className="space-y-1.5">
        <Label htmlFor="company">
          Company{' '}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="company"
          type="text"
          placeholder="Acme Property Management"
          autoComplete="organization"
          {...register('company')}
        />
      </div>

      {submitError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
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
        {ctaLabel}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        No spam. Unsubscribe anytime.
      </p>
    </form>
  )
}
