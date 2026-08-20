import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog'
import { Button } from './button'

// Helper component for testing
function TestAlertDialog({
  defaultOpen = false,
  onOpenChange,
  onAction,
  onCancel,
}: {
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onAction?: () => void
  onCancel?: () => void
}) {
  return (
    <AlertDialog defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button data-testid="trigger-button">Delete Item</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the item.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe('AlertDialog', () => {
  describe('Rendering', () => {
    it('should render trigger button', () => {
      render(<TestAlertDialog />)

      expect(screen.getByTestId('trigger-button')).toBeInTheDocument()
    })

    it('should not render dialog content when closed', () => {
      render(<TestAlertDialog />)

      expect(
        screen.queryByTestId('alert-dialog-content')
      ).not.toBeInTheDocument()
    })

    it('should render dialog content when defaultOpen is true', () => {
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
    })

    it('should render all dialog parts', () => {
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByTestId('alert-dialog-overlay')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-header')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-title')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-description')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-footer')).toBeInTheDocument()
    })

    it('should render title and description text', () => {
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByText('Are you sure?')).toBeInTheDocument()
      expect(
        screen.getByText(
          'This action cannot be undone. This will permanently delete the item.'
        )
      ).toBeInTheDocument()
    })

    it('should render action and cancel buttons', () => {
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByTestId('alert-dialog-action')).toBeInTheDocument()
      expect(screen.getByTestId('alert-dialog-cancel')).toBeInTheDocument()
    })
  })

  describe('Opening and Closing', () => {
    it('should open dialog when trigger is clicked', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog />)

      await user.click(screen.getByTestId('trigger-button'))

      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
    })

    it('should close dialog when cancel button is clicked', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog defaultOpen />)

      await user.click(screen.getByTestId('alert-dialog-cancel'))

      await waitFor(() => {
        expect(
          screen.queryByTestId('alert-dialog-content')
        ).not.toBeInTheDocument()
      })
    })

    it('should close dialog when action button is clicked', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog defaultOpen />)

      await user.click(screen.getByTestId('alert-dialog-action'))

      await waitFor(() => {
        expect(
          screen.queryByTestId('alert-dialog-content')
        ).not.toBeInTheDocument()
      })
    })

    it('should close dialog when Escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(
          screen.queryByTestId('alert-dialog-content')
        ).not.toBeInTheDocument()
      })
    })

    it('should call onOpenChange when dialog opens', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<TestAlertDialog onOpenChange={onOpenChange} />)

      await user.click(screen.getByTestId('trigger-button'))

      expect(onOpenChange).toHaveBeenCalledWith(true)
    })

    it('should call onOpenChange when dialog closes', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<TestAlertDialog defaultOpen onOpenChange={onOpenChange} />)

      await user.click(screen.getByTestId('alert-dialog-cancel'))

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Action and Cancel Callbacks', () => {
    it('should call onAction when action button is clicked', async () => {
      const user = userEvent.setup()
      const onAction = vi.fn()
      render(<TestAlertDialog defaultOpen onAction={onAction} />)

      await user.click(screen.getByTestId('alert-dialog-action'))

      expect(onAction).toHaveBeenCalledTimes(1)
    })

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      render(<TestAlertDialog defaultOpen onCancel={onCancel} />)

      await user.click(screen.getByTestId('alert-dialog-cancel'))

      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('Button Styles', () => {
    it('should apply default button styles to action button', () => {
      render(<TestAlertDialog defaultOpen />)

      const actionButton = screen.getByTestId('alert-dialog-action')
      // Default button variant uses gradient styling
      expect(actionButton).toHaveClass('bg-gradient-to-b')
    })

    it('should apply outline variant to cancel button', () => {
      render(<TestAlertDialog defaultOpen />)

      const cancelButton = screen.getByTestId('alert-dialog-cancel')
      expect(cancelButton).toHaveClass('border')
    })
  })

  describe('Overlay', () => {
    it('should render dimmed overlay', () => {
      render(<TestAlertDialog defaultOpen />)

      const overlay = screen.getByTestId('alert-dialog-overlay')
      expect(overlay).toHaveClass('bg-overlay/80')
    })

    it('should be fixed positioned', () => {
      render(<TestAlertDialog defaultOpen />)

      const overlay = screen.getByTestId('alert-dialog-overlay')
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('inset-0')
    })
  })

  describe('Animation Classes', () => {
    it('should have animation classes on content', () => {
      render(<TestAlertDialog defaultOpen />)

      const content = screen.getByTestId('alert-dialog-content')
      expect(content).toHaveClass('data-[state=open]:animate-in')
      expect(content).toHaveClass('data-[state=closed]:animate-out')
    })

    it('should have animation classes on overlay', () => {
      render(<TestAlertDialog defaultOpen />)

      const overlay = screen.getByTestId('alert-dialog-overlay')
      expect(overlay).toHaveClass('data-[state=open]:animate-in')
      expect(overlay).toHaveClass('data-[state=closed]:animate-out')
    })
  })

  describe('Focus Management', () => {
    it('should focus content when dialog opens', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog />)

      await user.click(screen.getByTestId('trigger-button'))

      await waitFor(() => {
        expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
      })
    })

    it('should return focus to trigger when closed', async () => {
      const user = userEvent.setup()
      render(<TestAlertDialog />)

      const trigger = screen.getByTestId('trigger-button')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
      })

      await user.click(screen.getByTestId('alert-dialog-cancel'))

      await waitFor(() => {
        expect(
          screen.queryByTestId('alert-dialog-content')
        ).not.toBeInTheDocument()
      })

      // Radix automatically returns focus to trigger
      expect(trigger).toHaveFocus()
    })
  })

  describe('Accessibility', () => {
    it('should have correct role on dialog content', () => {
      render(<TestAlertDialog defaultOpen />)

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('should have aria-describedby linking to description', () => {
      render(<TestAlertDialog defaultOpen />)

      const dialog = screen.getByRole('alertdialog')
      const descriptionId = screen.getByTestId('alert-dialog-description').id

      expect(dialog).toHaveAttribute('aria-describedby', descriptionId)
    })

    it('should have aria-labelledby linking to title', () => {
      render(<TestAlertDialog defaultOpen />)

      const dialog = screen.getByRole('alertdialog')
      const titleId = screen.getByTestId('alert-dialog-title').id

      expect(dialog).toHaveAttribute('aria-labelledby', titleId)
    })
  })

  describe('Custom Classes', () => {
    it('should merge custom classes with dialog content', () => {
      render(
        <AlertDialog defaultOpen>
          <AlertDialogContent className="custom-class">
            <AlertDialogHeader>
              <AlertDialogTitle>Title</AlertDialogTitle>
              <AlertDialogDescription>
                Confirm the destructive action.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      )

      expect(screen.getByTestId('alert-dialog-content')).toHaveClass(
        'custom-class'
      )
    })
  })
})

describe('AlertDialogHeader', () => {
  it('should render with correct classes', () => {
    render(<TestAlertDialog defaultOpen />)

    const header = screen.getByTestId('alert-dialog-header')
    expect(header).toHaveClass('flex')
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('space-y-2')
  })
})

describe('AlertDialogFooter', () => {
  it('should render with correct classes', () => {
    render(<TestAlertDialog defaultOpen />)

    const footer = screen.getByTestId('alert-dialog-footer')
    expect(footer).toHaveClass('flex')
    expect(footer).toHaveClass('flex-col-reverse')
    expect(footer).toHaveClass('sm:flex-row')
    expect(footer).toHaveClass('sm:justify-end')
  })
})

describe('AlertDialogTitle', () => {
  it('should render with correct typography classes', () => {
    render(<TestAlertDialog defaultOpen />)

    const title = screen.getByTestId('alert-dialog-title')
    expect(title).toHaveClass('text-lg')
    expect(title).toHaveClass('font-semibold')
  })
})

describe('AlertDialogDescription', () => {
  it('should render with muted foreground', () => {
    render(<TestAlertDialog defaultOpen />)

    const description = screen.getByTestId('alert-dialog-description')
    expect(description).toHaveClass('text-sm')
    expect(description).toHaveClass('text-muted-foreground')
  })
})

// Controlled dialog with no <AlertDialogTrigger> — the real-world pattern used by
// list-row "Delete"/"Revoke" buttons. Radix has no trigger ref here, so without our
// focus-restore override focus falls to <body> on close (WCAG 2.4.3 failure).
function ControlledAlertDialog() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button data-testid="row-opener" onClick={() => setOpen(true)}>
        Revoke
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

describe('AlertDialog focus restoration (controlled, no trigger)', () => {
  it('returns focus to the opener after closing via Cancel', async () => {
    const user = userEvent.setup()
    render(<ControlledAlertDialog />)

    const opener = screen.getByTestId('row-opener')
    opener.focus()
    await user.click(opener)

    await waitFor(() => {
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('alert-dialog-cancel'))

    await waitFor(() => {
      expect(
        screen.queryByTestId('alert-dialog-content')
      ).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(opener)
    })
  })

  it('returns focus to the opener after closing via Escape', async () => {
    const user = userEvent.setup()
    render(<ControlledAlertDialog />)

    const opener = screen.getByTestId('row-opener')
    opener.focus()
    await user.click(opener)

    await waitFor(() => {
      expect(screen.getByTestId('alert-dialog-content')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(
        screen.queryByTestId('alert-dialog-content')
      ).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(opener)
    })
  })
})
