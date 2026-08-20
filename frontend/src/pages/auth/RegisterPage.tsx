/**
 * Registration Page Component
 *
 * Minimal signup: email + password (or SSO) + terms.
 * Organization name is derived from the email domain post-signup; users can
 * rename their workspace later from settings.
 */
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, AlertCircle, Loader2, Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { startDefaultTrial } from '@/lib/billing/startDefaultTrial'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard, AuthCardHeader, AuthLogo } from '@/components/auth/AuthCard'
import { FeatureShowcase } from '@/components/auth/FeatureShowcase'
import { TRIAL_COPY } from '@/lib/domains'
import { TrustIndicators } from '@/components/auth/TrustIndicators'
import { SEO } from '@/components/SEO'
import { useExitIntent } from '@/hooks/useExitIntent'
import { ExitIntentDialog } from '@/components/auth/ExitIntentDialog'

// Registration form validation schema
const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms of service',
  }),
})

type RegisterFormData = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { register: registerUser, isLoading, error, user } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const justRegisteredRef = useRef(false)
  const { triggered, dismiss } = useExitIntent({ idleTimeout: 60_000, formRef })

  // React Hook Form with Zod validation
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      acceptTerms: false,
    },
  })

  // Watch password for strength indicator
  const password = watch('password', '')

  // Extract password field registration to avoid IIFE in JSX
  const passwordField = register('password')

  // Live password requirement state (display + screen-reader only).
  // Mirrors the Zod schema above, which stays the source of truth for validation.
  const passwordRules = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(password), label: 'One uppercase letter (A-Z)' },
    { ok: /[a-z]/.test(password), label: 'One lowercase letter (a-z)' },
    { ok: /[0-9]/.test(password), label: 'One number (0-9)' },
  ]
  const passwordRulesMet = passwordRules.filter((rule) => rule.ok).length

  // Redirect to dashboard if user is logged in (after successful registration)
  useEffect(() => {
    if (user && !justRegisteredRef.current) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  // Handle form submission
  const onSubmit = async (data: RegisterFormData) => {
    justRegisteredRef.current = true
    const registered = await registerUser(data.email, data.password)
    if (registered) {
      // Auto-start full-feature trial. Awaited so any failure surfaces a toast,
      // but it never blocks navigation. startDefaultTrial swallows errors and
      // the user can start the trial later from Billing settings.
      await startDefaultTrial()
      navigate('/onboard?demo=1&source=first-login')
      return
    }
    justRegisteredRef.current = false
  }

  return (
    <>
      <SEO
        title="Create Account"
        description={`Create your CapVeri account, then start your ${TRIAL_COPY}. No credit card required.`}
      />
      <AuthLayout showcase={<FeatureShowcase />}>
        <AuthCard
          header={
            <AuthCardHeader
              logo={<AuthLogo size="lg" />}
              title="Create your free account"
              subtitle="Just an email and a password to get started."
            />
          }
        >
          {/* Trial reassurance */}
          <div className="mb-6 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-center">
            <p className="text-sm font-medium text-foreground">
              Start your {TRIAL_COPY}. No credit card. Full access to all plan
              features. Pick a plan from billing settings when you're ready.
            </p>
          </div>

          {/* Social Login Buttons - primary path */}
          <SocialLoginButtons returnUrl="/onboard?demo=1&source=first-login" />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or sign up with email
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className={cn(
                'mb-6 flex items-start gap-3 rounded-lg p-4',
                'bg-destructive/10 border border-destructive/20',
                'text-sm text-destructive-strong'
              )}
              role="alert"
              aria-live="polite"
            >
              <AlertCircle
                className="h-5 w-5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Registration failed</p>
                <p className="mt-0.5 text-destructive-strong">{error}</p>
              </div>
            </div>
          )}

          {/* Registration Form */}
          <form
            ref={formRef}
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-5"
          >
            {/* Email Field - first for progressive disclosure */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Work Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
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

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  disabled={isLoading}
                  error={!!errors.password}
                  className="pr-10"
                  {...passwordField}
                  onBlur={(e) => {
                    void passwordField.onBlur(e)
                    setPasswordFocused(false)
                  }}
                  onFocus={() => setPasswordFocused(true)}
                  aria-invalid={errors.password ? 'true' : 'false'}
                  aria-describedby={
                    errors.password ? 'password-error' : undefined
                  }
                />
                <button
                  type="button"
                  className={cn(
                    'absolute inset-y-0 right-0 flex w-10 items-center justify-center',
                    'text-muted-foreground hover:text-foreground',
                    'transition-colors duration-fast rounded-full'
                  )}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p
                  id="password-error"
                  className="text-sm text-destructive-strong"
                  role="alert"
                >
                  {errors.password.message}
                </p>
              )}
              {(passwordFocused || password.length > 0) && (
                <>
                  <ul
                    className="mt-2 space-y-1 text-xs"
                    aria-label="Password requirements"
                  >
                    {passwordRules.map((rule) => (
                      <li
                        key={rule.label}
                        className={cn(
                          'flex items-center gap-1.5',
                          rule.ok ? 'text-success' : 'text-muted-foreground'
                        )}
                      >
                        {rule.ok ? (
                          <Check
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>{rule.label}</span>
                        <span className="sr-only">
                          {rule.ok ? 'met' : 'not met'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="sr-only" role="status" aria-live="polite">
                    {`Password meets ${passwordRulesMet} of ${passwordRules.length} requirements.`}
                  </p>
                </>
              )}
              {password.length > 0 && (
                <PasswordStrength password={password} className="mt-2" />
              )}
            </div>

            {/* Terms of Service Checkbox */}
            <div className="flex items-start space-x-3">
              <Controller
                name="acceptTerms"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="acceptTerms"
                    aria-labelledby="accept-terms-label"
                    disabled={isLoading}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                )}
              />
              <div className="flex-1">
                <Label
                  id="accept-terms-label"
                  htmlFor="acceptTerms"
                  className="text-sm font-normal text-muted-foreground cursor-pointer leading-relaxed"
                >
                  I accept the{' '}
                  <a
                    href="/terms"
                    className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                </Label>
                {errors.acceptTerms && (
                  <p
                    className="mt-1 text-sm text-destructive-strong"
                    role="alert"
                  >
                    {errors.acceptTerms.message}
                  </p>
                )}
              </div>
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
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          {/* Trust Indicators */}
          <div className="mt-8 pt-6 border-t border-border-subtle">
            <TrustIndicators />
          </div>

          {/* Sign in link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/auth/login"
              className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
            >
              Sign in
            </Link>
          </p>
        </AuthCard>
      </AuthLayout>
      <ExitIntentDialog open={triggered} onDismiss={dismiss} />
    </>
  )
}
