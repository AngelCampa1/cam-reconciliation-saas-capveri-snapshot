import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RejectDialog } from './RejectDialog'

describe('RejectDialog', () => {
  const mockOnOpenChange = vi.fn()
  const mockOnConfirm = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders dialog when open', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('reject-dialog')).toBeInTheDocument()
      expect(screen.getByText('Reject Extraction')).toBeInTheDocument()
      expect(
        screen.getByText(/Select a reason for rejection/i)
      ).toBeInTheDocument()
    })

    it('does not render dialog when closed', () => {
      render(
        <RejectDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.queryByTestId('reject-dialog')).not.toBeInTheDocument()
    })

    it('renders all rejection reason options', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(
        screen.getByTestId('reason-option-poor_ocr_quality')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('reason-option-wrong_document_type')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('reason-option-missing_pages')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('reason-option-incorrect_extraction')
      ).toBeInTheDocument()
      expect(screen.getByTestId('reason-option-other')).toBeInTheDocument()
    })

    it('renders reason labels and descriptions', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('Poor OCR Quality')).toBeInTheDocument()
      expect(
        screen.getByText('Text extraction was unclear or corrupted')
      ).toBeInTheDocument()
      expect(screen.getByText('Wrong Document Type')).toBeInTheDocument()
      expect(screen.getByText('Not a lease document')).toBeInTheDocument()
    })
  })

  describe('Accidental-dismissal guard', () => {
    it('closes on Escape when the form is untouched', async () => {
      const user = userEvent.setup()
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.keyboard('{Escape}')

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('does not close on Escape once notes are typed', async () => {
      const user = userEvent.setup()
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.type(screen.getByTestId('rejection-notes'), 'wrong values')
      await user.keyboard('{Escape}')

      expect(mockOnOpenChange).not.toHaveBeenCalled()
      expect(screen.getByTestId('reject-dialog')).toBeInTheDocument()
    })

    it('renders notes textarea', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('rejection-notes')).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText('Provide additional context...')
      ).toBeInTheDocument()
    })

    it('renders requeue checkbox', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('requeue-checkbox')).toBeInTheDocument()
      expect(screen.getByText(/Re-queue for extraction/i)).toBeInTheDocument()
    })

    it('renders action buttons', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-button')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('allows selecting a rejection reason', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      const poorQualityOption = screen.getByLabelText(/Poor OCR Quality/i)
      await user.click(poorQualityOption)

      expect(poorQualityOption).toBeChecked()
    })

    it('allows typing in notes field', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      const notesField = screen.getByTestId('rejection-notes')
      await user.type(notesField, 'Test notes')

      expect(notesField).toHaveValue('Test notes')
    })

    it('allows checking requeue checkbox', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      const requeueCheckbox = screen.getByTestId('requeue-checkbox')
      await user.click(requeueCheckbox)

      expect(requeueCheckbox).toBeChecked()
    })

    it('calls onConfirm when confirm button clicked with reason selected', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Select reason
      await user.click(screen.getByLabelText(/Poor OCR Quality/i))

      // Click confirm
      await user.click(screen.getByTestId('confirm-button'))

      expect(mockOnConfirm).toHaveBeenCalledWith(
        'poor_ocr_quality',
        null,
        false
      )
    })

    it('calls onConfirm with notes when provided', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Select reason and add notes
      await user.click(screen.getByLabelText(/Wrong Document Type/i))
      await user.type(
        screen.getByTestId('rejection-notes'),
        'This is not a lease'
      )

      // Click confirm
      await user.click(screen.getByTestId('confirm-button'))

      expect(mockOnConfirm).toHaveBeenCalledWith(
        'wrong_document_type',
        'This is not a lease',
        false
      )
    })

    it('calls onConfirm with requeue flag when checked', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Select reason and check requeue
      await user.click(screen.getByLabelText(/Missing Pages/i))
      await user.click(screen.getByTestId('requeue-checkbox'))

      // Click confirm
      await user.click(screen.getByTestId('confirm-button'))

      expect(mockOnConfirm).toHaveBeenCalledWith('missing_pages', null, true)
    })

    it('calls onOpenChange when cancel button clicked', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByTestId('cancel-button'))

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('resets form after successful submission', async () => {
      const user = userEvent.setup()

      const { rerender } = render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Fill out form
      await user.click(screen.getByLabelText(/Other/i))
      await user.type(screen.getByTestId('rejection-notes'), 'Test notes')
      await user.click(screen.getByTestId('requeue-checkbox'))

      // Submit
      await user.click(screen.getByTestId('confirm-button'))

      // Reopen dialog
      rerender(
        <RejectDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )
      rerender(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Form should be reset
      expect(screen.getByTestId('rejection-notes')).toHaveValue('')
      expect(screen.getByTestId('requeue-checkbox')).not.toBeChecked()
    })
  })

  describe('Form Validation', () => {
    it('disables confirm button when no reason selected', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('confirm-button')).toBeDisabled()
    })

    it('enables confirm button when reason selected', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByLabelText(/Poor OCR Quality/i))

      expect(screen.getByTestId('confirm-button')).not.toBeDisabled()
    })

    it('does not require notes to be filled', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByLabelText(/Poor OCR Quality/i))

      // Confirm button should be enabled even without notes
      expect(screen.getByTestId('confirm-button')).not.toBeDisabled()
    })
  })

  describe('Loading State', () => {
    it('disables all controls when submitting', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={true}
        />
      )

      expect(screen.getByTestId('rejection-notes')).toBeDisabled()
      expect(screen.getByTestId('requeue-checkbox')).toBeDisabled()
      expect(screen.getByTestId('confirm-button')).toBeDisabled()
      expect(screen.getByTestId('cancel-button')).toBeDisabled()
    })

    it('shows submitting text when submitting', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={true}
        />
      )

      expect(screen.getByText('Rejecting...')).toBeInTheDocument()
    })

    it('shows confirm text when not submitting', () => {
      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('Confirm Rejection')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty notes as null', async () => {
      const user = userEvent.setup()

      render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByLabelText(/Other/i))
      // Don't type anything in notes
      await user.click(screen.getByTestId('confirm-button'))

      expect(mockOnConfirm).toHaveBeenCalledWith('other', null, false)
    })

    it('resets form when dialog is closed without submitting', async () => {
      const user = userEvent.setup()

      const { rerender } = render(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      // Fill out form
      await user.click(screen.getByLabelText(/Other/i))
      await user.type(screen.getByTestId('rejection-notes'), 'Test')

      // Close dialog
      await user.click(screen.getByTestId('cancel-button'))

      // Reopen
      rerender(
        <RejectDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('rejection-notes')).toHaveValue('')
    })
  })
})
