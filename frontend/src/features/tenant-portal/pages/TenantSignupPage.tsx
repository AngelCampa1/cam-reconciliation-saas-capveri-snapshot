/**
 * Tenant Signup Page (Invitation-Only)
 *
 * Allows invited tenants to create their account using a secure token.
 * Token is validated before allowing signup.
 */

import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  validateInvitationTokenApiV1TenantInvitationsTokenValidateGet,
  tenantSignupApiV1TenantSignupPost,
} from '@/api/generated/sdk.gen'
import type { InvitationValidationResponse } from '@/api/generated/types.gen'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { currentTermsAcceptance } from '@/lib/legalTerms'

export function TenantSignupPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [invitation, setInvitation] =
    useState<InvitationValidationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [contactName, setContactName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Validate token with API
    const validateToken = async () => {
      if (!token) {
        setError(
          'This invite link is broken. Ask your property manager to send you a new one.'
        )
        setLoading(false)
        return
      }

      try {
        const response =
          await validateInvitationTokenApiV1TenantInvitationsTokenValidateGet({
            path: { token },
          })

        if (response.error) {
          setError(
            'This invite link no longer works. Ask your property manager to send you a new one.'
          )
          setLoading(false)
          return
        }

        setInvitation(response.data)
        setLoading(false)
      } catch {
        setError(
          'This invite link no longer works. Ask your property manager to send you a new one.'
        )
        setLoading(false)
      }
    }

    validateToken()
  }, [token])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!contactName.trim()) {
      setError('Contact name is required')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (!token) {
      setError(
        'This invite link no longer works. Ask your property manager to send you a new one.'
      )
      return
    }

    if (!acceptedTerms) {
      setError('You must accept the current Terms of Service')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await tenantSignupApiV1TenantSignupPost({
        body: {
          token,
          password,
          contact_name: contactName,
          ...currentTermsAcceptance,
        },
      })

      if (response.error) {
        const errorDetail = response.error.detail
        const errorMessage =
          typeof errorDetail === 'string' ? errorDetail : 'Signup failed'
        throw new Error(errorMessage)
      }

      // Establish Supabase session so AuthContext picks up the user
      if (response.data.access_token && response.data.refresh_token) {
        await supabase.auth.setSession({
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
        })
      }

      navigate('/tenant/dashboard', {
        state: { message: 'Account created successfully!' },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center">
              <Spinner size="lg" />
              <span className="ml-2 text-muted-foreground">
                Checking your invite...
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md shadow-md">
          <CardHeader className="bg-gradient-to-r from-destructive/5 to-destructive/10 rounded-t-lg">
            <CardTitle as="h1">Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <Link to="/tenant/login" className="text-primary hover:underline">
                Go to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-lg">
          <CardTitle as="h1" className="text-2xl font-bold">
            Complete Your Registration
          </CardTitle>
          <CardDescription>
            Your property manager invited you to view your lease.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg shadow-sm">
            <p className="text-sm text-foreground">
              <strong>Email:</strong> {invitation?.email}
            </p>
          </div>
          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="contactName">Your Name</Label>
              <Input
                id="contactName"
                type="text"
                placeholder="Enter your full name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="acceptedTerms"
                aria-labelledby="accept-terms-label"
                checked={acceptedTerms}
                onCheckedChange={(value) => setAcceptedTerms(value === true)}
              />
              <Label
                id="accept-terms-label"
                htmlFor="acceptedTerms"
                className="text-sm font-normal text-muted-foreground"
              >
                I accept the{' '}
                <Link to="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>
                . I understand reports are drafts and need my review before I
                act on them.
              </Label>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/tenant/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
