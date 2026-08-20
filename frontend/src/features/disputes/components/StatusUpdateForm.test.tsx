/**
 * StatusUpdateForm Tests
 *
 * Tests for the dispute status update form component.
 * State machine: OPEN → UNDER_REVIEW → RESOLVED/REJECTED → CLOSED
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { StatusUpdateForm } from './StatusUpdateForm'
import type { DisputeStatus } from '@/api/hooks'

describe('StatusUpdateForm', () => {
  const defaultProps = {
    currentStatus: 'open' as DisputeStatus,
    onSubmit: vi.fn(),
    isLoading: false,
  }

  it('shows only valid next states from open', () => {
    render(<StatusUpdateForm {...defaultProps} currentStatus="open" />)

    // open can only go to under_review
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()

    // Should only have Under Review as an option
    expect(screen.getByText(/Under Review/i)).toBeInTheDocument()
  })

  it('shows valid next states from under_review', async () => {
    render(<StatusUpdateForm {...defaultProps} currentStatus="under_review" />)

    // under_review can go to resolved or rejected
    const select = screen.getByRole('combobox')
    await userEvent.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Resolved/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: /Rejected/i })
      ).toBeInTheDocument()
    })
  })

  it('shows closed as next state from resolved', async () => {
    render(<StatusUpdateForm {...defaultProps} currentStatus="resolved" />)

    const select = screen.getByRole('combobox')
    await userEvent.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Closed/i })
      ).toBeInTheDocument()
    })
  })

  it('shows resolution summary field when transitioning to resolved', async () => {
    const user = userEvent.setup()
    render(<StatusUpdateForm {...defaultProps} currentStatus="under_review" />)

    // Initially no resolution summary field
    expect(
      screen.queryByLabelText(/resolution summary/i)
    ).not.toBeInTheDocument()

    // Select RESOLVED
    const select = screen.getByRole('combobox')
    await user.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Resolved/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Resolved/i }))

    // Now resolution summary should appear
    await waitFor(() => {
      expect(screen.getByLabelText(/resolution summary/i)).toBeInTheDocument()
    })
  })

  it('requires resolution summary when transitioning to resolved', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <StatusUpdateForm
        {...defaultProps}
        currentStatus="under_review"
        onSubmit={onSubmit}
      />
    )

    // Select RESOLVED
    const select = screen.getByRole('combobox')
    await user.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Resolved/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Resolved/i }))

    // Try to submit without resolution summary
    const submitButton = screen.getByRole('button', { name: /update status/i })
    await user.click(submitButton)

    // Should show validation error
    await waitFor(() => {
      expect(
        screen.getByText(/resolution summary is required/i)
      ).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
    // Error text uses the AA-contrast "strong" red, matching the rest of the
    // disputes surface (F-287), not the bright mid-red that fails AA on white.
    expect(screen.getByRole('alert')).toHaveClass('text-destructive-strong')
  })

  it('calls onSubmit with correct data when form is valid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <StatusUpdateForm
        {...defaultProps}
        currentStatus="under_review"
        onSubmit={onSubmit}
      />
    )

    // Select RESOLVED
    const select = screen.getByRole('combobox')
    await user.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Resolved/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Resolved/i }))

    // Fill in resolution summary
    await waitFor(() => {
      expect(screen.getByLabelText(/resolution summary/i)).toBeInTheDocument()
    })

    const textarea = screen.getByLabelText(/resolution summary/i)
    await user.type(textarea, 'Issue resolved by adjusting charges')

    // Submit
    const submitButton = screen.getByRole('button', { name: /update status/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        status: 'resolved',
        resolution_summary: 'Issue resolved by adjusting charges',
      })
    })
  })

  it('shows loading state on submit button', () => {
    render(<StatusUpdateForm {...defaultProps} isLoading={true} />)

    const submitButton = screen.getByRole('button', { name: /updating/i })
    expect(submitButton).toBeDisabled()
  })

  it('clears the selection and summary when the dispute status changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <StatusUpdateForm {...defaultProps} currentStatus="under_review" />
    )

    // Select RESOLVED and fill in a resolution summary
    await user.click(screen.getByRole('combobox'))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Resolved/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('option', { name: /Resolved/i }))

    const textarea = await screen.findByLabelText(/resolution summary/i)
    await user.type(textarea, 'Adjusted the charge')
    expect(textarea).toHaveValue('Adjusted the charge')

    // Parent refetches after a successful update; status advances to resolved
    rerender(<StatusUpdateForm {...defaultProps} currentStatus="resolved" />)

    // Selection resets to the placeholder and the summary field is gone
    await waitFor(() => {
      expect(screen.getByText(/select new status/i)).toBeInTheDocument()
    })
    expect(
      screen.queryByLabelText(/resolution summary/i)
    ).not.toBeInTheDocument()
  })

  it('returns null when no valid transitions are available (closed)', () => {
    const { container } = render(
      <StatusUpdateForm {...defaultProps} currentStatus="closed" />
    )

    // closed has no valid transitions, so component should render nothing
    expect(container.firstChild).toBeNull()
  })
})
