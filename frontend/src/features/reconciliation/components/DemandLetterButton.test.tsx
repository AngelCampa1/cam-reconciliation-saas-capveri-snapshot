/**
 * Tests for DemandLetterButton component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DemandLetterButton } from './DemandLetterButton'

vi.mock('./DemandLetterPanel', () => ({
  DemandLetterPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="demand-letter-panel">Panel</div> : null,
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const tenants = [
  { id: 't1', name: 'Acme Corp', unit: 'Suite 100', total_recovery: 5000 },
]

describe('DemandLetterButton', () => {
  it('renders button with correct label Billing Document', () => {
    render(
      <Wrapper>
        <DemandLetterButton
          propertyId="p1"
          year={2024}
          tenants={tenants}
          isFinalized
        />
      </Wrapper>
    )
    expect(screen.getByTestId('demand-letter-button')).toHaveTextContent(
      'Billing Document'
    )
  })

  it('button is disabled when isFinalized=false', () => {
    render(
      <Wrapper>
        <DemandLetterButton
          propertyId="p1"
          year={2024}
          tenants={tenants}
          isFinalized={false}
        />
      </Wrapper>
    )
    expect(screen.getByTestId('demand-letter-button')).toBeDisabled()
  })

  it('button is disabled when tenants is empty array', () => {
    render(
      <Wrapper>
        <DemandLetterButton
          propertyId="p1"
          year={2024}
          tenants={[]}
          isFinalized
        />
      </Wrapper>
    )
    expect(screen.getByTestId('demand-letter-button')).toBeDisabled()
  })

  it('button is enabled when isFinalized=true and tenants are present', () => {
    render(
      <Wrapper>
        <DemandLetterButton
          propertyId="p1"
          year={2024}
          tenants={tenants}
          isFinalized
        />
      </Wrapper>
    )
    expect(screen.getByTestId('demand-letter-button')).not.toBeDisabled()
  })

  it('opens panel on click', () => {
    render(
      <Wrapper>
        <DemandLetterButton
          propertyId="p1"
          year={2024}
          tenants={tenants}
          isFinalized
        />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('demand-letter-button'))
    expect(screen.getByTestId('demand-letter-panel')).toBeInTheDocument()
  })
})
