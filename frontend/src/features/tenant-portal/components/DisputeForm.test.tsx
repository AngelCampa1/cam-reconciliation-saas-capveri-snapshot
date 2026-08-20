/**
 * Tests for DisputeForm component
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DisputeForm } from './DisputeForm'
import { Toaster } from '@/components/ui/sonner'
import { apiClient } from '@/api/client'

// Mock API client
vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/lib/analytics'

describe('DisputeForm', () => {
  let queryClient: QueryClient
  const mockOnSuccess = vi.fn()
  const mockOnCancel = vi.fn()
  const statementId = '123e4567-e89b-12d3-a456-426614174000'

  beforeAll(() => {
    // Mock window.scrollTo to prevent errors in tests
    window.scrollTo = vi.fn()
  })

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  it('renders form with all fields', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DisputeForm
          statementId={statementId}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /submit dispute/i })
    ).toBeInTheDocument()
  })

  it('submit button is disabled when fields are empty', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DisputeForm
          statementId={statementId}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      </QueryClientProvider>
    )

    const submitButton = screen.getByRole('button', { name: /submit dispute/i })
    expect(submitButton).toBeDisabled()
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DisputeForm
          statementId={statementId}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      </QueryClientProvider>
    )

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('handles successful form submission', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        id: '456',
        statement_id: statementId,
        category: 'calculation_error',
        status: 'open',
        description: 'Test dispute description',
        created_at: '2024-12-30T10:00:00Z',
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof apiClient.post>>)

    render(
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <DisputeForm
          statementId={statementId}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      </QueryClientProvider>
    )

    // Select category by clicking the trigger and then an option
    const selectTrigger = screen.getByRole('combobox')
    fireEvent.click(selectTrigger)

    // Wait for the dropdown to open and find the option
    const calculationErrorOption = await screen.findByRole('option', {
      name: 'Calculation Error',
    })
    fireEvent.click(calculationErrorOption)

    // Fill out description
    const descriptionTextarea = screen.getByPlaceholderText(
      /please describe the issue in detail/i
    )
    fireEvent.change(descriptionTextarea, {
      target: { value: 'There is an error in the calculation' },
    })

    // Submit
    const submitButton = screen.getByRole('button', { name: /submit dispute/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledOnce()
    })
    expect(trackEvent).toHaveBeenCalledWith('tenant_dispute_create_succeeded', {
      dispute_id: '456',
      statement_id: statementId,
      category: 'calculation_error',
      status: 'open',
    })
  })

  it('displays rate limit error', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: null,
      error: { status: 429, detail: 'Rate limit exceeded' },
    } as unknown as Awaited<ReturnType<typeof apiClient.post>>)

    render(
      <QueryClientProvider client={queryClient}>
        <Toaster />
        <DisputeForm
          statementId={statementId}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      </QueryClientProvider>
    )

    // Select category
    const selectTrigger = screen.getByRole('combobox')
    fireEvent.click(selectTrigger)

    // Wait for the dropdown to open and find the option
    const calculationErrorOption = await screen.findByRole('option', {
      name: 'Calculation Error',
    })
    fireEvent.click(calculationErrorOption)

    // Fill out description
    const descriptionTextarea = screen.getByPlaceholderText(
      /please describe the issue in detail/i
    )
    fireEvent.change(descriptionTextarea, {
      target: { value: 'There is an error in the calculation' },
    })

    // Submit
    const submitButton = screen.getByRole('button', { name: /submit dispute/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument()
    })
  })
})
