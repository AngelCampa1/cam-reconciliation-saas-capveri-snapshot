/**
 * React Query Hooks for Team Member Invitations
 *
 * Provides typed hooks for managing team invitations:
 * - Listing current members and pending invitations (admin)
 * - Creating new invitations (admin)
 * - Revoking invitations (admin)
 * - Validating invitation tokens (public)
 * - Completing signup with invitation (public)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'
export type AssignableTeamRole = Exclude<TeamRole, 'owner'>

export interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: TeamRole
  created_at: string
  updated_at: string
  is_current_user: boolean
}

export interface TeamInvitation {
  id: string
  email: string
  role: TeamRole
  token: string
  organization_id: string
  invited_by: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface TeamInvitationValidation {
  valid: boolean
  email?: string
  organization_name?: string
  role?: TeamRole
  expires_at?: string
  error_reason?: 'expired' | 'used' | 'revoked' | 'not_found'
}

export interface CreateTeamInvitationRequest {
  email: string
  role: AssignableTeamRole
}

export interface UpdateTeamMemberRoleRequest {
  memberId: string
  role: AssignableTeamRole
}

export interface TeamSignupRequest {
  token: string
  password: string
  full_name: string
  accepted_terms: boolean
  terms_version: string
  terms_hash: string
}

export interface TeamSignupResponse {
  success: boolean
  user_id: string
  access_token: string
  refresh_token: string
  user: {
    id: string
    email: string
    role: string
    organization_id: string
    full_name: string
  }
}

/**
 * Query key factory for team invitations
 */
export const teamInvitationKeys = {
  all: ['team-invitations'] as const,
  members: () => [...teamInvitationKeys.all, 'members'] as const,
  lists: () => [...teamInvitationKeys.all, 'list'] as const,
  list: (includeUsed: boolean) =>
    [...teamInvitationKeys.lists(), { includeUsed }] as const,
  validation: (token: string) =>
    [...teamInvitationKeys.all, 'validate', token] as const,
}

/**
 * Fetch current organization members.
 * Admin-only endpoint --- the backend GET /team/members requires an org admin,
 * so callers should pass `{ enabled: isAdmin }` to avoid firing a request that
 * would 403 for non-admin members/viewers (which would otherwise surface as a
 * page-level error).
 */
export function useTeamMembers(options?: { enabled?: boolean }) {
  return useQuery<TeamMember[]>({
    queryKey: teamInvitationKeys.members(),
    enabled: options?.enabled ?? true,
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
    queryFn: async () => {
      const headers = await getAuthHeader()

      const res = await fetch(resolveApiUrl('/api/v1/team/members'), {
        headers,
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch team members: ${res.statusText}`)
      }

      return res.json()
    },
  })
}

/**
 * Update a current team member's role.
 * Admin-only endpoint.
 */
export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient()

  return useMutation<TeamMember, Error, UpdateTeamMemberRoleRequest>({
    mutationFn: async ({ memberId, role }) => {
      const headers = await getAuthHeader()

      const res = await fetch(
        resolveApiUrl(`/api/v1/team/members/${memberId}`),
        {
          method: 'PATCH',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        }
      )

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to update team member role')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamInvitationKeys.members() })
    },
  })
}

/**
 * Remove a current team member from the organization.
 * Admin-only endpoint.
 */
export function useRemoveTeamMember() {
  const queryClient = useQueryClient()

  return useMutation<{ status: string; member_id: string }, Error, string>({
    mutationFn: async (memberId) => {
      const headers = await getAuthHeader()

      const res = await fetch(
        resolveApiUrl(`/api/v1/team/members/${memberId}`),
        {
          method: 'DELETE',
          headers,
        }
      )

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.detail || 'Failed to remove team member')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamInvitationKeys.members() })
    },
  })
}

/**
 * Get authorization header for authenticated requests
 */
async function getAuthHeader(): Promise<{ Authorization: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Authentication required')
  }

  return { Authorization: `Bearer ${session.access_token}` }
}

/**
 * Fetch list of team invitations for the organization.
 * Admin-only endpoint.
 *
 * @param includeUsed - Whether to include already used invitations
 * @param options - Pass `{ enabled: isAdmin }` so non-admins don't fire the
 *   admin-only request (which would 403 and surface as a page-level error).
 */
export function useTeamInvitations(
  includeUsed: boolean = false,
  options?: { enabled?: boolean }
) {
  return useQuery<TeamInvitation[]>({
    queryKey: teamInvitationKeys.list(includeUsed),
    enabled: options?.enabled ?? true,
    // F-133: fail-open soft gate --- keep first-load failures inside query state
    // rather than escalating to the global ErrorBoundary and white-screening.
    throwOnError: false,
    queryFn: async () => {
      const headers = await getAuthHeader()
      const params = new URLSearchParams()
      if (includeUsed) {
        params.set('include_used', 'true')
      }

      const res = await fetch(
        resolveApiUrl(`/api/v1/team/invitations?${params}`),
        {
          headers,
        }
      )

      if (!res.ok) {
        throw new Error(`Failed to fetch invitations: ${res.statusText}`)
      }

      return res.json()
    },
  })
}

/**
 * Create a new team member invitation.
 * Admin-only endpoint.
 */
export function useCreateTeamInvitation() {
  const queryClient = useQueryClient()

  return useMutation<TeamInvitation, Error, CreateTeamInvitationRequest>({
    mutationFn: async (data) => {
      const headers = await getAuthHeader()

      const res = await fetch(resolveApiUrl('/api/v1/team/invitations'), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(error.detail?.message || 'Failed to create invitation')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamInvitationKeys.lists() })
    },
  })
}

/**
 * Revoke a pending team invitation.
 * Admin-only endpoint.
 */
export function useRevokeTeamInvitation() {
  const queryClient = useQueryClient()

  return useMutation<{ status: string; invitation_id: string }, Error, string>({
    mutationFn: async (invitationId) => {
      const headers = await getAuthHeader()

      const res = await fetch(
        resolveApiUrl(`/api/v1/team/invitations/${invitationId}`),
        {
          method: 'DELETE',
          headers,
        }
      )

      if (!res.ok) {
        throw new Error('Failed to revoke invitation')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamInvitationKeys.lists() })
    },
  })
}

/**
 * Validate a team invitation token.
 * Public endpoint - returns 200 for all tokens (non-enumerable).
 *
 * @param token - The invitation token to validate
 */
export function useValidateTeamInvitation(token: string) {
  return useQuery<TeamInvitationValidation>({
    queryKey: teamInvitationKeys.validation(token),
    queryFn: async () => {
      const res = await fetch(
        resolveApiUrl(`/api/v1/team/invitations/${token}/validate`)
      )

      if (!res.ok) {
        throw new Error('Failed to validate invitation')
      }

      return res.json()
    },
    enabled: !!token && token.length >= 32,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  })
}

/**
 * Complete team member signup with invitation token.
 * Public endpoint.
 */
export function useTeamSignup() {
  return useMutation<TeamSignupResponse, Error, TeamSignupRequest>({
    mutationFn: async (data) => {
      const res = await fetch(resolveApiUrl('/api/v1/team/signup'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))

        if (res.status === 410) {
          // Token is invalid (expired, used, revoked, not found)
          throw new Error(
            error.detail?.reason === 'expired'
              ? 'This invitation has expired. Please request a new one.'
              : error.detail?.reason === 'used'
                ? 'This invitation has already been used.'
                : error.detail?.reason === 'revoked'
                  ? 'This invitation has been revoked.'
                  : 'Invalid invitation link.'
          )
        }

        throw new Error(error.detail?.message || 'Failed to complete signup')
      }

      return res.json()
    },
  })
}
