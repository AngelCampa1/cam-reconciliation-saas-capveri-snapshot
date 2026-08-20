/**
 * AddCommentForm Tests
 *
 * Tests for the add comment form component.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AddCommentForm } from './AddCommentForm'

describe('AddCommentForm', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
  }

  it('renders textarea and submit button', () => {
    render(<AddCommentForm {...defaultProps} />)

    expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add comment/i })
    ).toBeInTheDocument()
  })

  it('shows internal toggle checkbox for landlord', () => {
    render(<AddCommentForm {...defaultProps} showInternalToggle />)

    expect(screen.getByLabelText(/mark as internal/i)).toBeInTheDocument()
    // a11y: shadcn Checkbox renders as a role=checkbox button, which a sibling
    // <Label htmlFor> does not name — assert the checkbox carries its own accessible name.
    expect(
      screen.getByRole('checkbox', { name: /mark as internal/i })
    ).toBeInTheDocument()
  })

  it('hides internal toggle when showInternalToggle is false', () => {
    render(<AddCommentForm {...defaultProps} showInternalToggle={false} />)

    expect(screen.queryByLabelText(/mark as internal/i)).not.toBeInTheDocument()
  })

  it('submits comment with content', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AddCommentForm {...defaultProps} onSubmit={onSubmit} />)

    const textarea = screen.getByPlaceholderText(/add a comment/i)
    await user.type(textarea, 'This is my comment')

    const submitButton = screen.getByRole('button', { name: /add comment/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        content: 'This is my comment',
        is_internal: false,
      })
    })
  })

  it('submits internal comment when toggle is checked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AddCommentForm
        {...defaultProps}
        onSubmit={onSubmit}
        showInternalToggle
      />
    )

    const textarea = screen.getByPlaceholderText(/add a comment/i)
    await user.type(textarea, 'Internal note')

    const checkbox = screen.getByLabelText(/mark as internal/i)
    await user.click(checkbox)

    const submitButton = screen.getByRole('button', { name: /add comment/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        content: 'Internal note',
        is_internal: true,
      })
    })
  })

  it('clears form after successful submission', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AddCommentForm
        {...defaultProps}
        onSubmit={onSubmit}
        showInternalToggle
      />
    )

    const textarea = screen.getByPlaceholderText(/add a comment/i)
    await user.type(textarea, 'Test comment')

    const checkbox = screen.getByLabelText(/mark as internal/i)
    await user.click(checkbox)

    const submitButton = screen.getByRole('button', { name: /add comment/i })
    await user.click(submitButton)

    // Wait for submit then check form is cleared
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })

    expect(textarea).toHaveValue('')
    expect(checkbox).not.toBeChecked()
  })

  it('retains typed content when submission fails so the user can retry', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('network error'))
    render(
      <AddCommentForm
        {...defaultProps}
        onSubmit={onSubmit}
        showInternalToggle
      />
    )

    const textarea = screen.getByPlaceholderText(/add a comment/i)
    await user.type(textarea, 'Comment that should survive a failure')

    const checkbox = screen.getByLabelText(/mark as internal/i)
    await user.click(checkbox)

    const submitButton = screen.getByRole('button', { name: /add comment/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })

    // A failed submit must not discard the typed comment or reset the toggle.
    expect(textarea).toHaveValue('Comment that should survive a failure')
    expect(checkbox).toBeChecked()
  })

  it('prevents submission with empty content', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AddCommentForm {...defaultProps} onSubmit={onSubmit} />)

    const submitButton = screen.getByRole('button', { name: /add comment/i })
    await user.click(submitButton)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows loading state on submit button', () => {
    render(<AddCommentForm {...defaultProps} isLoading />)

    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled()
  })
})
