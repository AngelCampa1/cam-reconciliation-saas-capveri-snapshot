/**
 * Tests for HCAD Tax Base Year Normalizer page
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HcadTaxNormalizerPage } from './HcadTaxNormalizer'

// Mock ToolPageLayout
vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tool-page-layout">{children}</div>
  ),
}))

// Mock analytics
const mockTrackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

const API_RESPONSE = {
  adjusted_base_year: '90000.00',
  original_passthrough: '1000.00',
  corrected_passthrough: '1500.00',
  recovery_delta: '500.00',
  capped_corrected_passthrough: null,
  capped_recovery: null,
  cap_was_applied: null,
}

const API_RESPONSE_WITH_CAP = {
  adjusted_base_year: '90000.00',
  original_passthrough: '2500.00',
  corrected_passthrough: '3000.00',
  recovery_delta: '500.00',
  capped_corrected_passthrough: '2750.00',
  capped_recovery: '250.00',
  cap_was_applied: true,
}

const renderPage = () =>
  render(
    <BrowserRouter>
      <HcadTaxNormalizerPage />
    </BrowserRouter>
  )

const fillRequiredInputs = () => {
  const inputs = document.querySelectorAll('input[type="number"]')
  // originalBaseYear, retroAdj, currentYearTax, proRata (index 0-3)
  fireEvent.change(inputs[0], { target: { value: '100000' } })
  fireEvent.change(inputs[1], { target: { value: '10000' } })
  fireEvent.change(inputs[2], { target: { value: '120000' } })
  fireEvent.change(inputs[3], { target: { value: '5' } })
}

describe('HcadTaxNormalizerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('placeholder state before calculation', () => {
    it('shows placeholder dashes before any calculation', () => {
      renderPage()
      const dashes = screen.getAllByText(/—/)
      expect(dashes.length).toBeGreaterThanOrEqual(3)
    })

    it('shows prompt text when inputs are incomplete', () => {
      renderPage()
      expect(
        screen.getByText(/enter your property details/i)
      ).toBeInTheDocument()
    })
  })

  describe('input fields', () => {
    it('renders all required input fields', () => {
      renderPage()
      expect(
        screen.getByLabelText(/original base year assessment/i)
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText(/arb retroactive reduction/i)
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/current year.*tax/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/tenant pro.?rata/i)).toBeInTheDocument()
    })

    it('renders optional cap rate input', () => {
      renderPage()
      expect(screen.getByLabelText(/expense cap rate/i)).toBeInTheDocument()
    })

    it('reflects input changes in form fields', () => {
      renderPage()
      const inputs = document.querySelectorAll('input[type="number"]')
      fireEvent.change(inputs[0], { target: { value: '200000' } })
      expect((inputs[0] as HTMLInputElement).value).toBe('200000')
    })
  })

  describe('calculate button gate (isReady)', () => {
    it('calculate button is disabled when required fields are empty', () => {
      renderPage()
      const btn = screen.getByRole('button', { name: /calculate/i })
      expect(btn).toBeDisabled()
    })

    it('calculate button is enabled once all required fields are filled', () => {
      renderPage()
      fillRequiredInputs()
      const btn = screen.getByRole('button', { name: /calculate/i })
      expect(btn).not.toBeDisabled()
    })

    it('calculate button remains disabled when retroAdj > originalBase', () => {
      renderPage()
      const inputs = document.querySelectorAll('input[type="number"]')
      fireEvent.change(inputs[0], { target: { value: '10000' } })
      fireEvent.change(inputs[1], { target: { value: '50000' } }) // retro > original
      fireEvent.change(inputs[2], { target: { value: '120000' } })
      fireEvent.change(inputs[3], { target: { value: '5' } })
      const btn = screen.getByRole('button', { name: /calculate/i })
      expect(btn).toBeDisabled()
    })
  })

  describe('API call and results display', () => {
    it('sends correct payload to API on calculate click', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/tools/hcad-tax-normalizer/calculate'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('"original_base_year_assessment"'),
        })
      )
    })

    it('displays tax adjustment prominently after successful calculation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.getByText(/\$500/)).toBeInTheDocument()
      })
    })

    it('displays original and corrected passthroughs after calculation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.getByText(/\$1,000/)).toBeInTheDocument()
        expect(screen.getByText(/\$1,500/)).toBeInTheDocument()
      })
    })

    it('shows loading state during API call', async () => {
      let resolve: (value: Response) => void
      const pending = new Promise((r) => {
        resolve = r
      })
      vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
        pending as Promise<Response>
      )

      renderPage()
      fillRequiredInputs()

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      expect(
        screen.getByRole('button', { name: /calculating/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /calculating/i })
      ).toBeDisabled()

      // Resolve to clean up
      await act(async () => {
        resolve!({
          ok: true,
          json: async () => API_RESPONSE,
        } as Response)
        await pending
      })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /calculate/i })
        ).toBeInTheDocument()
      })
    })

    it('shows error state on API failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  describe('cap rate handling', () => {
    it('cap row is not visible before calculation when no cap rate entered', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.queryByText(/capped adjustment/i)).not.toBeInTheDocument()
      })
    })

    it('shows capped adjustment when cap rate is provided and API returns cap values', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE_WITH_CAP,
      } as Response)

      renderPage()
      fillRequiredInputs()
      // Also fill cap rate
      const inputs = document.querySelectorAll('input[type="number"]')
      fireEvent.change(inputs[4], { target: { value: '10' } })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.getByText(/capped adjustment/i)).toBeInTheDocument()
        expect(screen.getByText(/\$250/)).toBeInTheDocument()
      })
    })
  })

  describe('analytics', () => {
    it('calls trackEvent after first successful calculation', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => API_RESPONSE,
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'tool_interaction',
          expect.objectContaining({ slug: 'hcad-tax-normalizer' })
        )
      })
    })

    it('does NOT call trackEvent on API error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'error' }),
      } as Response)

      renderPage()
      fillRequiredInputs()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /calculate/i }))
      })

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      expect(mockTrackEvent).not.toHaveBeenCalled()
    })
  })

  describe('CTA and cross-links', () => {
    it('links CTA to /auth/register', () => {
      renderPage()
      const cta = screen.getByRole('link', {
        name: /start.*audit|get.*started|see what/i,
      })
      expect(cta).toHaveAttribute('href', '/auth/register')
    })

    it('renders cross-link to CAM billing risk estimator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /cam billing risk estimator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })
  })
})
