/**
 * Tests for InlineLeaseForm (TDD — written before implementation).
 *
 * The InlineLeaseForm component is a minimal inline form for creating leases
 * directly inside the onboarding wizard Step 2. It uses useCreateLease
 * internally and converts pro_rata_share from % to decimal on submit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Unit } from '@/api/generated/types.gen'

// Use vi.hoisted so these variables are available inside the vi.mock factory
const { mockMutate, mockUseCreateLease } = vi.hoisted(() => {
  const mockMutate = vi.fn()
  const mockUseCreateLease = vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  }))
  return { mockMutate, mockUseCreateLease }
})

vi.mock('@/api/hooks', () => ({
  useCreateLease: mockUseCreateLease,
}))

// Import after mocks are in place
import { InlineLeaseForm } from './InlineLeaseForm'

const PROPERTY_ID = '11111111-1111-1111-1111-111111111111'

const mockUnit: Unit = {
  id: '22222222-2222-2222-2222-222222222222',
  property_id: PROPERTY_ID,
  unit_number: 'Suite 101',
  rentable_sqft: '1000',
  usable_sqft: '950',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('InlineLeaseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCreateLease.mockReturnValue({ mutate: mockMutate, isPending: false })
  })

  it('renders all required fields', () => {
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    expect(screen.getByLabelText(/tenant name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/lease start/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/lease end/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pro.rata share/i)).toBeInTheDocument()
  })

  it('hides unit dropdown when no units provided', () => {
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)
    expect(screen.queryByLabelText(/^unit$/i)).not.toBeInTheDocument()
  })

  it('shows unit dropdown when units are provided', () => {
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[mockUnit]} />)
    expect(screen.getByLabelText(/^unit$/i)).toBeInTheDocument()
  })

  it('blocks submit with empty tenant name', async () => {
    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    await user.type(screen.getByLabelText(/lease start/i), '2024-01-01')
    await user.type(screen.getByLabelText(/lease end/i), '2024-12-31')
    await user.type(screen.getByLabelText(/pro.rata share/i), '15')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
    // Validation errors use the AA-contrast "strong" red, not the bright
    // text-destructive that fails WCAG AA on white (matches F-287/F-381/F-382).
    expect(screen.getByText(/at least 2 characters/i)).toHaveClass(
      'text-destructive-strong'
    )
  })

  it('blocks submit when end date is before start date', async () => {
    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    await user.type(screen.getByLabelText(/tenant name/i), 'ACME Corp')
    await user.type(screen.getByLabelText(/lease start/i), '2024-12-31')
    await user.type(screen.getByLabelText(/lease end/i), '2024-01-01')
    await user.type(screen.getByLabelText(/pro.rata share/i), '15')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(screen.getByText(/end date must be after/i)).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('blocks submit when pro-rata share is 0', async () => {
    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    await user.type(screen.getByLabelText(/tenant name/i), 'ACME Corp')
    await user.type(screen.getByLabelText(/lease start/i), '2024-01-01')
    await user.type(screen.getByLabelText(/lease end/i), '2024-12-31')
    await user.type(screen.getByLabelText(/pro.rata share/i), '0')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(screen.getByText(/greater than 0/i)).toBeInTheDocument()
    })
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('calls mutate with pro_rata_share converted from percent to decimal', async () => {
    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    await user.type(screen.getByLabelText(/tenant name/i), 'ACME Corp')
    await user.type(screen.getByLabelText(/lease start/i), '2024-01-01')
    await user.type(screen.getByLabelText(/lease end/i), '2024-12-31')
    await user.type(screen.getByLabelText(/pro.rata share/i), '15')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          property_id: PROPERTY_ID,
          tenant_name: 'ACME Corp',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          status: 'active',
          recovery_profile: expect.objectContaining({
            pro_rata_share: '0.15',
          }),
        }),
        expect.anything()
      )
    })
  })

  it('submits pro_rata_share as a drift-free decimal string (F-429)', async () => {
    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    await user.type(screen.getByLabelText(/tenant name/i), 'ACME Corp')
    await user.type(screen.getByLabelText(/lease start/i), '2024-01-01')
    await user.type(screen.getByLabelText(/lease end/i), '2024-12-31')
    // 1.4 / 100 in IEEE-754 is 0.013999999999999999; the string helper must
    // submit the exact decimal "0.014", not the drifted value.
    await user.type(screen.getByLabelText(/pro.rata share/i), '1.4')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          recovery_profile: expect.objectContaining({
            pro_rata_share: '0.014',
          }),
        }),
        expect.anything()
      )
    })
  })

  it('shows loading state while mutation is in flight', () => {
    mockUseCreateLease.mockReturnValue({ mutate: mockMutate, isPending: true })

    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })

  it('resets form after successful submission', async () => {
    mockMutate.mockImplementation(
      (_data: unknown, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      }
    )

    const user = userEvent.setup()
    render(<InlineLeaseForm propertyId={PROPERTY_ID} units={[]} />)

    const tenantInput = screen.getByLabelText(/tenant name/i)
    await user.type(tenantInput, 'ACME Corp')
    await user.type(screen.getByLabelText(/lease start/i), '2024-01-01')
    await user.type(screen.getByLabelText(/lease end/i), '2024-12-31')
    await user.type(screen.getByLabelText(/pro.rata share/i), '15')
    await user.click(screen.getByRole('button', { name: /add lease/i }))

    await waitFor(() => {
      expect(tenantInput).toHaveValue('')
    })
  })
})
