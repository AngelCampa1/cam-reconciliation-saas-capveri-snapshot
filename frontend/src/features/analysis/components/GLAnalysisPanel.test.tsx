import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GLAnalysisPanel } from './GLAnalysisPanel'
import * as glHooks from '../hooks/useGLAnalysis'

vi.mock('../hooks/useGLAnalysis', () => ({
  useLatestGLAnalysis: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isPaused: false,
    refetch: vi.fn(),
  })),
  useRunGLAnalysis: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  })),
  useDismissGLAnalysis: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  })),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
)

describe('GLAnalysisPanel - offline / paused', () => {
  it('shows offline ErrorState and Try again; hides Run GL analysis CTA', () => {
    const refetch = vi.fn()
    vi.mocked(glHooks.useLatestGLAnalysis).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch,
    } as never)
    render(
      <Wrapper>
        <GLAnalysisPanel propertyId="p1" periodYear={2024} />
      </Wrapper>
    )
    expect(screen.getByText("Can't reach the server")).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /run gl analysis/i })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
