/**
 * Organization Settings Page
 *
 * Allows organization admins to view and edit organization settings,
 * view subscription status, and monitor usage statistics.
 */
import { useState } from 'react'
import { formatCalendarDate } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { Copy, Check } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'
import {
  useOrganization,
  useUpdateOrganization,
} from '@/hooks/use-organization'
import { useSubscription } from '@/hooks/use-subscription'
import {
  getSubscriptionStatusVariant,
  formatSubscriptionStatus,
} from '@/lib/subscription-status'
import { useOrganizationUsage } from '@/hooks/use-organization-usage'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { SkeletonCard } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'

// Organization schema
const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
})

type OrganizationFormData = z.infer<typeof organizationSchema>

/**
 * OrganizationPage Component
 *
 * Displays organization settings with admin-only edit capabilities,
 * subscription status, and usage statistics.
 */
export function OrganizationPage() {
  // Only OWNER can update organization settings. This mirrors the database RLS
  // policy ("Owners can update organizations"), which rejects UPDATEs from any
  // non-owner role. Gating on admin||owner here would show ADMINs an editable
  // form whose save silently fails at the database layer. We consume the
  // context-computed `isOwner` directly rather than re-deriving the role check
  // from the role string locally, keeping a single source of truth.
  // See docs/architecture/rbac-permissions.md ("Update organization settings").
  const { user, isOwner } = useAuth()
  const [isUpdating, setIsUpdating] = useState(false)
  const [copiedOrgId, setCopiedOrgId] = useState(false)

  const handleCopyOrgId = () => {
    if (!organization?.id || !navigator.clipboard) return
    void navigator.clipboard
      .writeText(organization.id)
      .then(() => {
        setCopiedOrgId(true)
        setTimeout(() => setCopiedOrgId(false), 2000)
      })
      .catch(() => {
        toast.error('Failed to copy to clipboard')
      })
  }

  // Fetch real data using hooks
  const {
    data: organization,
    isLoading: isOrgLoading,
    error: orgError,
    refetch: refetchOrg,
  } = useOrganization()
  const {
    data: subscription,
    isLoading: isSubLoading,
    isError: isSubError,
    refetch: refetchSub,
  } = useSubscription()
  const {
    data: usage,
    isLoading: isUsageLoading,
    isError: isUsageError,
    refetch: refetchUsage,
  } = useOrganizationUsage()
  const updateOrgMutation = useUpdateOrganization()

  // Combine loading states
  const isDataLoading = isOrgLoading || isSubLoading || isUsageLoading

  // Organization form
  const form = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    ...(organization && { values: { name: organization.name } }),
  })

  // Handle organization update
  const onSubmit = async (formData: OrganizationFormData) => {
    setIsUpdating(true)
    try {
      await updateOrgMutation.mutateAsync({ name: formData.name })
      trackEvent('organization_update_completed')
      toast.success('Organization updated successfully')
    } catch (error) {
      toast.error('Failed to update organization. Please try again.')
      logger.error('Organization update failed', { error })
    } finally {
      setIsUpdating(false)
    }
  }

  // Loading state
  if (!user || isDataLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader
          title="Organization Settings"
          description="Manage your organization and subscription"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Organization' },
          ]}
        />
        <SkeletonCard bodyLines={4} />
        <SkeletonCard bodyLines={4} />
        <SkeletonCard bodyLines={4} />
      </div>
    )
  }

  // Error state --- F-133: inline error keeps the app shell intact instead of
  // escalating to the global ErrorBoundary. Also guard !organization so the
  // TS compiler knows organization is non-null past this point.
  if (orgError || !organization) {
    return (
      <div className="flex h-screen items-center justify-center">
        <ErrorState
          title="Couldn't load your organization"
          description="This might be a temporary problem."
          action={{ onClick: () => void refetchOrg() }}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization and subscription"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Organization' }]}
      />

      {/* Organization Details Card */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Organization Details</CardTitle>
          <CardDescription>
            {isOwner
              ? 'Update your organization information'
              : 'View your organization information'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Organization Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={!isOwner}
                        placeholder="Enter organization name"
                      />
                    </FormControl>
                    <FormMessage />
                    {!isOwner && (
                      <p className="text-sm text-muted-foreground">
                        Only the organization owner can edit organization
                        settings
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* Not a form field: this is a read-only display of the org id.
                  Use a plain Label tied to the input by id so the value is
                  announced as "Support ID" (a FormLabel here would emit an
                  htmlFor pointing at a non-existent form-item id). */}
              <div className="space-y-2">
                <Label htmlFor="support-id">Support ID</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="support-id"
                    value={organization.id}
                    disabled
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyOrgId}
                    className="rounded-full shrink-0"
                    title={copiedOrgId ? 'Copied!' : 'Copy to clipboard'}
                    aria-label={
                      copiedOrgId ? 'Copied!' : 'Copy Support ID to clipboard'
                    }
                  >
                    {copiedOrgId ? (
                      <Check
                        className="h-4 w-4 text-success"
                        aria-hidden="true"
                      />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share this with our team when you ask for help.
                </p>
              </div>

              {isOwner && (
                <div className="flex gap-2">
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating && <Spinner size="sm" className="mr-2" />}
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.reset()}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Subscription Status Card */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Subscription Status</CardTitle>
          <CardDescription>Your current plan and usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <div className="mt-1">
                  <Badge
                    variant={getSubscriptionStatusVariant(subscription.status)}
                  >
                    {formatSubscriptionStatus(subscription.status)}
                  </Badge>
                </div>
              </div>
              {subscription.status === 'trialing' && (
                <div className="text-right">
                  <p className="text-sm font-medium">Trial Ends</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCalendarDate(subscription.current_period_end)}
                  </p>
                </div>
              )}
            </div>
          ) : isSubError ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
              <span>We couldn't load your subscription status.</span>
              <Button variant="outline" size="sm" onClick={() => refetchSub()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No active subscription
            </div>
          )}

          {/* Usage load failed — say so instead of hiding the section */}
          {isUsageError && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
              <span>We couldn't load your usage details.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchUsage()}
              >
                Try again
              </Button>
            </div>
          )}

          {/* Usage Statistics */}
          {usage && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Users</p>
                  <p className="text-sm text-muted-foreground">
                    {formatUsageLimit(usage.usersUsed, usage.usersLimit)}
                  </p>
                </div>
                {usage.usersLimit !== -1 && (
                  <Progress
                    value={(usage.usersUsed / usage.usersLimit) * 100}
                    label="Users usage"
                  />
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Properties</p>
                  <p className="text-sm text-muted-foreground">
                    {formatUsageLimit(
                      usage.propertiesUsed,
                      usage.propertiesLimit
                    )}
                  </p>
                </div>
                {usage.propertiesLimit !== -1 && (
                  <Progress
                    value={(usage.propertiesUsed / usage.propertiesLimit) * 100}
                    label="Properties usage"
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatUsageLimit(current: number, limit: number): string {
  return `${current} / ${limit === -1 ? 'Unlimited' : limit}`
}
