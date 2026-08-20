/**
 * Team Members Settings Page
 *
 * Allows organization admins to manage team members:
 * - View current team members
 * - View pending invitations
 * - Invite new team members
 * - Revoke pending invitations
 */
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/errors'
import { Plus, Mail, Clock, X, Users, UserCheck, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useViewport } from '@/hooks/useViewport'
import { logger } from '@/lib/logger'
import { trackEvent } from '@/lib/analytics'
import { formatTimestampDate } from '@/lib/utils'
import {
  useTeamMembers,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
  useTeamInvitations,
  useCreateTeamInvitation,
  useRevokeTeamInvitation,
  type TeamRole,
  type AssignableTeamRole,
  type TeamMember,
  type TeamInvitation,
} from '@/hooks/use-team-invitations'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'

// Invitation form schema
const invitationSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['admin', 'member', 'viewer'] as const),
})

type InvitationFormData = z.infer<typeof invitationSchema>

// Role display configuration
const roleConfig: Record<
  TeamRole,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  owner: { label: 'Owner', variant: 'default' },
  admin: { label: 'Admin', variant: 'default' },
  member: { label: 'Member', variant: 'secondary' },
  viewer: { label: 'Viewer', variant: 'outline' },
}

const manageableRoles: AssignableTeamRole[] = ['admin', 'member', 'viewer']

/**
 * Check if invitation is expired
 */
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

/**
 * TeamMembersPage Component
 */
export function TeamMembersPage() {
  const { isAdmin } = useAuth()
  const { isMobile } = useViewport()
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<TeamInvitation | null>(null)
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)

  // The team member/invitation endpoints are admin-only. Gate the queries on
  // isAdmin so non-admin members/viewers don't fire requests that would 403 and
  // render as a scary full-screen error --- they get a clean "admins only" notice
  // instead (early return below).
  const {
    data: members,
    isLoading: isLoadingMembers,
    error: membersError,
    isPaused: isMembersPaused,
    refetch: refetchMembers,
  } = useTeamMembers({ enabled: isAdmin })

  const {
    data: invitations,
    isLoading: isLoadingInvitations,
    error: invitationsError,
    isPaused: isInvitationsPaused,
    refetch: refetchInvitations,
  } = useTeamInvitations(false, { enabled: isAdmin })

  // A paused fetch (unreachable backend) leaves error null + data undefined, so
  // without this the "No members yet" / "No pending invitations" empty states
  // below would lie. One guard covers both queries.
  const isOffline =
    (isMembersPaused && !members) || (isInvitationsPaused && !invitations)

  // Mutations
  const updateMemberRole = useUpdateTeamMemberRole()
  const removeMember = useRemoveTeamMember()
  const createInvitation = useCreateTeamInvitation()
  const revokeInvitation = useRevokeTeamInvitation()

  // Invitation form
  const form = useForm<InvitationFormData>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: '',
      role: 'member',
    },
  })

  // Handle invitation submit
  const onSubmitInvitation = async (data: InvitationFormData) => {
    try {
      await createInvitation.mutateAsync(data)
      trackEvent('team_invite_sent', { role: data.role })
      toast.success(`Invitation sent to ${data.email}`)
      setIsInviteOpen(false)
      form.reset()
    } catch (error) {
      toast.error('Failed to send the invitation', {
        description: getErrorMessage(error),
      })
      logger.error('Failed to create invitation', { error, data })
    }
  }

  // Handle revoke
  const handleRevoke = async () => {
    if (!revokeTarget) return

    try {
      await revokeInvitation.mutateAsync(revokeTarget.id)
      trackEvent('team_invite_revoked', { role: revokeTarget.role })
      toast.success('Invitation revoked')
      setRevokeTarget(null)
    } catch (error) {
      toast.error('Failed to revoke invitation')
      logger.error('Failed to revoke invitation', {
        error,
        id: revokeTarget.id,
      })
    }
  }

  const handleRoleChange = async (
    member: TeamMember,
    role: AssignableTeamRole
  ) => {
    try {
      await updateMemberRole.mutateAsync({ memberId: member.id, role })
      trackEvent('team_member_role_changed', {
        previous_role: member.role,
        new_role: role,
      })
      toast.success(`${member.full_name || member.email} role updated`)
    } catch (error) {
      toast.error('Failed to update team member role')
      logger.error('Failed to update team member role', {
        error,
        id: member.id,
        role,
      })
    }
  }

  const handleRemoveMember = async () => {
    if (!removeTarget) return

    try {
      await removeMember.mutateAsync(removeTarget.id)
      trackEvent('team_member_removed', { removed_role: removeTarget.role })
      toast.success('Team member removed')
      setRemoveTarget(null)
    } catch (error) {
      toast.error('Failed to remove team member')
      logger.error('Failed to remove team member', {
        error,
        id: removeTarget.id,
      })
    }
  }

  // Filter pending invitations (not used, not revoked, not expired)
  const pendingInvitations =
    invitations?.filter(
      (inv) => !inv.used_at && !inv.revoked_at && !isExpired(inv.expires_at)
    ) || []

  // Non-admins cannot access the admin-only team endpoints. Show a clear
  // "admins only" notice instead of firing requests that 403 into an error.
  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader
          title="Team Members"
          description="Manage your organization's team members and invitations"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Team Members' },
          ]}
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users
              className="mb-4 h-12 w-12 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Admins only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Only organization administrators can view and manage team members
              and invitations.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (isLoadingMembers || isLoadingInvitations) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader
          title="Team Members"
          description="Manage your organization's team members and invitations"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Team Members' },
          ]}
        />
        <Card>
          <CardContent className="pt-6">
            <DataTableSkeleton columnCount={4} rowCount={4} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <DataTableSkeleton columnCount={4} rowCount={3} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error / Offline state
  if (membersError || invitationsError || isOffline) {
    return (
      <div className="flex h-screen items-center justify-center">
        <ErrorState
          title="Couldn't load your team"
          description="Something went wrong on our end."
          offline={isOffline}
          action={{
            onClick: () => {
              refetchMembers()
              refetchInvitations()
            },
          }}
        />
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Team Members"
        description="Manage your organization's team members and invitations"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Team Members' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" aria-hidden="true" />
            Current Members
          </CardTitle>
          <CardDescription>
            Active users with access to your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!members || members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members yet"
              description="Invite a teammate to add them here."
            />
          ) : isMobile ? (
            <div className="space-y-3" data-testid="member-cards">
              {members.map((member) => {
                const canManage =
                  isAdmin && !member.is_current_user && member.role !== 'owner'
                return (
                  <div
                    key={member.id}
                    className="rounded-lg border p-4"
                    data-testid="member-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          {member.full_name || member.email}
                          {member.is_current_user && (
                            <Badge variant="outline">You</Badge>
                          )}
                        </div>
                        {member.full_name && (
                          <div className="text-sm text-muted-foreground">
                            {member.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div>
                        {canManage ? (
                          <Select
                            value={member.role}
                            disabled={updateMemberRole.isPending}
                            onValueChange={(role) =>
                              handleRoleChange(
                                member,
                                role as AssignableTeamRole
                              )
                            }
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`Change role for ${
                                member.full_name || member.email
                              }`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {manageableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleConfig[role].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={roleConfig[member.role].variant}>
                            {roleConfig[member.role].label}
                          </Badge>
                        )}
                        <div className="mt-1 text-xs text-muted-foreground">
                          Joined {formatTimestampDate(member.created_at)}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="mt-3 flex items-center justify-end border-t pt-3">
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget(member)}
                            aria-label={`Remove member ${
                              member.full_name || member.email
                            }`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Protected
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <Table aria-label="Current members">
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {isAdmin && (
                    <TableHead className="w-[120px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const canManage =
                    isAdmin &&
                    !member.is_current_user &&
                    member.role !== 'owner'
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-medium">
                            {member.full_name || member.email}
                            {member.is_current_user && (
                              <Badge variant="outline">You</Badge>
                            )}
                          </div>
                          {member.full_name && (
                            <div className="text-sm text-muted-foreground">
                              {member.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={member.role}
                            disabled={updateMemberRole.isPending}
                            onValueChange={(role) =>
                              handleRoleChange(
                                member,
                                role as AssignableTeamRole
                              )
                            }
                          >
                            <SelectTrigger
                              className="w-[140px]"
                              aria-label={`Change role for ${
                                member.full_name || member.email
                              }`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {manageableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleConfig[role].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={roleConfig[member.role].variant}>
                            {roleConfig[member.role].label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {formatTimestampDate(member.created_at)}
                        </span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {canManage ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveTarget(member)}
                              aria-label={`Remove member ${
                                member.full_name || member.email
                              }`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Protected
                            </span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Card */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Mail className="h-5 w-5" aria-hidden="true" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Invitations that haven't been accepted yet
            </CardDescription>
          </div>
          {isAdmin && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Invite Team Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your organization
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmitInvitation)}
                    className="space-y-4"
                    noValidate
                  >
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Email</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              placeholder="colleague@company.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="admin">
                                Admin - Full access to all features
                              </SelectItem>
                              <SelectItem value="member">
                                Member - Standard access
                              </SelectItem>
                              <SelectItem value="viewer">
                                Viewer - Read-only access
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInviteOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createInvitation.isPending}
                      >
                        {createInvitation.isPending && (
                          <Spinner size="sm" className="mr-2" />
                        )}
                        Send Invitation
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No pending invitations"
              description="Invite a teammate to see pending invitations here."
            />
          ) : isMobile ? (
            <div className="space-y-3" data-testid="invitation-cards">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="rounded-lg border p-4"
                  data-testid="invitation-card"
                >
                  <div className="font-medium">{invitation.email}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={roleConfig[invitation.role].variant}>
                      {roleConfig[invitation.role].label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Expires {formatTimestampDate(invitation.expires_at)}
                  </div>
                  {isAdmin && (
                    <div className="mt-3 flex items-center justify-end border-t pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevokeTarget(invitation)}
                        aria-label={`Revoke invitation for ${invitation.email}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Table aria-label="Pending invitations">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  {isAdmin && (
                    <TableHead className="w-[100px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">
                      {invitation.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleConfig[invitation.role].variant}>
                        {roleConfig[invitation.role].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatTimestampDate(invitation.expires_at)}
                      </span>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokeTarget(invitation)}
                          aria-label={`Revoke invitation for ${invitation.email}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={() => setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation for{' '}
              <strong>{revokeTarget?.email}</strong>? They will no longer be
              able to use this invitation link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {revokeInvitation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={() => setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{removeTarget?.full_name || removeTarget?.email}</strong>{' '}
              from this organization? Their account will no longer have access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {removeMember.isPending && <Spinner size="sm" className="mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
