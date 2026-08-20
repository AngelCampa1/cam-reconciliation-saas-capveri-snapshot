# Story 9.10: Add Social Login Buttons

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Story 9.1 (Login Page), Story 9.8 (OAuth Config)
- **Status**: `pending`

## User Story
**As a** user
**I want** Google and Apple sign-in buttons on the login page
**So that** I can quickly sign in without creating a new password

## Acceptance Criteria
- [ ] **AC1**: Google sign-in button follows Google brand guidelines
- [ ] **AC2**: Apple sign-in button follows Apple brand guidelines
- [ ] **AC3**: Buttons positioned below email/password form with "or" divider
- [ ] **AC4**: Loading state shown during OAuth redirect
- [ ] **AC5**: Error handling for OAuth failures
- [ ] **AC6**: Buttons work on registration page too

## Technical Specifications

### Social Login Buttons Component

**File to Create**: `frontend/src/components/auth/SocialLoginButtons.tsx`

```tsx
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'

interface SocialLoginButtonsProps {
  /** Optional invite token to pass through OAuth flow */
  inviteToken?: string
  /** Optional return URL after auth */
  returnUrl?: string
}

export function SocialLoginButtons({
  inviteToken,
  returnUrl,
}: SocialLoginButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const { toast } = useToast()

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    try {
      setLoadingProvider(provider)

      // Store return URL for after OAuth callback
      if (returnUrl) {
        sessionStorage.setItem('returnUrl', returnUrl)
      }

      // Build redirect URL with optional invite token
      const redirectTo = new URL('/auth/callback', window.location.origin)
      if (inviteToken) {
        redirectTo.searchParams.set('invite', inviteToken)
      }

      // NOTE: Supabase OAuth uses queryParams for Google scopes, not a direct scopes option
      // Google requires access_type: 'offline' to get refresh_token
      // See: https://supabase.com/docs/guides/auth/social-login/auth-google
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo.toString(),
          // For Google: Use queryParams for scopes and refresh token
          // For Apple: Scopes handled by Supabase configuration
          queryParams: provider === 'google'
            ? {
                access_type: 'offline',
                prompt: 'consent',
              }
            : undefined,
        },
      })

      if (error) {
        throw error
      }

      // OAuth will redirect, no need to handle success here
    } catch (error) {
      console.error(`${provider} login error:`, error)
      toast({
        variant: 'destructive',
        title: 'Sign in failed',
        description: `Could not sign in with ${provider}. Please try again.`,
      })
      setLoadingProvider(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      {/* Social Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleOAuthLogin('google')}
          className="h-11"
        >
          {loadingProvider === 'google' ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <>
              <GoogleIcon className="mr-2 h-5 w-5" />
              Google
            </>
          )}
        </Button>

        <Button
          variant="outline"
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleOAuthLogin('apple')}
          className="h-11"
        >
          {loadingProvider === 'apple' ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <>
              <AppleIcon className="mr-2 h-5 w-5" />
              Apple
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}
```

### Login Page Integration

**File to Update**: `frontend/src/pages/auth/Login.tsx`

```tsx
// Add after the login form, before the register link
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons'

// In the component:
<form onSubmit={handleSubmit}>
  {/* Email/password fields */}
</form>

<div className="mt-6">
  <SocialLoginButtons returnUrl={returnUrl} />
</div>

<p className="mt-6 text-center text-sm text-muted-foreground">
  Don't have an account?{' '}
  <Link to="/register" className="text-primary hover:underline">
    Sign up
  </Link>
</p>
```

### Register Page Integration

**File to Update**: `frontend/src/pages/auth/Register.tsx`

```tsx
// Same pattern as login page
<form onSubmit={handleSubmit}>
  {/* Registration fields */}
</form>

<div className="mt-6">
  <SocialLoginButtons
    inviteToken={inviteToken}
    returnUrl="/onboarding"
  />
</div>
```

## Brand Guidelines

### Google Sign-In
- Use official Google colors or monochrome
- "Sign in with Google" or "Continue with Google"
- Minimum padding and sizing per guidelines
- Reference: https://developers.google.com/identity/branding-guidelines

### Apple Sign-In
- Use black, white, or outline style
- "Sign in with Apple" or "Continue with Apple"
- Apple logo must be used exactly as specified
- Reference: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple

## Definition of Done
- [ ] Google button matches brand guidelines
- [ ] Apple button matches brand guidelines
- [ ] Buttons show loading state during redirect
- [ ] OAuth errors display toast notification
- [ ] Buttons work on both login and register pages
- [ ] Invite token passed through OAuth flow
