/**
 * Tests for the BOMA 2024 Rentable Area Calculator page.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resolveApiUrl } from '@/api/url'
import { server } from '@/mocks/server'
import { Boma2024CalculatorPage } from './Boma2024Calculator'

// Mock ToolPageLayout
vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({
    children,
    structuredData,
    title,
  }: {
    children: React.ReactNode
    structuredData?: unknown
    title?: string
  }) => (
    <div
      data-testid="tool-page-layout"
      data-title={title}
      data-structured-data={JSON.stringify(structuredData ?? null)}
    >
      {children}
    </div>
  ),
}))

// Mock CalculatorUnlockGate
vi.mock('@/components/lead-capture/CalculatorUnlockGate', () => ({
  CalculatorUnlockGate: ({
    onUnlock,
  }: {
    slug: string
    onUnlock: () => void
    source?: string
  }) => (
    <div data-testid="unlock-gate">
      <button onClick={onUnlock} data-testid="mock-unlock-btn">
        Send email for dollar details
      </button>
    </div>
  ),
}))

// Mock analytics
const mockTrackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

const CALC_URL = resolveApiUrl('/api/v1/tools/boma-2024-calculator')

const MOCK_RESULT = {
  load_factor: '1.2500',
  new_usable_sf: '108000.00',
  new_rentable_sf: '135000.00',
  hidden_sf: '10000.00',
  pct_increase: '8.0000',
  revenue_lift: '300000.00',
  asset_value_lift: '4615385',
}

function renderPage() {
  return render(
    <BrowserRouter>
      <Boma2024CalculatorPage />
    </BrowserRouter>
  )
}

/** Fill all required inputs using userEvent (delay:null for speed). */
async function fillRequiredInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/existing usable sf/i), '100000')
  await user.type(screen.getByLabelText(/existing rentable sf/i), '125000')
  await user.type(screen.getByLabelText(/annual rent per sf/i), '30')
}

describe('Boma2024CalculatorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('layout and title', () => {
    it('renders ToolPageLayout', () => {
      renderPage()
      expect(screen.getByTestId('tool-page-layout')).toBeInTheDocument()
    })

    it('title contains BOMA 2024', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      expect(layout.dataset.title).toContain('BOMA 2024')
    })

    it('H1 contains BOMA 2024', () => {
      renderPage()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toContain('BOMA 2024')
    })
  })

  describe('empty state', () => {
    it('shows dash placeholders before inputs are filled', () => {
      renderPage()
      const placeholders = screen.getAllByText('—')
      expect(placeholders.length).toBeGreaterThanOrEqual(2)
    })

    it('shows "Enter usable SF" hint text', () => {
      renderPage()
      expect(
        screen.getByText(/enter usable sf.*rentable sf.*annual rent/i)
      ).toBeInTheDocument()
    })
  })

  describe('API interaction', () => {
    it('calls API with correct payload on valid input', async () => {
      const user = userEvent.setup({ delay: null })
      const requestSpy = vi.fn()
      server.use(
        http.post(CALC_URL, async ({ request }) => {
          requestSpy(await request.json())
          return HttpResponse.json(MOCK_RESULT)
        })
      )

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          expect.objectContaining({ usable_sf: '100000' })
        )
      })
    })

    it('shows free results after API returns data', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(CALC_URL, () => HttpResponse.json(MOCK_RESULT)))

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(screen.getByText(/10,000 SF/i)).toBeInTheDocument()
      })
      expect(screen.getByText(/8.00%/)).toBeInTheDocument()
    })

    it('shows loading state while API call is in flight', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(CALC_URL, () => new Promise<Response>(() => {})))

      renderPage()
      // Use single-char inputs so only ONE fetchCalculation is triggered,
      // avoiding an abort-then-finally race that resets isLoading to false.
      await user.type(screen.getByLabelText(/existing usable sf/i), '1')
      await user.type(screen.getByLabelText(/existing rentable sf/i), '1')
      await user.type(screen.getByLabelText(/annual rent per sf/i), '1')

      await waitFor(() => {
        expect(screen.getAllByText('…').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('shows error state if API call fails', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(CALC_URL, () =>
          HttpResponse.json(
            { detail: 'rentable_sf must be >= usable_sf' },
            { status: 422 }
          )
        )
      )

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(
          screen.getByText(/rentable_sf must be >= usable_sf/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('CalculatorUnlockGate', () => {
    it('renders CalculatorUnlockGate in gated section', () => {
      renderPage()
      expect(screen.getByTestId('unlock-gate')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /dollar details/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/financial projections/i)
      ).not.toBeInTheDocument()
    })

    it('gated results become visible after onUnlock() is called', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(CALC_URL, () => HttpResponse.json(MOCK_RESULT)))

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(screen.getByText(/10,000 SF/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('mock-unlock-btn'))

      await waitFor(() => {
        expect(screen.getByText(/\$300,000/)).toBeInTheDocument()
      })
    })

    it('renders a revenue lift beyond MAX_SAFE_INTEGER without float drift (F-430)', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(CALC_URL, () =>
          HttpResponse.json({
            ...MOCK_RESULT,
            revenue_lift: '9007199254740993.00',
          })
        )
      )

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(screen.getByText(/10,000 SF/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('mock-unlock-btn'))

      await waitFor(() => {
        expect(screen.getByText('$9,007,199,254,740,993')).toBeInTheDocument()
      })
      expect(
        screen.queryByText('$9,007,199,254,740,992')
      ).not.toBeInTheDocument()
    })
  })

  describe('cap rate slider', () => {
    it('cap rate slider adjusts asset value display without re-calling API', async () => {
      const user = userEvent.setup({ delay: null })
      const requestSpy = vi.fn()
      server.use(
        http.post(CALC_URL, async ({ request }) => {
          requestSpy(await request.json())
          return HttpResponse.json(MOCK_RESULT)
        })
      )

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(screen.getByText(/10,000 SF/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('mock-unlock-btn'))
      const callCountBeforeSlider = requestSpy.mock.calls.length

      const slider = screen.getByRole('slider', { name: /cap rate/i })
      fireEvent.change(slider, { target: { value: '7' } })

      expect(screen.getByText('7.0%')).toBeInTheDocument()
      expect(requestSpy.mock.calls.length).toBe(callCountBeforeSlider)
    })

    it('associates the slider with the asset-value-lift result via aria-controls (F-379)', async () => {
      const user = userEvent.setup({ delay: null })
      renderPage()

      await user.type(screen.getByLabelText(/existing usable sf/i), '100000')
      await user.type(screen.getByLabelText(/existing rentable sf/i), '125000')
      await user.type(screen.getByLabelText(/annual rent per sf/i), '30')

      const slider = screen.getByRole('slider', { name: /cap rate/i })
      const controlsId = slider.getAttribute('aria-controls')
      expect(controlsId).toBeTruthy()

      const region = document.getElementById(controlsId as string)
      expect(region).not.toBeNull()
      expect(region).toHaveTextContent(/Asset Value Lift/i)
    })
  })

  describe('inline validation hint (F-375)', () => {
    it('shows rentable-too-small alert when rentable SF < usable SF', async () => {
      const user = userEvent.setup({ delay: null })
      renderPage()

      await user.type(screen.getByLabelText(/existing usable sf/i), '125000')
      await user.type(screen.getByLabelText(/existing rentable sf/i), '100000')

      await waitFor(() => {
        expect(
          screen.getByText(
            'Rentable area must be the same size or larger than usable area.'
          )
        ).toBeInTheDocument()
      })

      const alert = screen.getByText(
        'Rentable area must be the same size or larger than usable area.'
      )
      expect(alert).toHaveAttribute('role', 'alert')
    })

    it('does not show rentable-too-small alert when rentable SF >= usable SF', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(CALC_URL, () => HttpResponse.json(MOCK_RESULT)))
      renderPage()

      await user.type(screen.getByLabelText(/existing usable sf/i), '100000')
      await user.type(screen.getByLabelText(/existing rentable sf/i), '125000')

      expect(
        screen.queryByText(
          /rentable area must be the same size or larger than usable area/i
        )
      ).not.toBeInTheDocument()
    })
  })

  describe('cross-links', () => {
    it('has link to /resources/boma-2024-changes', () => {
      renderPage()
      const link = screen.getByRole('link', { name: /boma 2024 vs 2017/i })
      expect(link).toHaveAttribute('href', '/resources/boma-2024-changes')
    })

    it('has link to /tools/cam-leakage-estimator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /cam billing risk estimator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })
  })

  describe('analytics', () => {
    it('fires tool_page_view on mount', () => {
      renderPage()
      expect(mockTrackEvent).toHaveBeenCalledWith('tool_page_view', {
        slug: 'boma-2024-calculator',
      })
    })

    it('fires tool_interaction when API returns results', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(CALC_URL, () => HttpResponse.json(MOCK_RESULT)))

      renderPage()
      await fillRequiredInputs(user)

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'tool_interaction',
          expect.objectContaining({ slug: 'boma-2024-calculator' })
        )
      })
    })
  })

  describe('structured data', () => {
    it('passes array of 2 schemas as structuredData', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(Array.isArray(schemas)).toBe(true)
      expect(schemas).toHaveLength(2)
    })

    it('first schema @type is WebApplication', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[0]['@type']).toBe('WebApplication')
    })

    it('second schema @type is HowTo', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[1]['@type']).toBe('HowTo')
    })
  })
})
