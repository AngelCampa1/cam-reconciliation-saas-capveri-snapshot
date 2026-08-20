/**
 * Tests for ExportButton component
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportButton } from './ExportButton'

vi.mock('@/features/export/hooks', () => ({
  useDetailAdvisor: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
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
  tenants: [
    { id: 'tenant-1', name: 'Acme Corp', unit: 'Suite 100' },
    { id: 'tenant-2', name: 'Beta Inc', unit: 'Suite 200' },
  ],
}

describe('ExportButton', () => {
  it('renders export button', () => {
    render(
      <Wrapper>
        <ExportButton {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('export-button')).toBeInTheDocument()
  })

  it('opens export panel when clicked', () => {
    render(
      <Wrapper>
        <ExportButton {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-button'))
    expect(screen.getByTestId('export-panel')).toBeInTheDocument()
  })

  it('button shows Export label', () => {
    render(
      <Wrapper>
        <ExportButton {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('export-button')).toHaveTextContent('Export')
  })

  it('is enabled by default', () => {
    render(
      <Wrapper>
        <ExportButton {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('export-button')).not.toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <Wrapper>
        <ExportButton {...defaultProps} disabled />
      </Wrapper>
    )
    expect(screen.getByTestId('export-button')).toBeDisabled()
  })
})
