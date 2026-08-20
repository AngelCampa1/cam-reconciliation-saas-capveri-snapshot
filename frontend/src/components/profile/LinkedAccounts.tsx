import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { UserIdentity } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { Check, Link, Unlink } from 'lucide-react'

export function LinkedAccounts() {
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [actionProvider, setActionProvider] = useState<string | null>(null)
  const [unlinkDialog, setUnlinkDialog] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    fetchIdentities()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchIdentities = async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true)
        setFetchError(false)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        if (isMountedRef.current) {
          const visibleIdentities = (user.identities || []).filter(
            (identity) => identity.provider !== 'apple'
          )
          setIdentities(visibleIdentities)
          // Check if user has email/password auth
          setHasPassword(
            visibleIdentities.some((i) => i.provider === 'email') || false
          )
        }
      }
    } catch (error) {
      logger.error('Failed to fetch user identities', { error })
      if (isMountedRef.current) {
        setFetchError(true)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleLinkProvider = async (provider: 'google') => {
    try {
      setActionProvider(provider)

      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/settings/profile?linked=${provider}`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      logger.error('Failed to link identity provider', { provider, error })
      toast.error('Link failed', {
        description: `Could not link your ${provider} account. Please try again.`,
      })
      setActionProvider(null)
    }
  }

  const handleUnlinkProvider = async (provider: string) => {
    // Check if this is the only auth method
    const totalMethods = identities.length + (hasPassword ? 1 : 0)
    if (totalMethods <= 1) {
      toast.error('Cannot unlink', {
        description: 'You must have at least one way to sign in.',
      })
      return
    }

    try {
      setActionProvider(provider)

      const identity = identities.find((i) => i.provider === provider)
      if (!identity) return

      const { error } = await supabase.auth.unlinkIdentity(identity)

      if (error) {
        throw error
      }

      toast.success('Account unlinked', {
        description: `Your ${provider} account has been unlinked.`,
      })

      // Refresh identities
      await fetchIdentities()
    } catch (error) {
      logger.error('Failed to unlink identity provider', { provider, error })
      toast.error('Unlink failed', {
        description: `Could not unlink your ${provider} account. Please try again.`,
      })
    } finally {
      setActionProvider(null)
      setUnlinkDialog(null)
    }
  }

  const isLinked = (provider: string) =>
    identities.some((i) => i.provider === provider)

  const canUnlink = () => {
    const totalMethods = identities.length
    return totalMethods > 1
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    )
  }

  if (fetchError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Linked Accounts</CardTitle>
          <CardDescription>
            Sign in with Google instead of a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive-strong" role="alert">
            We couldn't load your linked accounts. Check your connection and try
            again.
          </p>
          <Button variant="outline" size="sm" onClick={() => fetchIdentities()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Linked Accounts</CardTitle>
          <CardDescription>
            Sign in with Google instead of a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google */}
          <div className="flex items-center justify-between p-4 border rounded-lg shadow-sm transition-all duration-fast hover:shadow-elevation-1">
            <div className="flex items-center gap-3">
              <GoogleIcon className="h-6 w-6" />
              <div>
                <p className="font-medium">Google</p>
                {isLinked('google') && (
                  <p className="text-sm text-muted-foreground">
                    {
                      identities.find((i) => i.provider === 'google')
                        ?.identity_data?.email
                    }
                  </p>
                )}
              </div>
            </div>
            {isLinked('google') ? (
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success-strong" />
                {canUnlink() && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Unlink Google account"
                    onClick={() => setUnlinkDialog('google')}
                    disabled={actionProvider !== null}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLinkProvider('google')}
                disabled={actionProvider !== null}
              >
                {actionProvider === 'google' ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <>
                    <Link className="h-4 w-4 mr-2" />
                    Link
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog
        open={!!unlinkDialog}
        onOpenChange={() => setUnlinkDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {unlinkDialog} account?</AlertDialogTitle>
            <AlertDialogDescription>
              After unlinking, you can't sign in with {unlinkDialog}. Make sure
              you have another sign-in method.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unlinkDialog && handleUnlinkProvider(unlinkDialog)}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
