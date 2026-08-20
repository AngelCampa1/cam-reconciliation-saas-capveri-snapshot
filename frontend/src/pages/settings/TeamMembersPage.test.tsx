import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamMembersPage } from './TeamMembersPage'

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }))
vi.mock('@/lib/analytics', () => ({
  trackEvent: mockTrackEvent,
}))

const mockUpdateRole = vi.fn()
const mockRemoveMember = vi.fn()
const mockCreateInvitation = vi.fn()
const mockRevokeInvitation = vi.fn()
const mockRefetchMembers = vi.fn()
const mockRefetchInvitations = vi.fn()

// Mutable auth state shared with the hoisted vi.mock factory below. Using
// vi.hoisted() ensures the object exists before the mock factory runs (vi.mock
// is hoisted to the top of the module), so individual tests can flip isAdmin.
const authState = vi.hoisted(() => ({ isAdmin: true }))

// Mutable members state — tests that need a custom member list can swap this.
const membersState = vi.hoisted(() => ({
  data: null as Array<{
    id: string
    email: string
    full_name: string
    role: string
    created_at: string
    updated_at: string
    is_current_user: boolean
  }> | null,
}))

// Mutable paused state — the offline regression test flips these to true.
const pausedState = vi.hoisted(() => ({
  members: false,
  invitations: false,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: authState.isAdmin }),
}))

vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  ),
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span>Loading</span>,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const members = [
  {
    id: 'member-current',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    is_current_user: true,
  },
  {
    id: 'member-viewer',
    email: 'analyst@example.com',
    full_name: 'Analyst User',
    role: 'viewer',
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
    is_current_user: false,
  },
  {
    id: 'member-owner',
    email: 'owner@example.com',
    full_name: 'Owner User',
    role: 'owner',
    created_at: '2024-12-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    is_current_user: false,
  },
]

const invitations = [
  {
    id: 'invite-1',
    email: 'pending@example.com',
    role: 'member',
    token: 'token',
    organization_id: 'org-1',
    invited_by: 'member-current',
    expires_at: '2099-01-01T00:00:00Z',
    used_at: null,
    revoked_at: null,
    created_at: '2025-03-01T00:00:00Z',
  },
]

vi.mock('@/hooks/use-team-invitations', () => ({
  useTeamMembers: () => ({
    data: pausedState.members ? undefined : (membersState.data ?? members),
    isLoading: false,
    error: null,
    isPaused: pausedState.members,
    refetch: mockRefetchMembers,
  }),
  useUpdateTeamMemberRole: () => ({
    mutateAsync: mockUpdateRole,
    isPending: false,
  }),
  useRemoveTeamMember: () => ({
    mutateAsync: mockRemoveMember,
    isPending: false,
  }),
  useTeamInvitations: () => ({
    data: pausedState.invitations ? undefined : invitations,
    isLoading: false,
    error: null,
    isPaused: pausedState.invitations,
    refetch: mockRefetchInvitations,
  }),
  useCreateTeamInvitation: () => ({
    mutateAsync: mockCreateInvitation,
    isPending: false,
  }),
  useRevokeTeamInvitation: () => ({
    mutateAsync: mockRevokeInvitation,
    isPending: false,
  }),
}))

describe('TeamMembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isAdmin = true
    membersState.data = null
    pausedState.members = false
    pausedState.invitations = false
    mockUpdateRole.mockResolvedValue({})
    mockRemoveMember.mockResolvedValue({})
    mockCreateInvitation.mockResolvedValue({})
    mockRevokeInvitation.mockResolvedValue({})
  })

  it('renders current members and pending invitations', () => {
    render(<TeamMembersPage />)

    expect(screen.getByText('Current Members')).toBeInTheDocument()
    expect(screen.getByText('Admin User')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('Analyst User')).toBeInTheDocument()
    expect(screen.getByText('analyst@example.com')).toBeInTheDocument()
    expect(screen.getByText('Pending Invitations')).toBeInTheDocument()
    expect(screen.getByText('pending@example.com')).toBeInTheDocument()
  })

  it('labels each revoke-invitation button with the specific invitee email', () => {
    render(<TeamMembersPage />)

    // A generic "Revoke invitation" label is ambiguous when several
    // invitations are listed; the accessible name must name the invitee so
    // keyboard/screen-reader admins know which row they are acting on.
    expect(
      screen.getByRole('button', {
        name: 'Revoke invitation for pending@example.com',
      })
    ).toBeInTheDocument()
  })

  it('updates a manageable member role', async () => {
    const user = userEvent.setup()
    render(<TeamMembersPage />)

    const analystRow = screen.getByText('Analyst User').closest('tr')
    expect(analystRow).not.toBeNull()

    const roleSelect = within(analystRow as HTMLTableRowElement).getByRole(
      'combobox'
    )
    await user.click(roleSelect)
    await user.click(screen.getByRole('option', { name: /^Admin/ }))

    expect(mockUpdateRole).toHaveBeenCalledWith({
      memberId: 'member-viewer',
      role: 'admin',
    })
  })

  it('removes a manageable member after confirmation', async () => {
    const user = userEvent.setup()
    render(<TeamMembersPage />)

    const analystRow = screen.getByText('Analyst User').closest('tr')
    expect(analystRow).not.toBeNull()

    await user.click(
      within(analystRow as HTMLTableRowElement).getByRole('button', {
        name: /remove member/i,
      })
    )
    await user.click(screen.getByRole('button', { name: /^Remove$/ }))

    expect(mockRemoveMember).toHaveBeenCalledWith('member-viewer')
  })

  it('does not expose management actions for the current user or owner', () => {
    render(<TeamMembersPage />)

    const currentUserRow = screen.getByText('Admin User').closest('tr')
    const ownerRow = screen.getByText('Owner User').closest('tr')
    expect(currentUserRow).not.toBeNull()
    expect(ownerRow).not.toBeNull()

    expect(
      within(currentUserRow as HTMLTableRowElement).queryByRole('combobox')
    ).not.toBeInTheDocument()
    expect(
      within(ownerRow as HTMLTableRowElement).queryByRole('button', {
        name: /remove member/i,
      })
    ).not.toBeInTheDocument()
  })

  it('shows email exactly once per member when each member has a full_name (F-192)', () => {
    // When full_name is set: the primary cell shows name, the secondary line shows email.
    // The email must NOT appear a second time anywhere else.
    render(<TeamMembersPage />)

    const adminEmails = screen.getAllByText('admin@example.com')
    expect(adminEmails).toHaveLength(1)

    const analystEmails = screen.getAllByText('analyst@example.com')
    expect(analystEmails).toHaveLength(1)
  })

  it('shows email exactly once when member has no full_name — email not duplicated (F-192)', () => {
    membersState.data = [
      {
        id: 'member-noname',
        email: 'noname@example.com',
        full_name: '',
        role: 'viewer',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        is_current_user: false,
      },
    ]
    render(<TeamMembersPage />)

    // The primary cell shows the email (because full_name is empty).
    // The secondary line is hidden (full_name is falsy) — email must NOT repeat.
    const emailInstances = screen.getAllByText('noname@example.com')
    expect(emailInstances).toHaveLength(1)
  })

  it('shows name above email when member has full_name (F-192)', () => {
    render(<TeamMembersPage />)

    // Admin User row: full_name in primary cell, email in secondary
    const adminRow = screen.getByText('Admin User').closest('tr')
    expect(adminRow).not.toBeNull()
    const cells = (adminRow as HTMLTableRowElement).querySelectorAll('td')
    // First data cell contains the name/email stack
    const nameCell = cells[0]
    expect(nameCell.textContent).toContain('Admin User')
    expect(nameCell.textContent).toContain('admin@example.com')
    // Name must appear before email in DOM order
    const namePos = nameCell.innerHTML.indexOf('Admin User')
    const emailPos = nameCell.innerHTML.indexOf('admin@example.com')
    expect(namePos).toBeLessThan(emailPos)
  })

  it('shows an admins-only notice and no team data for non-admins', () => {
    authState.isAdmin = false
    render(<TeamMembersPage />)

    expect(screen.getByText('Admins only')).toBeInTheDocument()
    // Member table and pending invitations must not render for non-admins.
    expect(screen.queryByText('Current Members')).not.toBeInTheDocument()
    expect(screen.queryByText('Analyst User')).not.toBeInTheDocument()
    expect(screen.queryByText('Pending Invitations')).not.toBeInTheDocument()
    // The admin-only data-fetch errors must not surface as a page error either.
    expect(
      screen.queryByText("Couldn't load your team")
    ).not.toBeInTheDocument()
  })

  it('shows an offline notice instead of empty states when the team queries are paused', () => {
    pausedState.members = true
    pausedState.invitations = true
    render(<TeamMembersPage />)

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/no members yet/i)).not.toBeInTheDocument()
  })

  describe('Analytics events', () => {
    it('fires team_invite_sent with role on successful invite', async () => {
      const user = userEvent.setup()
      render(<TeamMembersPage />)

      await user.click(
        screen.getByRole('button', { name: /invite team member/i })
      )
      await user.clear(screen.getByPlaceholderText('colleague@company.com'))
      await user.type(
        screen.getByPlaceholderText('colleague@company.com'),
        'new@example.com'
      )
      await user.click(screen.getByRole('button', { name: /send invitation/i }))

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('team_invite_sent', {
          role: 'member',
        })
      })
    })

    it('fires team_invite_revoked with role on successful revoke', async () => {
      const user = userEvent.setup()
      render(<TeamMembersPage />)

      await user.click(
        screen.getByRole('button', {
          name: 'Revoke invitation for pending@example.com',
        })
      )
      await user.click(screen.getByRole('button', { name: /^Revoke$/ }))

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('team_invite_revoked', {
          role: 'member',
        })
      })
    })

    it('fires team_member_removed with removed_role on successful removal', async () => {
      const user = userEvent.setup()
      render(<TeamMembersPage />)

      const analystRow = screen.getByText('Analyst User').closest('tr')
      await user.click(
        within(analystRow as HTMLTableRowElement).getByRole('button', {
          name: /remove member/i,
        })
      )
      await user.click(screen.getByRole('button', { name: /^Remove$/ }))

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('team_member_removed', {
          removed_role: 'viewer',
        })
      })
    })

    it('fires team_member_role_changed with previous and new role on role change', async () => {
      const user = userEvent.setup()
      render(<TeamMembersPage />)

      const analystRow = screen.getByText('Analyst User').closest('tr')
      const roleSelect = within(analystRow as HTMLTableRowElement).getByRole(
        'combobox'
      )
      await user.click(roleSelect)
      await user.click(screen.getByRole('option', { name: /^Admin/ }))

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'team_member_role_changed',
          {
            previous_role: 'viewer',
            new_role: 'admin',
          }
        )
      })
    })
  })
})
