/**
 * Team Member Signup Page (Invitation-Only)
 *
 * Allows invited team members to create their account using a secure token.
 * Token is validated before allowing signup.
 */
import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  useValidateTeamInvitation,
  useTeamSignup,
  type TeamInvitationValidation,
} from '@/hooks/use-team-invitations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, Building2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthCard, AuthCardHeader, AuthLogo } from '@/components/auth/AuthCard'
import { FeatureShowcase } from '@/components/auth/FeatureShowcase'
import { currentTermsAcceptance } from '@/lib/legalTerms'
import { resolveApiUrl } from '@/api/url'

// Role display configuration
const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  member: 'Team Member',
  viewer: 'Viewer',
}

export function TeamSignupPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  // Form state
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // API hooks
  const {
    data: invitation,
    isLoading: isValidating,
    error: validationError,
  } = useValidateTeamInvitation(token || '')

  const signupMutation = useTeamSignup()
  const signInReturnUrl = token
    ? `/team/signup?token=${encodeURIComponent(token)}`
    : '/team/signup'
  const signInUrl = `/auth/login?returnUrl=${encodeURIComponent(signInReturnUrl)}`

  // Existing users who open an invite should accept it before leaving the page.
  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || cancelled) {
        return
      }

      if (token) {
        const res = await fetch(
          resolveApiUrl('/api/v1/team/invitations/accept'),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token, user_id: session.user.id }),
          }
        )

        if (!res.ok) {
          if (!cancelled) {
            setFormError('Sign in again to accept this invite.')
          }
          return
        }
      }

      if (!cancelled) {
        navigate('/dashboard', { replace: true })
      }
    }
    checkAuth()

    return () => {
      cancelled = true
    }
  }, [navigate, token])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!fullName.trim()) {
      setFormError('Full name is required')
      return
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    if (!token) {
      setFormError('Invalid invitation token')
      return
    }

    if (!acceptedTerms) {
      setFormError('You must accept the current Terms of Service')
      return
    }

    try {
      const result = await signupMutation.mutateAsync({
        token,
        password,
        full_name: fullName,
        ...currentTermsAcceptance,
      })

      // Set the session in Supabase client
      if (result.access_token && result.refresh_token) {
        await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        })
      }

      // Navigate to dashboard
      navigate('/dashboard', {
        replace: true,
        state: { message: 'Welcome to CapVeri!' },
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Signup failed. Please try again.'
      setFormError(message)
    }
  }

  // Get error message from validation
  const getValidationErrorMessage = (
    validation: TeamInvitationValidation | undefined
  ): string | null => {
    if (!validation) return null
    if (validation.valid) return null

    switch (validation.error_reason) {
      case 'expired':
        return 'This invitation has expired. Please request a new invitation from your administrator.'
      case 'used':
        return 'This invitation has already been used. If you already have an account, please log in.'
      case 'revoked':
        return 'This invitation has been revoked. Please contact your administrator.'
      case 'not_found':
      default:
        return 'Invalid invitation link. Please check the link or request a new invitation.'
    }
  }

  // Loading state
  if (isValidating) {
    return (
      <AuthLayout>
        <div className="text-center">
          <Spinner
            className="mx-auto h-12 w-12"
            label="Validating invitation"
          />
          <p className="mt-4 text-sm text-muted-foreground" aria-hidden="true">
            Validating invitation...
          </p>
        </div>
      </AuthLayout>
    )
  }

  // No token provided
  if (!token) {
    return (
      <AuthLayout>
        <AuthCard>
          <div className="text-center">
            <div className="space-y-2" role="alert">
              <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-destructive">
                Invalid invitation
              </h1>
              <p className="text-sm text-muted-foreground">
                No invitation token provided. Please use the link from your
                invitation email.
              </p>
            </div>
            <div className="mt-8">
              <Button
                onClick={() => navigate('/auth/login')}
                className="w-full"
              >
                Go to login
              </Button>
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  // Validation error or invalid invitation
  const errorMessage =
    validationError instanceof Error
      ? validationError.message
      : getValidationErrorMessage(invitation)

  if (errorMessage || (invitation && !invitation.valid)) {
    return (
      <AuthLayout>
        <AuthCard>
          <div className="text-center">
            <div className="space-y-2" role="alert">
              <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-destructive">
                Invalid invitation
              </h1>
              <p className="text-sm text-muted-foreground">
                {errorMessage || 'This invitation is no longer valid.'}
              </p>
            </div>
            <div className="mt-8">
              <Button
                onClick={() => navigate('/auth/login')}
                className="w-full"
              >
                Go to login
              </Button>
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  // Valid invitation - show signup form
  return (
    <AuthLayout showcase={<FeatureShowcase />}>
      <AuthCard
        header={
          <AuthCardHeader
            logo={<AuthLogo size="lg" />}
            title="Join your team"
            subtitle="Complete your registration to get started."
          />
        }
      >
        {/* Invitation details */}
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">
                {invitation?.organization_name || 'Your Organization'}
              </p>
              <p className="text-sm text-muted-foreground">
                {invitation?.email}
              </p>
            </div>
            <Badge variant="secondary">
              {roleLabels[invitation?.role || 'member'] || 'Member'}
            </Badge>
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">
              Full name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              autoFocus
              disabled={signupMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Create password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={signupMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={signupMutation.isPending}
            />
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="acceptedTerms"
              aria-labelledby="accept-terms-label"
              disabled={signupMutation.isPending}
              checked={acceptedTerms}
              onCheckedChange={(value) => setAcceptedTerms(value === true)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label
                id="accept-terms-label"
                htmlFor="acceptedTerms"
                className="text-sm font-normal text-muted-foreground cursor-pointer leading-relaxed"
              >
                I accept the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
                >
                  Terms of Service
                </a>
                . I understand reports are drafts and need my review before I
                act on them.
              </Label>
            </div>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={signupMutation.isPending}
          >
            {signupMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={signInUrl}
            className="font-medium text-primary hover:text-primary/80 transition-colors duration-200"
          >
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  )
}
