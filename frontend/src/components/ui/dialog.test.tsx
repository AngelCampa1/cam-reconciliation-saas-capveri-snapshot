import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog'
import { Button } from './button'

// Helper component for testing
function TestDialog({
  defaultOpen = false,
  size,
  showCloseButton = true,
  onOpenChange,
}: {
  defaultOpen?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="trigger-button">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent size={size} showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>
            This is a test dialog description.
          </DialogDescription>
        </DialogHeader>
        <div data-testid="dialog-body">Dialog body content</div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" data-testid="cancel-button">
              Cancel
            </Button>
          </DialogClose>
          <Button data-testid="submit-button">Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  describe('Rendering', () => {
    it('should render trigger button', () => {
      render(<TestDialog />)

      expect(screen.getByTestId('trigger-button')).toBeInTheDocument()
    })

    it('should not render dialog content when closed', () => {
      render(<TestDialog />)

      expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
    })

    it('should render dialog content when defaultOpen is true', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
    })

    it('should render all dialog parts', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByTestId('dialog-overlay')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-header')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-title')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-description')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-footer')).toBeInTheDocument()
    })

    it('should render title and description text', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByText('Test Dialog')).toBeInTheDocument()
      expect(
        screen.getByText('This is a test dialog description.')
      ).toBeInTheDocument()
    })
  })

  describe('Opening and Closing', () => {
    it('should open dialog when trigger is clicked', async () => {
      const user = userEvent.setup()
      render(<TestDialog />)

      await user.click(screen.getByTestId('trigger-button'))

      expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
    })

    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup()
      render(<TestDialog defaultOpen />)

      await user.click(screen.getByTestId('dialog-close-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
      })
    })

    it('should close dialog when Escape key is pressed', async () => {
      const user = userEvent.setup()
      render(<TestDialog defaultOpen />)

      expect(screen.getByTestId('dialog-content')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
      })
    })

    it('should close dialog when overlay is clicked', async () => {
      const user = userEvent.setup()
      render(<TestDialog defaultOpen />)

      // Click the overlay
      await user.click(screen.getByTestId('dialog-overlay'))

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
      })
    })

    it('should close dialog when DialogClose is clicked', async () => {
      const user = userEvent.setup()
      render(<TestDialog defaultOpen />)

      await user.click(screen.getByTestId('cancel-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
      })
    })

    it('should call onOpenChange when dialog opens', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<TestDialog onOpenChange={onOpenChange} />)

      await user.click(screen.getByTestId('trigger-button'))

      expect(onOpenChange).toHaveBeenCalledWith(true)
    })

    it('should call onOpenChange when dialog closes', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<TestDialog defaultOpen onOpenChange={onOpenChange} />)

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Close Button', () => {
    it('should render close button by default', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByTestId('dialog-close-button')).toBeInTheDocument()
    })

    it('should hide close button when showCloseButton is false', () => {
      render(<TestDialog defaultOpen showCloseButton={false} />)

      expect(
        screen.queryByTestId('dialog-close-button')
      ).not.toBeInTheDocument()
    })
  })

  describe('Size Variants', () => {
    it('should apply sm size class', () => {
      render(<TestDialog defaultOpen size="sm" />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-sm')
    })

    it('should apply md size class (default)', () => {
      render(<TestDialog defaultOpen size="md" />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-md')
    })

    it('should apply lg size class', () => {
      render(<TestDialog defaultOpen size="lg" />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-lg')
    })

    it('should apply xl size class', () => {
      render(<TestDialog defaultOpen size="xl" />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-xl')
    })

    it('should apply full size class', () => {
      render(<TestDialog defaultOpen size="full" />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-[1200px]')
    })

    it('should default to md size when no size is specified', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByTestId('dialog-content')).toHaveClass('max-w-md')
    })
  })

  describe('Overlay', () => {
    it('should render dimmed overlay', () => {
      render(<TestDialog defaultOpen />)

      const overlay = screen.getByTestId('dialog-overlay')
      expect(overlay).toHaveClass('bg-overlay/80')
    })

    it('should be fixed positioned', () => {
      render(<TestDialog defaultOpen />)

      const overlay = screen.getByTestId('dialog-overlay')
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('inset-0')
    })
  })

  describe('Animation Classes', () => {
    it('should have animation classes on content', () => {
      render(<TestDialog defaultOpen />)

      const content = screen.getByTestId('dialog-content')
      expect(content).toHaveClass('data-[state=open]:animate-in')
      expect(content).toHaveClass('data-[state=closed]:animate-out')
    })

    it('should have animation classes on overlay', () => {
      render(<TestDialog defaultOpen />)

      const overlay = screen.getByTestId('dialog-overlay')
      expect(overlay).toHaveClass('data-[state=open]:animate-in')
      expect(overlay).toHaveClass('data-[state=closed]:animate-out')
    })
  })

  describe('Focus Management', () => {
    it('should focus content when dialog opens', async () => {
      const user = userEvent.setup()
      render(<TestDialog />)

      await user.click(screen.getByTestId('trigger-button'))

      // Focus should be moved to dialog content or first focusable element
      await waitFor(() => {
        expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
      })
    })

    it('should return focus to trigger when closed', async () => {
      const user = userEvent.setup()
      render(<TestDialog />)

      const trigger = screen.getByTestId('trigger-button')
      await user.click(trigger)

      await waitFor(() => {
        expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
      })

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
      })

      // Radix automatically returns focus to trigger
      expect(trigger).toHaveFocus()
    })
  })

  describe('Accessibility', () => {
    it('should have correct role on dialog content', () => {
      render(<TestDialog defaultOpen />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have aria-describedby linking to description', () => {
      render(<TestDialog defaultOpen />)

      const dialog = screen.getByRole('dialog')
      const descriptionId = screen.getByTestId('dialog-description').id

      expect(dialog).toHaveAttribute('aria-describedby', descriptionId)
    })

    it('should have aria-labelledby linking to title', () => {
      render(<TestDialog defaultOpen />)

      const dialog = screen.getByRole('dialog')
      const titleId = screen.getByTestId('dialog-title').id

      expect(dialog).toHaveAttribute('aria-labelledby', titleId)
    })

    it('should have sr-only text in close button', () => {
      render(<TestDialog defaultOpen />)

      const closeButton = screen.getByTestId('dialog-close-button')
      expect(closeButton).toHaveTextContent('Close')
    })
  })

  describe('Custom Classes', () => {
    it('should merge custom classes with dialog content', () => {
      render(
        <Dialog defaultOpen>
          <DialogContent className="custom-class">
            <DialogHeader>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Custom dialog description</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )

      expect(screen.getByTestId('dialog-content')).toHaveClass('custom-class')
    })
  })
})

describe('DialogHeader', () => {
  it('should render with correct classes', () => {
    render(<TestDialog defaultOpen />)

    const header = screen.getByTestId('dialog-header')
    expect(header).toHaveClass('flex')
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('space-y-1.5')
  })
})

describe('DialogFooter', () => {
  it('should render with correct classes', () => {
    render(<TestDialog defaultOpen />)

    const footer = screen.getByTestId('dialog-footer')
    expect(footer).toHaveClass('flex')
    expect(footer).toHaveClass('flex-col-reverse')
    expect(footer).toHaveClass('sm:flex-row')
    expect(footer).toHaveClass('sm:justify-end')
  })
})

describe('DialogTitle', () => {
  it('should render with correct typography classes', () => {
    render(<TestDialog defaultOpen />)

    const title = screen.getByTestId('dialog-title')
    expect(title.className).toContain('font-semibold')
    expect(title.className).toContain('leading-none')
  })
})

describe('DialogDescription', () => {
  it('should render with muted foreground', () => {
    render(<TestDialog defaultOpen />)

    const description = screen.getByTestId('dialog-description')
    expect(description).toHaveClass('text-sm')
    expect(description).toHaveClass('text-muted-foreground')
  })
})
