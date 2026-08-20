/**
 * EmailPreferences Component
 *
 * Allows tenant users to manage their email notification preferences.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getEmailPreferencesApiV1TenantNotificationsPreferencesGet,
  updateEmailPreferencesApiV1TenantNotificationsPreferencesPut,
} from '@/api/generated/sdk.gen'
import { apiClient } from '@/api/client'
import type { TenantEmailPreferences } from '@/api/generated/types.gen'
import { Switch } from '@/components/ui/switch'
import { ErrorState } from '@/components/ErrorState'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

export function EmailPreferences() {
  const queryClient = useQueryClient()

  const {
    data: prefs,
    isLoading,
    isPaused,
    error,
    refetch,
  } = useQuery<TenantEmailPreferences>({
    queryKey: ['tenant-email-preferences'],
    retry: 1,
    queryFn: async () => {
      const response =
        await getEmailPreferencesApiV1TenantNotificationsPreferencesGet({
          client: apiClient,
        })

      if (response.error || !response.data) {
        throw new Error('Failed to fetch email preferences')
      }

      return response.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (
      updates: Partial<
        Omit<TenantEmailPreferences, 'tenant_user_id' | 'updated_at'>
      >
    ) => {
      const response =
        await updateEmailPreferencesApiV1TenantNotificationsPreferencesPut({
          client: apiClient,
          body: updates,
        })

      if (response.error || !response.data) {
        throw new Error('Failed to update email preferences')
      }

      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-email-preferences'] })
      toast.success('Preferences saved')
    },
    onError: () => {
      toast.error('Failed to update email preferences. Please try again.')
    },
  })

  // A paused fetch (networkMode 'online' + unreachable backend) leaves error
  // null and isLoading false; without this guard the `isLoading || !prefs`
  // branch below would spin forever. Surface it as a retryable load failure.
  if (error || (isPaused && !prefs)) {
    return (
      <ErrorState
        size="sm"
        title="Couldn't load email preferences"
        offline={isPaused && !prefs}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  if (isLoading || !prefs) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="md" />
      </div>
    )
  }

  const togglePreference = (
    key: keyof Omit<TenantEmailPreferences, 'tenant_user_id' | 'updated_at'>
  ) => {
    updateMutation.mutate({ [key]: !prefs[key] })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b transition-colors duration-fast hover:bg-muted/30 px-2 -mx-2 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="new_statement_emails" className="text-base">
              New Statement Notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive an email when a new CAM statement is available
            </p>
          </div>
          <Switch
            id="new_statement_emails"
            checked={prefs.new_statement_emails ?? false}
            onCheckedChange={() => togglePreference('new_statement_emails')}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between py-3 border-b transition-colors duration-fast hover:bg-muted/30 px-2 -mx-2 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="dispute_update_emails" className="text-base">
              Dispute Updates
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive an email when your dispute status changes
            </p>
          </div>
          <Switch
            id="dispute_update_emails"
            checked={prefs.dispute_update_emails ?? false}
            onCheckedChange={() => togglePreference('dispute_update_emails')}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between py-3 border-b transition-colors duration-fast hover:bg-muted/30 px-2 -mx-2 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="reminder_emails" className="text-base">
              Payment Reminders
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive reminder emails for pending statements
            </p>
          </div>
          <Switch
            id="reminder_emails"
            checked={prefs.reminder_emails ?? false}
            onCheckedChange={() => togglePreference('reminder_emails')}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-center justify-between py-3 transition-colors duration-fast hover:bg-muted/30 px-2 -mx-2 rounded-md">
          <div className="space-y-0.5">
            <Label htmlFor="marketing_emails" className="text-base">
              Marketing Emails
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive updates about new features and improvements
            </p>
          </div>
          <Switch
            id="marketing_emails"
            checked={prefs.marketing_emails ?? false}
            onCheckedChange={() => togglePreference('marketing_emails')}
            disabled={updateMutation.isPending}
          />
        </div>
      </div>
    </div>
  )
}
