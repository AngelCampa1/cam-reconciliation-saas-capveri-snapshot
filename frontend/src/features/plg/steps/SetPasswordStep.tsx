/**
 * Set Password Step: PLG onboarding Step 7.
 *
 * Upgrades the anonymous Supabase account with the captured email + a new password.
 * 1. supabase.auth.updateUser({ email, password })
 * 2. PATCH /api/v1/onboard/upgrade to sync email/org in the DB
 * 3. Navigate to billing selection
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnboarding } from '../OnboardFlowContext'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'

export function SetPasswordStep() {
  const navigate = useNavigate()
  const { state, completeOnboarding } = useOnboarding()
  const email = state.data.email ?? ''
  const orgName = state.data.organizationName ?? ''

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 7,
      step_label: 'Set Password',
    })
  }, [])

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): boolean => {
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return false
    }
    setPasswordError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setAlreadyRegistered(false)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        password,
      })

      if (updateError) {
        if (updateError.message.toLowerCase().includes('already')) {
          setAlreadyRegistered(true)
          return
        }
        setPasswordError(updateError.message)
        return
      }

      // Re-read session to get the post-upgrade access token.
      // supabase.auth.updateUser() resolves only after the local session is
      // refreshed, so getSession() here reliably returns the new access token.
      // (Edge case: if email confirmation is required, the anon token is still
      // valid for the same user ID and the upgrade endpoint will still succeed.)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      // Sync to DB
      const upgradeResp = await fetch(
        resolveApiUrl('/api/v1/onboard/upgrade'),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            email,
            organization_name: orgName || undefined,
          }),
        }
      )

      if (!upgradeResp.ok) {
        setPasswordError(
          'Account created but profile sync failed. Please contact support.'
        )
        return
      }

      trackEvent('onboard_step_completed', {
        step: 7,
        step_label: 'Set Password',
      })
      completeOnboarding()
      navigate('/settings/billing?intent=select-plan')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-bold">Set Your Password</h2>
        <p className="text-muted-foreground">
          Create a password to access your reconciliation anytime
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="emailDisplay">Email</Label>
          <Input
            id="emailDisplay"
            type="email"
            value={email}
            readOnly
            className="bg-muted"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError) setPasswordError(null)
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (passwordError) setPasswordError(null)
            }}
          />
          {passwordError && (
            <p className="text-sm text-destructive-strong">{passwordError}</p>
          )}
        </div>

        {alreadyRegistered && (
          <p className="text-sm text-destructive-strong">
            This email already has an account.{' '}
            <Link
              to={`/auth/login?email=${encodeURIComponent(email)}`}
              className="underline"
            >
              Sign in
            </Link>
          </p>
        )}

        <Button
          type="submit"
          className="w-full min-h-[44px]"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating…' : 'Create Account'}
        </Button>
      </form>
    </div>
  )
}
