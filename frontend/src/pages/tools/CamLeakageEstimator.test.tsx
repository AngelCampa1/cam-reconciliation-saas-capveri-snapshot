/**
 * Tests for CAM Billing Risk Estimator tool page
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { CamLeakageEstimatorPage } from './CamLeakageEstimator'
import { server } from '@/mocks/server'
import { resolveApiUrl } from '@/api/url'

// Mock ToolPageLayout capturing structuredData
vi.mock('@/components/content/ToolPageLayout', () => ({
  ToolPageLayout: ({
    children,
    structuredData,
  }: {
    children: React.ReactNode
    structuredData?: unknown
  }) => (
    <div
      data-testid="tool-page-layout"
      data-structured-data={JSON.stringify(structuredData ?? null)}
    >
      {children}
    </div>
  ),
}))

// Mock analytics
const mockTrackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  getEmailDomain: (email: string) => email.split('@')[1],
  identifyLeadForAnalytics: vi.fn(),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

const renderPage = () =>
  render(
    <BrowserRouter>
      <CamLeakageEstimatorPage />
    </BrowserRouter>
  )

const UNLOCK_URL = resolveApiUrl('/api/v1/leads/calculator-unlock')

// Helper: fill the buildings and SF inputs to get a result
const fillInputs = (container: HTMLElement) => {
  // buildings number input is a spinbutton labeled "Number of Buildings"
  const buildingsInput = container.querySelector(
    'input[type="number"][id]'
  ) as HTMLInputElement
  fireEvent.change(buildingsInput, { target: { value: '5' } })

  // SF input - second number input
  const allNumInputs = container.querySelectorAll('input[type="number"]')
  const sfInput = allNumInputs[1] as HTMLInputElement
  fireEvent.change(sfInput, { target: { value: '200000' } })
  // camPerSF defaults to 8.50
}

describe('CamLeakageEstimatorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('empty state', () => {
    it('shows "$0 to $0" placeholders when SF input is empty', () => {
      renderPage()
      const emptyRanges = screen.getAllByText('$0 to $0')
      expect(emptyRanges.length).toBeGreaterThanOrEqual(2)
    })

    it('shows prompt text when inputs are incomplete', () => {
      renderPage()
      expect(
        screen.getByText(
          /Enter your portfolio details above to see your estimate/i
        )
      ).toBeInTheDocument()
    })
  })

  describe('calculations with 5 buildings, 200,000 SF, $8.50 CAM/SF', () => {
    it('shows modeled bill-risk range "$21,250 to $127,500"', () => {
      const { container } = renderPage()
      fillInputs(container)
      expect(screen.getByText(/\$21,250/)).toBeInTheDocument()
      expect(screen.getByText(/\$127,500/)).toBeInTheDocument()
    })

    it('shows cap-rate sensitivity range "$303,571 to $1,821,429"', () => {
      const { container } = renderPage()
      fillInputs(container)
      expect(screen.getByText(/\$303,571/)).toBeInTheDocument()
      expect(screen.getByText(/\$1,821,429/)).toBeInTheDocument()
    })

    it('fires tool_result_viewed analytics event on valid input', async () => {
      const { container } = renderPage()
      fillInputs(container)
      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'tool_result_viewed',
          expect.objectContaining({
            slug: 'cam-leakage-estimator',
            buildings: 5,
            avg_sf_bucket: '50k_249k',
            leakage_low: 21250,
            leakage_high: 127500,
          })
        )
      })
    })
  })

  describe('post-result email capture', () => {
    it('does not ask for email before showing a result', () => {
      renderPage()
      expect(
        screen.queryByRole('button', { name: /send me the worksheet/i })
      ).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument()
    })

    it('offers to send the worksheet after the result is visible', async () => {
      const { container } = renderPage()
      fillInputs(container)
      const sendEstimate = await screen.findByRole('button', {
        name: /send me the worksheet/i,
      })

      expect(sendEstimate).toBeInTheDocument()
      expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument()

      fireEvent.click(sendEstimate)

      expect(await screen.findByLabelText(/work email/i)).toBeInTheDocument()
    })

    it('submits the calculator lead with result-source metadata and confirms the worksheet email', async () => {
      const user = userEvent.setup({ delay: null })
      const requestSpy = vi.fn()
      server.use(
        http.post(UNLOCK_URL, async ({ request }) => {
          requestSpy(await request.json())
          return HttpResponse.json({
            unlocked: true,
            message: 'Results unlocked.',
          })
        })
      )
      const { container } = renderPage()
      fillInputs(container)
      await user.click(
        await screen.findByRole('button', {
          name: /send me the worksheet/i,
        })
      )
      await user.type(await screen.findByLabelText(/first name/i), 'Jane')
      await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
      await user.click(
        screen.getByRole('button', { name: /send me the worksheet/i })
      )

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            first_name: 'Jane',
            email: 'jane@example.com',
            slug: 'cam-leakage-estimator',
            source: 'cam_leakage_estimator_result',
          })
        )
      })
      await waitFor(() => {
        expect(
          localStorage.getItem('cam_leakage_estimator_estimate_sent')
        ).toBe('true')
      })
      expect(mockTrackEvent).toHaveBeenCalledWith('lead_form_view', {
        slug: 'cam-leakage-estimator',
        source: 'cam_leakage_estimator_result',
      })
    })
  })

  describe('inline validation hint for CAM per SF (F-376)', () => {
    it('shows hint when CAM per SF is set to 0', () => {
      const { container } = renderPage()
      const camInput = container.querySelectorAll(
        'input[type="number"]'
      )[2] as HTMLInputElement
      fireEvent.change(camInput, { target: { value: '0' } })
      const alert = screen.getByText(
        'Enter a number above 0 to see your estimate.'
      )
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveAttribute('role', 'alert')
    })

    it('does not show hint with the default positive value', () => {
      renderPage()
      expect(
        screen.queryByText(/enter a number above 0 to see your estimate/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('CTA button', () => {
    it('links to /auth/register', () => {
      renderPage()
      const cta = screen.getByRole('link', {
        name: /Start actual GL check/i,
      })
      expect(cta).toHaveAttribute('href', '/auth/register')
    })
  })

  describe('cross-links', () => {
    it('renders link to /resources/tenant-auditor-guide', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /what tenant auditors look for/i,
      })
      expect(link).toHaveAttribute('href', '/resources/tenant-auditor-guide')
    })

    it('renders link to /tools/cam-gross-up-calculator', () => {
      renderPage()
      const link = screen.getByRole('link', {
        name: /cam gross-up calculator/i,
      })
      expect(link).toHaveAttribute('href', '/tools/cam-gross-up-calculator')
    })
  })

  describe('slider and number input sync', () => {
    it('slider change updates the buildings number input', () => {
      const { container } = renderPage()
      const slider = screen.getByRole('slider')
      fireEvent.change(slider, { target: { value: '15' } })

      const buildingsInput = container.querySelector(
        'input[type="number"]'
      ) as HTMLInputElement
      expect(buildingsInput.value).toBe('15')
    })

    it('number input change updates the slider', () => {
      const { container } = renderPage()
      const buildingsInput = container.querySelector(
        'input[type="number"]'
      ) as HTMLInputElement
      fireEvent.change(buildingsInput, { target: { value: '25' } })

      const slider = screen.getByRole('slider') as HTMLInputElement
      expect(slider.value).toBe('25')
    })
  })

  describe('benchmark note', () => {
    it('shows industry benchmark note', () => {
      renderPage()
      expect(
        screen.getByText(/modeled rates.*0.25%.*1.5%/i)
      ).toBeInTheDocument()
    })

    it('benchmark note matches the modeled rates (no contradictory 3%/5% claim)', () => {
      renderPage()
      expect(
        screen.getByText(/modeled rates.*0.25%.*1.5%/i)
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/3% \(conservative\) to 5% \(likely\)/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('structured data / schema', () => {
    it('passes an array of 2 schemas as structuredData', () => {
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

    it('WebApplication schema has correct name', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[0].name).toBe('CAM Billing Risk Estimator')
    })

    it('WebApplication schema is free (price 0)', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[0].offers?.price).toBe('0')
    })

    it('second schema @type is HowTo', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[1]['@type']).toBe('HowTo')
    })

    it('HowTo schema has 3 steps', () => {
      renderPage()
      const layout = screen.getByTestId('tool-page-layout')
      const schemas = JSON.parse(layout.dataset.structuredData ?? 'null')
      expect(schemas[1].step).toHaveLength(3)
    })
  })
})
