/**
 * Tests for the legacy /onboard/unlock compatibility redirect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PaywallStep } from './PaywallStep'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderPaywall(search = '') {
  render(
    <MemoryRouter initialEntries={[`/onboard/unlock${search}`]}>
      <PaywallStep />
    </MemoryRouter>
  )
}

describe('PaywallStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects legacy /onboard/unlock requests to /checkout', async () => {
    renderPaywall()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/checkout', { replace: true })
    })
  })

  it('preserves legacy plan-selection query params when redirecting', async () => {
    renderPaywall('?tier=portfolio&units=120&buildings=12&billing=annual')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/checkout?tier=portfolio&units=120&buildings=12&billing=annual',
        { replace: true }
      )
    })
  })

  it('drops purchased=true because canonical success now lives at /checkout/success', async () => {
    renderPaywall('?purchased=true&tier=growth')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/checkout?tier=growth', {
        replace: true,
      })
    })
  })
})
