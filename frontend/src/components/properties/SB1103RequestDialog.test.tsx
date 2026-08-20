/**
 * SB1103RequestDialog Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SB1103RequestDialog } from './SB1103RequestDialog'
import * as hooks from '@/api/hooks'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('SB1103RequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(hooks, 'useCreateSB1103Request').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('surfaces a retryable error when the property leases fail to load (F-427)', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never)

    renderWithProviders(
      <SB1103RequestDialog open onOpenChange={vi.fn()} propertyId="prop-123" />
    )

    // A failed lease load must explain itself, not leave an empty dropdown
    // the user cannot pick from (lease_id is required to submit).
    expect(screen.getByTestId('sb1103-leases-error')).toBeInTheDocument()
    expect(
      screen.getByText(/couldn.t load this property.s leases/i)
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('does not show the lease-load error when leases load successfully', () => {
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [{ id: 'lease-1', tenant_name: 'Acme Corp' }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)

    renderWithProviders(
      <SB1103RequestDialog open onOpenChange={vi.fn()} propertyId="prop-123" />
    )

    expect(screen.queryByTestId('sb1103-leases-error')).not.toBeInTheDocument()
  })

  it('does not submit again while a save is already in flight', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreateSB1103Request').mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [{ id: 'lease-1', tenant_name: 'Acme Corp' }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never)

    renderWithProviders(
      <SB1103RequestDialog open onOpenChange={vi.fn()} propertyId="prop-123" />
    )

    // Fill the form with valid data so the submit clears schema validation and
    // actually reaches onSubmit (and the guard) — otherwise validation, not the
    // guard, would block the mutation. request_date defaults to today.
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Acme Corp' }))
    await user.type(screen.getByLabelText(/Requestor Name/i), 'Jane Smith')
    await user.type(
      screen.getByLabelText(/Requestor Email/i),
      'jane@company.com'
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Requestor Name/i) as HTMLInputElement).value
      ).toBe('Jane Smith')
    })

    // Fire a submit directly on the form to simulate the keyboard-Enter race the
    // disabled button cannot catch.
    const formEl = screen.getByLabelText(/Requestor Name/i).closest('form')
    expect(formEl).not.toBeNull()
    fireEvent.submit(formEl as HTMLFormElement)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
