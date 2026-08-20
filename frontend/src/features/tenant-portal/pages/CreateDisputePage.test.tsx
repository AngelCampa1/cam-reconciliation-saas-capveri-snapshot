import { render, screen } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateDisputePage } from './CreateDisputePage'
import { vi } from 'vitest'

// Mock the DisputeForm component since we're testing the page wrapper
vi.mock('../components/DisputeForm', () => ({
  DisputeForm: ({
    onSuccess,
    onCancel,
  }: {
    statementId: string
    onSuccess: () => void
    onCancel: () => void
  }) => (
    <div data-testid="dispute-form">
      <button onClick={onSuccess}>Submit</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

describe('CreateDisputePage', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  it('guides the tenant to pick a statement when statement_id is missing', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/tenant/disputes/new']}>
          <CreateDisputePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText(/pick a statement first/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /go to your dashboard/i })
    ).toBeInTheDocument()
  })

  it('renders dispute form when statement_id is provided', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/tenant/disputes/new?statement_id=123e4567-e89b-12d3-a456-426614174000',
          ]}
        >
          <CreateDisputePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('dispute-form')).toBeInTheDocument()
    expect(screen.getByText('Submit Dispute')).toBeInTheDocument()
  })

  it('has back button to disputes list', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/tenant/disputes/new?statement_id=123e4567-e89b-12d3-a456-426614174000',
          ]}
        >
          <CreateDisputePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // BackButton component renders a Button with "Navigate back" aria-label
    const backButton = screen.getByRole('button', { name: /navigate back/i })
    expect(backButton).toBeInTheDocument()
  })
})
