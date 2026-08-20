/**
 * Tests for TaxProtestPanel component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaxProtestPanel } from './TaxProtestPanel'

const mockMutate = vi.fn()
let mockIsPending = false

vi.mock('@/api/hooks', () => ({
  useTaxProtestExport: vi.fn(() => ({
    mutate: mockMutate,
    isPending: mockIsPending,
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

describe('TaxProtestPanel', () => {
  beforeEach(() => {
    mockMutate.mockClear()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <Wrapper>
        <TaxProtestPanel open={false} onClose={() => {}} snapshotId="snap-1" />
      </Wrapper>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders form when open', () => {
    render(
      <Wrapper>
        <TaxProtestPanel open={true} onClose={() => {}} snapshotId="snap-1" />
      </Wrapper>
    )
    expect(screen.getByTestId('tax-protest-panel')).toBeInTheDocument()
    expect(screen.getByTestId('tax-year-input')).toBeInTheDocument()
    expect(screen.getByTestId('generate-button')).toBeInTheDocument()
    expect(
      screen.getByText(/Generate the tax protest export package/i)
    ).toBeInTheDocument()
  })

  it('calls mutate with snapshot_id and tax_year on submit', async () => {
    render(
      <Wrapper>
        <TaxProtestPanel open={true} onClose={() => {}} snapshotId="snap-abc" />
      </Wrapper>
    )

    fireEvent.click(screen.getByTestId('generate-button'))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot_id: 'snap-abc',
          tax_year: expect.any(Number),
        })
      )
    })
  })

  it('generate button is disabled when isPending', () => {
    mockIsPending = true
    render(
      <Wrapper>
        <TaxProtestPanel open={true} onClose={() => {}} snapshotId="snap-1" />
      </Wrapper>
    )
    expect(screen.getByTestId('generate-button')).toBeDisabled()
    mockIsPending = false
  })
})
