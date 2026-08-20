/**
 * Tests for TaxProtestButton component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaxProtestButton } from './TaxProtestButton'

vi.mock('./TaxProtestPanel', () => ({
  TaxProtestPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tax-protest-panel">Panel</div> : null,
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('TaxProtestButton', () => {
  it('renders button with Tax Protest label', () => {
    render(
      <Wrapper>
        <TaxProtestButton snapshotId="snap-1" />
      </Wrapper>
    )
    expect(screen.getByTestId('tax-protest-button')).toHaveTextContent(
      'Tax Protest'
    )
  })

  it('is enabled by default', () => {
    render(
      <Wrapper>
        <TaxProtestButton snapshotId="snap-1" />
      </Wrapper>
    )
    expect(screen.getByTestId('tax-protest-button')).not.toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <Wrapper>
        <TaxProtestButton snapshotId="snap-1" disabled />
      </Wrapper>
    )
    expect(screen.getByTestId('tax-protest-button')).toBeDisabled()
  })

  it('opens panel on click', () => {
    render(
      <Wrapper>
        <TaxProtestButton snapshotId="snap-1" />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('tax-protest-button'))
    expect(screen.getByTestId('tax-protest-panel')).toBeInTheDocument()
  })
})
