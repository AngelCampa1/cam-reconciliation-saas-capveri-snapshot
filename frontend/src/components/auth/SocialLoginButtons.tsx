import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

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

  const handleOAuthLogin = async (provider: 'google') => {
    try {
      setLoadingProvider(provider)

      // Store return URL for after OAuth callback
      if (returnUrl) {
        sessionStorage.setItem('returnUrl', returnUrl)
      }

      // Build redirect URL with optional invite token and return URL
      const redirectTo = new URL('/auth/callback', window.location.origin)
      if (inviteToken) {
        redirectTo.searchParams.set('invite', inviteToken)
      }
      if (returnUrl) {
        redirectTo.searchParams.set('returnUrl', returnUrl)
      }

      // NOTE: Supabase OAuth uses queryParams for Google scopes, not a direct scopes option.
      // Google requires access_type: 'offline' to get refresh_token.
      // See: https://supabase.com/docs/guides/auth/social-login/auth-google
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        throw error
      }

      // OAuth will redirect, no need to handle success here
    } catch (error) {
      logger.error('OAuth login failed', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      toast.error('Sign in failed', {
        description: `Could not sign in with ${provider}. Please try again.`,
      })
      setLoadingProvider(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <Button
        variant="outline"
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => handleOAuthLogin('google')}
        className={cn(
          'h-11 font-medium',
          'border-border-subtle bg-card',
          'hover:bg-muted/50 hover:border-border',
          'transition-all duration-fast',
          // Subtle shadow on hover
          'hover:shadow-sm'
        )}
      >
        {loadingProvider === 'google' ? (
          <>
            <Spinner className="mr-2 h-5 w-5" aria-hidden="true" />
            Connecting…
          </>
        ) : (
          <>
            <GoogleIcon className="mr-2 h-5 w-5" aria-hidden="true" />
            Continue with Google
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By continuing, you accept the{' '}
        <a href="/terms" className="text-primary hover:underline">
          Terms of Service
        </a>
        .
      </p>
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
