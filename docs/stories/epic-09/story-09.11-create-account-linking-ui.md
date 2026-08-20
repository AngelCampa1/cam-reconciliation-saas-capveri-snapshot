# Story 9.11: Create Account Linking UI

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Story 9.9 (OAuth Callback), Story 9.5 (Profile Page)
- **Status**: `pending`

## User Story
**As a** user
**I want** to link my Google and Apple accounts to my existing account
**So that** I can sign in using any of my linked accounts

## Acceptance Criteria
- [ ] **AC1**: Profile page shows currently linked OAuth providers
- [ ] **AC2**: "Link Google Account" button available if not linked
- [ ] **AC3**: "Link Apple Account" button available if not linked
- [ ] **AC4**: Confirmation dialog before linking
- [ ] **AC5**: Ability to unlink provider (if not the only auth method)
- [ ] **AC6**: Clear indication of which providers are linked

## Technical Specifications

### Linked Accounts Section Component

**File to Create**: `frontend/src/components/profile/LinkedAccounts.tsx`

```tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/ui/spinner'
import { Check, Link, Unlink } from 'lucide-react'

interface Identity {
  id: string
  provider: string
  created_at: string
  identity_data?: {
    email?: string
    full_name?: string
  }
}

export function LinkedAccounts() {
  const [identities, setIdentities] = useState<Identity[]>([])
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionProvider, setActionProvider] = useState<string | null>(null)
  const [unlinkDialog, setUnlinkDialog] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchIdentities()
  }, [])

  const fetchIdentities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setIdentities(user.identities || [])
        // Check if user has email/password auth
        setHasPassword(user.identities?.some(i => i.provider === 'email') || false)
      }
    } catch (error) {
      console.error('Failed to fetch identities:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLinkProvider = async (provider: 'google' | 'apple') => {
    try {
      setActionProvider(provider)

      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${window.location.origin}/profile?linked=${provider}`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      console.error(`Failed to link ${provider}:`, error)
      toast({
        variant: 'destructive',
        title: 'Link failed',
        description: `Could not link your ${provider} account. Please try again.`,
      })
      setActionProvider(null)
    }
  }

  const handleUnlinkProvider = async (provider: string) => {
    // Check if this is the only auth method
    const totalMethods = identities.length + (hasPassword ? 1 : 0)
    if (totalMethods <= 1) {
      toast({
        variant: 'destructive',
        title: 'Cannot unlink',
        description: 'You must have at least one way to sign in.',
      })
      return
    }

    try {
      setActionProvider(provider)

      const identity = identities.find(i => i.provider === provider)
      if (!identity) return

      const { error } = await supabase.auth.unlinkIdentity(identity)

      if (error) {
        throw error
      }

      toast({
        title: 'Account unlinked',
        description: `Your ${provider} account has been unlinked.`,
      })

      // Refresh identities
      await fetchIdentities()
    } catch (error) {
      console.error(`Failed to unlink ${provider}:`, error)
      toast({
        variant: 'destructive',
        title: 'Unlink failed',
        description: `Could not unlink your ${provider} account. Please try again.`,
      })
    } finally {
      setActionProvider(null)
      setUnlinkDialog(null)
    }
  }

  const isLinked = (provider: string) =>
    identities.some(i => i.provider === provider)

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Linked Accounts</CardTitle>
          <CardDescription>
            Connect your accounts for easier sign in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <GoogleIcon className="h-6 w-6" />
              <div>
                <p className="font-medium">Google</p>
                {isLinked('google') && (
                  <p className="text-sm text-muted-foreground">
                    {identities.find(i => i.provider === 'google')?.identity_data?.email}
                  </p>
                )}
              </div>
            </div>
            {isLinked('google') ? (
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                {canUnlink() && (
                  <Button
                    variant="ghost"
                    size="sm"
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

          {/* Apple */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <AppleIcon className="h-6 w-6" />
              <div>
                <p className="font-medium">Apple</p>
                {isLinked('apple') && (
                  <p className="text-sm text-muted-foreground">
                    {identities.find(i => i.provider === 'apple')?.identity_data?.email || 'Connected'}
                  </p>
                )}
              </div>
            </div>
            {isLinked('apple') ? (
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                {canUnlink() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUnlinkDialog('apple')}
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
                onClick={() => handleLinkProvider('apple')}
                disabled={actionProvider !== null}
              >
                {actionProvider === 'apple' ? (
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
      <AlertDialog open={!!unlinkDialog} onOpenChange={() => setUnlinkDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink {unlinkDialog} account?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to sign in with your {unlinkDialog} account.
              Make sure you have another way to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unlinkDialog && handleUnlinkProvider(unlinkDialog)}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Icon components (same as in SocialLoginButtons)
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      {/* ... same SVG path as before */}
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {/* ... same SVG path as before */}
    </svg>
  )
}
```

### Profile Page Integration

**File to Update**: `frontend/src/pages/Profile.tsx`

```tsx
import { LinkedAccounts } from '@/components/profile/LinkedAccounts'

export function ProfilePage() {
  return (
    <div className="container max-w-2xl py-8 space-y-8">
      <h1 className="text-2xl font-bold">Profile Settings</h1>

      {/* Existing profile sections */}
      <ProfileInfo />
      <ChangePassword />

      {/* New linked accounts section */}
      <LinkedAccounts />

      {/* Danger zone */}
      <DeleteAccount />
    </div>
  )
}
```

## Definition of Done
- [ ] Linked accounts section shows on profile page
- [ ] Current linked providers displayed with checkmark
- [ ] Link button initiates OAuth flow
- [ ] Unlink button shows confirmation dialog
- [ ] Cannot unlink last auth method
- [ ] Success/error toasts for all actions
- [ ] Loading states during link/unlink operations
