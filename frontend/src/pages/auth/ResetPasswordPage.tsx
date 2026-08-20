import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { trackEvent } from '@/lib/analytics'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard, AuthCardHeader, AuthLogo } from '@/components/auth/AuthCard'
import { FeatureShowcase } from '@/components/auth/FeatureShowcase'
import { SEO } from '@/components/SEO'
import { toast } from '@/components/ui/sonner'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true)
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    })
    setIsSubmitting(false)

    if (error) {
      toast.error('Password reset failed', {
        description:
          error.message || 'Open the latest reset link and try again.',
      })
      return
    }

    trackEvent('password_reset_completed')
    setIsComplete(true)
  }

  if (isComplete) {
    return (
      <>
        <SEO
          title="Password Updated"
          description="Your CapVeri password has been updated."
        />
        <AuthLayout>
          <AuthCard>
            <div className="py-4 text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 ring-2 ring-success/20">
                <CheckCircle2
                  className="h-8 w-8 text-success"
                  aria-hidden="true"
                />
              </div>
              <h1 className="text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-foreground">
                Password updated
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Use your new password the next time you sign in.
              </p>
              <Button
                className="mt-6 w-full"
                onClick={() => navigate('/auth/login')}
              >
                Continue to login
              </Button>
            </div>
          </AuthCard>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <SEO
        title="Set New Password"
        description="Set a new password for your CapVeri account."
      />
      <AuthLayout showcase={<FeatureShowcase />}>
        <AuthCard
          header={
            <AuthCardHeader
              logo={<AuthLogo size="lg" />}
              title="Set a new password"
              subtitle="Enter a new password for your CapVeri account."
            />
          }
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a strong password"
                autoComplete="new-password"
                error={!!errors.password}
                {...register('password')}
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={
                  errors.password ? 'password-error' : undefined
                }
              />
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                autoComplete="new-password"
                error={!!errors.confirmPassword}
                {...register('confirmPassword')}
                aria-invalid={errors.confirmPassword ? 'true' : 'false'}
                aria-describedby={
                  errors.confirmPassword ? 'confirmPassword-error' : undefined
                }
              />
              {errors.confirmPassword && (
                <p
                  id="confirmPassword-error"
                  className="text-sm text-destructive-strong"
                  role="alert"
                >
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Need a new link?{' '}
            <Link
              to="/auth/forgot-password"
              className="font-medium text-primary"
            >
              Request another email
            </Link>
          </p>
        </AuthCard>
      </AuthLayout>
    </>
  )
}
