/**
 * Login Page Component
 *
 * Premium login experience with split-screen layout.
 * Features:
 * - Split layout with form and feature showcase
 * - Enhanced form card with focus effects
 * - Form validation with Zod
 * - Password visibility toggle
 * - Remember me checkbox
 * - Error handling with refined styling
 * - Loading states
 * - Return URL support
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, AlertCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard, AuthCardHeader, AuthLogo } from '@/components/auth/AuthCard'
import { FeatureShowcase } from '@/components/auth/FeatureShowcase'
import { TrustIndicators } from '@/components/auth/TrustIndicators'
import { SEO } from '@/components/SEO'

// Login form validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, login, error } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [sessionExpiredDismissed, setSessionExpiredDismissed] = useState(false)

  // Get return URL from query params
  const returnUrl = searchParams.get('returnUrl') || '/'

  // React Hook Form with Zod validation
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  })

  // Redirect to return URL if already logged in
  useEffect(() => {
    if (user) {
      navigate(returnUrl)
    }
  }, [user, navigate, returnUrl])

  // Handle form submission
  const onSubmit = async (data: LoginFormData) => {
    await login(data.email, data.password, data.rememberMe ?? false)
  }

  return (
    <>
      <SEO
        title="Sign In"
        description="Sign in to your CapVeri account to start finding billing errors."
      />
      <AuthLayout showcase={<FeatureShowcase />}>
        <AuthCard
          header={
            <AuthCardHeader
              logo={<AuthLogo size="lg" />}
              title="Welcome back"
              subtitle="Sign in to your CapVeri account to continue"
            />
          }
        >
          {/* Session Expired Banner */}
          {searchParams.get('expired') === 'true' &&
            !sessionExpiredDismissed && (
              <div
                className="mb-6 flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm text-warning-foreground"
                role="alert"
                data-testid="session-expired-banner"
              >
                <span className="flex-1">
                  Your session has expired. Please sign in again.
                </span>
                <button
                  type="button"
                  onClick={() => setSessionExpiredDismissed(true)}
                  className="shrink-0 rounded-full p-0.5 text-warning-foreground/70 transition-colors hover:bg-warning/20 hover:text-warning-foreground"
                  aria-label="Dismiss session expired notice"
                  data-testid="session-expired-dismiss"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

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
                <p className="font-medium">
                  {error.includes('credentials') ||
                  error.includes('password') ||
                  error.includes('401')
                    ? 'Invalid credentials'
                    : error.includes('locked') || error.includes('disabled')
                      ? 'Account locked'
                      : error.includes('verify') || error.includes('email')
                        ? 'Email not verified'
                        : 'Authentication failed'}
                </p>
                <p className="mt-0.5 text-destructive-strong">
                  {error.includes('credentials') ||
                  error.includes('password') ||
                  error.includes('401')
                    ? 'Email or password is incorrect. Please try again.'
                    : error.includes('locked') || error.includes('disabled')
                      ? 'Your account has been locked. Please contact support.'
                      : error.includes('verify') || error.includes('email')
                        ? 'Please verify your email address before logging in.'
                        : error}
                </p>
              </div>
            </div>
          )}

          {/* Login Form */}
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
                disabled={isSubmitting}
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Link
                  to="/auth/forgot-password"
                  className="rounded-full text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  error={!!errors.password}
                  className="pr-10"
                  {...register('password')}
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
                    'transition-colors duration-fast cursor-pointer rounded-full'
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
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Controller
                name="rememberMe"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="rememberMe"
                    disabled={isSubmitting}
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal text-muted-foreground cursor-pointer"
              >
                Remember me for 30 days
              </Label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          {/* Social Login Buttons */}
          <SocialLoginButtons returnUrl={returnUrl} />

          {/* Trust Indicators */}
          <div className="mt-8 pt-6 border-t border-border-subtle">
            <TrustIndicators />
          </div>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              to="/auth/register"
              className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
            >
              Create an account
            </Link>
          </p>
        </AuthCard>
      </AuthLayout>
    </>
  )
}
