import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TeamSignupPage } from './TeamSignupPage'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      setSession: vi.fn(),
    },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
    useSearchParams: vi.fn(),
  }
})

const TOKEN = '12345678901234567890123456789012'

function renderTeamSignup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TeamSignupPage />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

describe('TeamSignupPage', () => {
  const navigate = vi.fn()
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useNavigate).mockReturnValue(navigate)
    vi.mocked(useSearchParams).mockReturnValue([
      new URLSearchParams({ token: TOKEN }),
      vi.fn(),
    ])
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/team/invitations/accept')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.includes(`/api/v1/team/invitations/${TOKEN}/validate`)) {
        return new Response(
          JSON.stringify({
            valid: true,
            email: 'member@example.com',
            organization_name: 'CapVeri',
            role: 'member',
          }),
          { status: 200 }
        )
      }
      return new Response('{}', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('accepts an invite before redirecting an existing session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
          user: { id: 'user-123' },
        },
      },
    })

    renderTeamSignup()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/team/invitations/accept'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer session-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ token: TOKEN, user_id: 'user-123' }),
        })
      )
    })
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('keeps the invite token in the sign-in return URL', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    })

    renderTeamSignup()

    const link = await screen.findByRole('link', { name: 'Sign in' })
    const href = new URL(link.getAttribute('href')!, 'https://app.test')

    expect(href.pathname).toBe('/auth/login')
    expect(href.searchParams.get('returnUrl')).toBe(
      `/team/signup?token=${TOKEN}`
    )
  })
})
