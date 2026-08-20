/**
 * Tests for Report Generation Button Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportGenerationButton } from './ReportGenerationButton'
import { configureAuth } from '@/api/client'

// Mock window.open
const mockWindowOpen = vi.fn()
window.open = mockWindowOpen

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock URL methods
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()
const mockAnchorClick = vi.fn()
HTMLAnchorElement.prototype.click = mockAnchorClick

describe('ReportGenerationButton', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset document.body for each test
    document.body.innerHTML = ''
    // Mock fetch
    global.fetch = mockFetch
    configureAuth({
      getSession: async () => ({ access_token: 'test-token' }),
      signOut: async () => {},
    })
  })

  it('renders the button with correct text', () => {
    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    expect(
      screen.getByRole('button', { name: /generate report/i })
    ).toBeInTheDocument()
  })

  it('is disabled when years array has less than 2 elements', () => {
    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2024]}
      />
    )

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
        disabled={true}
      />
    )

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('generates PDF report successfully', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ report_url: 'https://example.com/report.pdf' }),
    } as Response)

    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /generate report/i }))

    // Click PDF option
    const pdfOption = screen.getByRole('menuitem', { name: /pdf report/i })
    await user.click(pdfOption)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/reports/historical/pdf'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            property_id: '123e4567-e89b-12d3-a456-426614174000',
            years: [2023, 2024],
            include_charts: false,
          }),
        })
      )
    })
    const pdfHeaders = new Headers(mockFetch.mock.calls[0][1].headers)
    expect(pdfHeaders.get('Content-Type')).toBe('application/json')
    expect(pdfHeaders.get('Authorization')).toBe('Bearer test-token')

    await waitFor(() => {
      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/report.pdf',
        '_blank',
        'noopener,noreferrer'
      )
    })
  })

  it('generates Excel report successfully', async () => {
    const user = userEvent.setup()

    const mockBlob = new Blob(['mock excel data'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="report.xlsx"',
      }),
    } as Response)

    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /generate report/i }))

    // Click Excel option
    const excelOption = screen.getByRole('menuitem', { name: /excel report/i })
    await user.click(excelOption)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/reports/historical/excel'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            property_id: '123e4567-e89b-12d3-a456-426614174000',
            years: [2023, 2024],
            include_charts: false,
          }),
        })
      )
    })
    const excelHeaders = new Headers(mockFetch.mock.calls[0][1].headers)
    expect(excelHeaders.get('Content-Type')).toBe('application/json')
    expect(excelHeaders.get('Authorization')).toBe('Bearer test-token')

    // Verify download was triggered
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob)
      expect(mockAnchorClick).toHaveBeenCalled()
    })
  })

  it('handles PDF generation error', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    mockFetch.mockResolvedValueOnce({
      ok: false,
    } as Response)

    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /generate report/i }))

    // Click PDF option
    const pdfOption = screen.getByRole('menuitem', { name: /pdf report/i })
    await user.click(pdfOption)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate PDF report')
    })
  })

  it('handles Excel generation error', async () => {
    const user = userEvent.setup()
    const { toast } = await import('sonner')

    mockFetch.mockResolvedValueOnce({
      ok: false,
    } as Response)

    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /generate report/i }))

    // Click Excel option
    const excelOption = screen.getByRole('menuitem', { name: /excel report/i })
    await user.click(excelOption)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to generate Excel report'
      )
    })
  })

  it('disables buttons while generating', async () => {
    const user = userEvent.setup()

    // Create a promise that we can control
    let resolvePromise: (value: any) => void
    const promise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    mockFetch.mockReturnValueOnce(promise as any)

    render(
      <ReportGenerationButton
        propertyId="123e4567-e89b-12d3-a456-426614174000"
        years={[2023, 2024]}
      />
    )

    // Open dropdown and start PDF generation
    await user.click(screen.getByRole('button', { name: /generate report/i }))
    const pdfOption = screen.getByRole('menuitem', { name: /pdf report/i })
    await user.click(pdfOption)

    // Button should show "Generating..."
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /generating/i })
      ).toBeInTheDocument()
    })

    // Resolve the promise
    resolvePromise!({
      ok: true,
      json: async () => ({ report_url: 'https://example.com/report.pdf' }),
    })

    // Button should return to normal
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /generate report/i })
      ).toBeInTheDocument()
    })
  })
})
