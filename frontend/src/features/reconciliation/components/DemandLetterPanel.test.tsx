/**
 * Tests for DemandLetterPanel component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DemandLetterPanel } from './DemandLetterPanel'

const mockMutate = vi.fn()

vi.mock('@/api/hooks', () => ({
  useGenerateDemandLetter: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}))

import { useGenerateDemandLetter } from '@/api/hooks'

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const defaultTenants = [
  { id: 't1', name: 'Acme Corp', unit: 'Suite 100', total_recovery: 5000 },
  { id: 't2', name: 'Beta LLC', total_recovery: 2500 },
]

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  propertyId: 'prop-1',
  year: 2024,
  tenants: defaultTenants,
}

describe('DemandLetterPanel', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    vi.mocked(useGenerateDemandLetter).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any)
  })

  it('renders panel when open=true', () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('demand-letter-panel')).toBeInTheDocument()
    expect(
      screen.getByText(/Build a demand letter for an under-bill/i)
    ).toBeInTheDocument()
  })

  it('shows tenant dropdown with finalized tenant snapshots', () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    const select = screen.getByTestId('tenant-select')
    expect(select).toBeInTheDocument()
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument()
    expect(screen.getByText(/Beta LLC/)).toBeInTheDocument()
  })

  it('offers a correction note for zero or over-bill tenant differences', () => {
    render(
      <Wrapper>
        <DemandLetterPanel
          {...defaultProps}
          tenants={[
            { id: 't1', name: 'Clean Tenant', total_recovery: 0 },
            { id: 't2', name: 'Overbilled Tenant', total_recovery: -125 },
          ]}
        />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't2' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    fireEvent.click(screen.getByTestId('step-2-next'))
    expect(screen.getByText(/statement correction note/i)).toBeInTheDocument()
    expect(screen.getByTestId('generate-button')).toHaveTextContent(
      /Generate Correction Note/i
    )
  })

  it('shows state selector with TX and CA options after selecting tenant and proceeding', () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    expect(screen.getByTestId('state-tx')).toBeInTheDocument()
    expect(screen.getByTestId('state-ca')).toBeInTheDocument()
  })

  it('shows deadline days input with default value 30 on step 2', () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    const input = screen.getByTestId('deadline-days-input')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue(30)
  })

  it('shows landlord name input on step 2', () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    expect(screen.getByTestId('landlord-name-input')).toBeInTheDocument()
  })

  it('Generate button calls mutation with correct payload', async () => {
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    fireEvent.change(screen.getByTestId('landlord-name-input'), {
      target: { value: 'Jane Doe' },
    })
    fireEvent.click(screen.getByTestId('step-2-next'))
    fireEvent.click(screen.getByTestId('generate-button'))
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot_id: 't1',
          state: 'TX',
          payment_deadline_days: 30,
          landlord_name: 'Jane Doe',
        })
      )
    })
  })

  it('shows loading state during mutation', () => {
    vi.mocked(useGenerateDemandLetter).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as any)
    render(
      <Wrapper>
        <DemandLetterPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.change(screen.getByTestId('tenant-select'), {
      target: { value: 't1' },
    })
    fireEvent.click(screen.getByTestId('step-1-next'))
    fireEvent.click(screen.getByTestId('step-2-next'))
    expect(screen.getByTestId('generate-button')).toBeDisabled()
  })
})
