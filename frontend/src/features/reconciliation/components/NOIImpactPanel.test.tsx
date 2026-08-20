/**
 * Tests for NOIImpactPanel component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NOIImpactPanel } from './NOIImpactPanel'
import * as hooks from '@/api/hooks'

vi.mock('@/api/hooks', () => ({
  useExportBoardPreview: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
  })),
  useExportBoardDownload: vi.fn(() => ({
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
  totalRecovery: 25000,
}

describe('NOIImpactPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the NOI impact toggle button', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('noi-impact-button')).toBeInTheDocument()
  })

  it('does not show panel content by default', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.queryByTestId('noi-impact-panel')).not.toBeInTheDocument()
  })

  it('shows panel when button is clicked', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('noi-impact-panel')).toBeInTheDocument()
  })

  it('hides panel when button is clicked again (toggle)', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.queryByTestId('noi-impact-panel')).not.toBeInTheDocument()
  })

  it('shows recovery amount stat card', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('stat-recovery-amount')).toBeInTheDocument()
    expect(screen.getByText('Tenant Total')).toBeInTheDocument()
    expect(screen.queryByText('CAM Recovery')).not.toBeInTheDocument()
  })

  it('shows asset value lift stat card', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('stat-asset-value-lift')).toBeInTheDocument()
  })

  it('shows cap rate slider with default 7%', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('cap-rate-slider')).toBeInTheDocument()
    // 7.0% appears in both the label and the stat card subtext
    expect(screen.getAllByText(/7\.0%/).length).toBeGreaterThan(0)
  })

  it('updates cap rate display when slider changes', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    const slider = screen.getByTestId('cap-rate-slider')
    // Slider stores tenths-of-percent: 80 = 8.0%
    fireEvent.change(slider, { target: { value: '80' } })
    expect(screen.getAllByText(/8\.0%/).length).toBeGreaterThan(0)
  })

  it('shows export board presentation button', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('export-board-button')).toBeInTheDocument()
  })

  it('calls board download mutation when export button clicked', () => {
    const mutateMock = vi.fn()
    vi.mocked(hooks.useExportBoardDownload).mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as ReturnType<typeof hooks.useExportBoardDownload>)

    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    fireEvent.click(screen.getByTestId('export-board-button'))
    expect(mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        property_id: 'property-123',
        year: 2024,
      })
    )
  })

  it('shows ~$357,143 asset value lift for $25k recovery at 7%', () => {
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('noi-impact-button'))
    // 25000 / 0.07 = 357142.857... → JS Intl rounds to 357,143
    expect(screen.getByTestId('stat-asset-value-lift')).toHaveTextContent(
      '357,143'
    )
  })

  it('shows locked state with upgrade CTA when feature is gated', () => {
    const onUpgrade = vi.fn()
    render(
      <Wrapper>
        <NOIImpactPanel {...defaultProps} isLocked onUpgrade={onUpgrade} />
      </Wrapper>
    )

    fireEvent.click(screen.getByTestId('noi-impact-button'))
    expect(screen.getByTestId('noi-impact-locked')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('noi-upgrade-button'))
    expect(onUpgrade).toHaveBeenCalledTimes(1)
  })
})
