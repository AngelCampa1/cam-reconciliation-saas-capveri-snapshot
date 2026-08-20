/**
 * Tests for VarianceReport component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VarianceReport } from './VarianceReport'
import * as hooks from '@/api/hooks'

vi.mock('@/api/hooks', () => ({
  useExportVariancePdf: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const defaultProps = {
  propertyId: 'property-123',
  year: 2024,
}

describe('VarianceReport', () => {
  it('renders variance report button', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    expect(
      screen.getByRole('button', { name: /statement check report/i })
    ).toBeInTheDocument()
  })

  it('shows variance report panel when button is clicked', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    expect(screen.getByTestId('variance-report')).toBeInTheDocument()
  })

  it('shows threshold slider', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    expect(screen.getByTestId('threshold-slider')).toBeInTheDocument()
  })

  it('updates threshold display when slider changes', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    const slider = screen.getByTestId('threshold-slider')
    fireEvent.change(slider, { target: { value: '15' } })
    expect(screen.getByText(/Highlight threshold: 15%/)).toBeInTheDocument()
  })

  it('describes the year-over-year comparison the export will contain', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    // The panel is an export configurator (no inline table), so it should
    // explain what the PDF compares rather than offer controls that do nothing.
    expect(screen.getByText(/We checked 2023 vs 2024/i)).toBeInTheDocument()
    // The removed "show significant only" checkbox was a dead control: the
    // export endpoint takes only threshold_percent, so it filtered nothing.
    expect(
      screen.queryByTestId('show-significant-checkbox')
    ).not.toBeInTheDocument()
  })

  it('shows export variance pdf button', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    expect(screen.getByTestId('export-variance-pdf-button')).toBeInTheDocument()
  })

  it('calls export mutation when export button clicked', () => {
    const mutateMock = vi.fn()
    vi.mocked(hooks.useExportVariancePdf).mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    })

    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    fireEvent.click(screen.getByTestId('export-variance-pdf-button'))
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: 'property-123',
        current_year: 2024,
      })
    )
  })

  it('exposes the toggle as a disclosure with aria-expanded state', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    const toggle = screen.getByRole('button', {
      name: /statement check report/i,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'variance-report-panel')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('variance-report')).toHaveAttribute(
      'id',
      'variance-report-panel'
    )
  })

  it('hides report when button is clicked again', () => {
    render(
      <Wrapper>
        <VarianceReport {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    expect(screen.getByTestId('variance-report')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /statement check report/i })
    )
    expect(screen.queryByTestId('variance-report')).not.toBeInTheDocument()
  })
})
