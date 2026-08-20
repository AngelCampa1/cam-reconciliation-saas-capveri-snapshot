/**
 * Forgot Password Page Component
 *
 * Premium password reset experience with split-screen layout.
 * Features:
 * - Split layout with form and feature showcase
 * - Simple email form
 * - Loading state during submission
 * - Success screen with instructions
 * - Security: Always shows success (prevents email enumeration)
 * - Links to login and retry
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trackEvent } from '@/lib/analytics'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard, AuthCardHeader, AuthLogo } from '@/components/auth/AuthCard'
import { FeatureShowcase } from '@/components/auth/FeatureShowcase'
import { SEO } from '@/components/SEO'

// Form validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

interface ForgotPasswordPageProps {
  loginPath?: string
}

export function ForgotPasswordPage({
  loginPath = '/auth/login',
}: ForgotPasswordPageProps) {
  const { resetPassword, isLoading } = useAuth()
  const [resetSuccess, setResetSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  // React Hook Form with Zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  // Handle form submission
  const onSubmit = async (data: ForgotPasswordFormData) => {
    await resetPassword(data.email)

    // Always show success for security (prevent email enumeration)
    trackEvent('password_reset_requested')
    setSubmittedEmail(data.email)
    setResetSuccess(true)
  }

  // Handle retry
  const handleRetry = () => {
    setResetSuccess(false)
    setSubmittedEmail('')
    reset()
  }

  // Success screen after password reset request
  if (resetSuccess) {
    return (
      <>
        <SEO
          title="Reset Password"
          description="Reset your CapVeri account password."
        />
        <AuthLayout>
          <AuthCard>
            <div className="text-center py-4">
              {/* Success icon */}
              <div
                className={cn(
                  'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full',
                  'bg-success/10 ring-2 ring-success/20'
                )}
              >
                <CheckCircle2
                  className="h-8 w-8 text-success"
                  aria-hidden="true"
                />
              </div>

              {/* Title */}
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-foreground">
                Check your email
              </h1>

              {/* Instructions */}
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                If an account exists for{' '}
                <strong className="text-foreground">{submittedEmail}</strong>,
                you will receive password reset instructions.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                Please check your inbox and spam folder. The link will expire in
                24 hours.
              </p>

              {/* Actions */}
              <div className="mt-8 space-y-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleRetry}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  Try a different email
                </Button>

                <Link
                  to={loginPath}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2',
                    'text-sm font-medium text-muted-foreground',
                    'hover:text-foreground transition-colors duration-200'
                  )}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to login
                </Link>
              </div>
            </div>
          </AuthCard>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <SEO
        title="Reset Password"
        description="Reset your CapVeri account password."
      />
      <AuthLayout showcase={<FeatureShowcase />}>
        <AuthCard
          header={
            <AuthCardHeader
              logo={<AuthLogo size="lg" />}
              title="Reset your password"
              subtitle="Enter your email. We'll send you a reset link."
            />
          }
        >
          {/* Reset Form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-5"
          >
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                disabled={isLoading}
                error={!!errors.email}
                {...register('email')}
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <p
                  id="email-error"
                  className="text-sm text-destructive-strong"
                  role="alert"
                >
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending reset instructions…
                </>
              ) : (
                'Send reset instructions'
              )}
            </Button>

            {/* Back to Login Link */}
            <div className="text-center pt-2">
              <Link
                to={loginPath}
                className={cn(
                  'inline-flex items-center gap-2 text-sm font-medium',
                  'text-muted-foreground hover:text-foreground',
                  'transition-colors duration-200'
                )}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to login
              </Link>
            </div>
          </form>
        </AuthCard>
      </AuthLayout>
    </>
  )
}
