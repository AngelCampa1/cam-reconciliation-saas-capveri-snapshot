/**
 * User Profile Page
 *
 * Allows users to view and edit their profile information including
 * name and password. Email changes require contacting support.
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUserRole } from '@/hooks/useUserRole'
import { UserRole } from '@/types/enums'
import { resolveApiUrl } from '@/api/url'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { trackEvent } from '@/lib/analytics'
import { snakeToTitleCase } from '@/lib/title-case'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Spinner } from '@/components/ui/spinner'
import { SkeletonCard } from '@/components/ui/skeleton'
import { LinkedAccounts } from '@/components/profile/LinkedAccounts'
import { PageHeader } from '@/components/layout/PageHeader'

// Profile information schema
const profileInfoSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
})

type ProfileInfoFormData = z.infer<typeof profileInfoSchema>

// Password change schema
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>

const ROLE_LABELS: Record<string, string> = {
  [UserRole.OWNER]: 'Owner',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.MEMBER]: 'Member',
  [UserRole.TENANT]: 'Tenant',
  [UserRole.VIEWER]: 'Viewer',
}

function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return 'User'
  return ROLE_LABELS[role] ?? snakeToTitleCase(role)
}

function getAccountDeletionBlockReason(
  message: string
):
  | 'last_org_user'
  | 'last_org_admin'
  | 'audit_history'
  | 'linked_records'
  | 'unknown' {
  const normalizedMessage = message.toLowerCase()
  if (normalizedMessage.includes('last account')) return 'last_org_user'
  if (
    normalizedMessage.includes('owner or admin') ||
    normalizedMessage.includes('administrator')
  ) {
    return 'last_org_admin'
  }
  if (
    normalizedMessage.includes('audit') ||
    normalizedMessage.includes('reconciliation') ||
    normalizedMessage.includes('verification') ||
    normalizedMessage.includes('warranty')
  ) {
    return 'audit_history'
  }
  if (normalizedMessage.includes('linked to')) return 'linked_records'
  return 'unknown'
}

/**
 * ProfilePage Component
 *
 * Displays user profile information with editable name and password change forms.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { user, session, logout } = useAuth()
  const { userRole } = useUserRole()
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Password change only applies to accounts that have an email/password
  // identity. Social-only logins (e.g. Google) have no password to verify or
  // update --- calling signInWithPassword for them always fails, so we show a
  // notice instead of a broken form. We only treat the account as social-only
  // when we can POSITIVELY determine it: we have provider evidence and none of
  // it is 'email'. Two evidence sources are used because they don't always
  // agree --- some GoTrue configs return an empty `identities` array for a
  // genuine email/password user while still reporting the provider in
  // `app_metadata`. Trusting `identities` alone (an empty array is truthy, so
  // `[].some()` is false) would wrongly hide the form from password users. When
  // we have no provider evidence at all we keep the form, preserving access for
  // password users.
  const appProviders = [
    user?.app_metadata?.provider,
    ...(user?.app_metadata?.providers ?? []),
  ].filter((provider): provider is string => Boolean(provider))
  const identities = user?.identities ?? []
  const hasProviderEvidence = identities.length > 0 || appProviders.length > 0
  const hasEmailProvider =
    identities.some((identity) => identity.provider === 'email') ||
    appProviders.includes('email')
  const hasPasswordIdentity = hasProviderEvidence ? hasEmailProvider : true

  // Profile info form
  const profileForm = useForm<ProfileInfoFormData>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      name: user?.user_metadata?.name || user?.email?.split('@')[0] || '',
    },
  })

  // Password change form
  const passwordForm = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Handle profile update
  const onProfileSubmit = async (data: ProfileInfoFormData) => {
    setIsUpdatingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          name: data.name,
        },
      })

      if (error) throw error

      trackEvent('profile_update_completed')
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error("Couldn't update your profile", {
        description: getErrorMessage(error),
      })
      logger.error('Profile update failed', { error })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // Handle password change
  const onPasswordSubmit = async (data: PasswordChangeFormData) => {
    setIsChangingPassword(true)
    try {
      // Verify current password before allowing the change
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: data.currentPassword,
      })

      if (verifyError) {
        passwordForm.setError('currentPassword', {
          message: 'Current password is incorrect',
        })
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: data.newPassword,
      })

      if (updateError) throw updateError

      trackEvent('password_change_completed')
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch (error) {
      toast.error("Couldn't change your password", {
        description: getErrorMessage(error),
      })
      logger.error('Password change failed', { error })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const onDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account deletion')
      return
    }

    setIsDeletingAccount(true)
    setDeleteError(null)
    trackEvent('account_deletion_requested')

    try {
      const response = await fetch(resolveApiUrl('/api/v1/auth/account'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      })

      if (!response.ok) {
        let message = 'Failed to delete account'
        try {
          const body = (await response.json()) as { detail?: unknown }
          if (typeof body.detail === 'string') {
            message = body.detail
          }
        } catch {
          // Keep the generic message when the API does not return JSON.
        }
        trackEvent('account_deletion_blocked', {
          block_reason: getAccountDeletionBlockReason(message),
        })
        throw new Error(message)
      }

      trackEvent('account_deletion_completed')
      toast.success('Account deleted')
      await logout()
      navigate('/auth/login', { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete account'
      setDeleteError(message)
      toast.error(message)
      logger.error('Account deletion failed', { error })
    } finally {
      setIsDeletingAccount(false)
    }
  }

  // Loading state
  if (!user) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader
          title="Profile Settings"
          description="Manage your account information and preferences"
          breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Profile' }]}
        />
        <SkeletonCard bodyLines={4} />
        <SkeletonCard bodyLines={4} />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Profile Settings"
        description="Manage your account information and preferences"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Profile' }]}
      />

      {/* Profile Information Card */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Profile Information</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter your name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" value={user.email || ''} disabled />
                <p className="text-sm text-muted-foreground">
                  Email changes require verification. Contact support to change
                  your email.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-role">Role</Label>
                <Input
                  id="profile-role"
                  value={formatRoleLabel(userRole)}
                  disabled
                />
                <p className="text-sm text-muted-foreground">
                  Your role determines your access level
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isUpdatingProfile}>
                  {isUpdatingProfile && <Spinner size="sm" className="mr-2" />}
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => profileForm.reset()}
                  disabled={isUpdatingProfile}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Password Change Card */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPasswordIdentity ? (
            <p className="text-sm text-muted-foreground">
              You signed in with a social provider (such as Google), so there's
              no password on this account to change here. Manage your password
              through your connected identity provider.
            </p>
          ) : (
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="space-y-4"
                noValidate
              >
                {/* Hidden username field --- password managers need a visible email field */}
                <input
                  type="email"
                  name="username"
                  value={user?.email || ''}
                  readOnly
                  autoComplete="username"
                  aria-hidden="true"
                  tabIndex={-1}
                  className="sr-only"
                />
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Current Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Enter current password"
                          autoComplete="current-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>New Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Enter new password"
                          autoComplete="new-password"
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">
                        Must be at least 8 characters with uppercase, lowercase,
                        and number
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword && (
                      <Spinner size="sm" className="mr-2" />
                    )}
                    Change Password
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => passwordForm.reset()}
                    disabled={isChangingPassword}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Linked Accounts Card */}
      <LinkedAccounts />

      {/* Account Deletion Card */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle as="h2">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account. We keep your tenant history, audit
            logs, and final reconciliation records for compliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError ? (
            <Alert variant="destructive">
              <AlertTitle>Account cannot be deleted</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              aria-required="true"
            />
            <p className="text-sm text-muted-foreground">
              Organization owners, tenant portal users, and accounts tied to
              audit history may need support-assisted deletion.
            </p>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={onDeleteAccount}
            disabled={isDeletingAccount || deleteConfirmation !== 'DELETE'}
          >
            {isDeletingAccount ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
