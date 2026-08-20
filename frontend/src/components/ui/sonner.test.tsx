import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster, toast } from './sonner'

// Helper to render Toaster
function renderWithToaster() {
  return render(<Toaster />)
}

describe('Toaster', () => {
  afterEach(() => {
    // Dismiss all toasts between tests
    toast.dismiss()
  })

  describe('Rendering', () => {
    it('should render the toaster container with ARIA live region', () => {
      renderWithToaster()

      // Sonner renders a section with aria-live for screen readers
      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
      expect(toaster).toHaveAttribute('aria-live', 'polite')
    })

    it('should have accessible label', () => {
      renderWithToaster()

      const toaster = screen.getByRole('region')
      expect(toaster).toHaveAttribute('aria-label')
    })
  })

  describe('Toast Variants', () => {
    it('should render success toast', async () => {
      renderWithToaster()

      toast.success('Operation successful')

      await waitFor(() => {
        expect(screen.getByText('Operation successful')).toBeInTheDocument()
      })
    })

    it('should render error toast', async () => {
      renderWithToaster()

      toast.error('Something went wrong')

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      })
    })

    it('should render warning toast', async () => {
      renderWithToaster()

      toast.warning('Please be careful')

      await waitFor(() => {
        expect(screen.getByText('Please be careful')).toBeInTheDocument()
      })
    })

    it('should render info toast', async () => {
      renderWithToaster()

      toast.info('Here is some information')

      await waitFor(() => {
        expect(screen.getByText('Here is some information')).toBeInTheDocument()
      })
    })

    it('should render default toast', async () => {
      renderWithToaster()

      toast('Default message')

      await waitFor(() => {
        expect(screen.getByText('Default message')).toBeInTheDocument()
      })
    })

    it('should render loading toast', async () => {
      renderWithToaster()

      toast.loading('Loading data...')

      await waitFor(() => {
        expect(screen.getByText('Loading data...')).toBeInTheDocument()
      })
    })
  })

  describe('Toast with Description', () => {
    it('should render toast with description', async () => {
      renderWithToaster()

      toast.success('Title', {
        description: 'This is a description',
      })

      await waitFor(() => {
        expect(screen.getByText('Title')).toBeInTheDocument()
        expect(screen.getByText('This is a description')).toBeInTheDocument()
      })
    })
  })

  describe('Multiple Toasts', () => {
    it('should stack multiple toasts', async () => {
      renderWithToaster()

      toast.success('First toast')
      toast.error('Second toast')
      toast.warning('Third toast')

      await waitFor(() => {
        expect(screen.getByText('First toast')).toBeInTheDocument()
        expect(screen.getByText('Second toast')).toBeInTheDocument()
        expect(screen.getByText('Third toast')).toBeInTheDocument()
      })
    })

    it('should dismiss individual toasts independently', async () => {
      renderWithToaster()

      const toastId = toast.success('Will be dismissed')
      toast.info('Will stay')

      await waitFor(() => {
        expect(screen.getByText('Will be dismissed')).toBeInTheDocument()
        expect(screen.getByText('Will stay')).toBeInTheDocument()
      })

      toast.dismiss(toastId)

      await waitFor(() => {
        expect(screen.queryByText('Will be dismissed')).not.toBeInTheDocument()
        expect(screen.getByText('Will stay')).toBeInTheDocument()
      })
    })
  })

  describe('Actions', () => {
    it('should render toast with action button', async () => {
      renderWithToaster()

      toast('Item deleted', {
        action: {
          label: 'Undo',
          onClick: vi.fn(),
        },
      })

      await waitFor(() => {
        expect(screen.getByText('Item deleted')).toBeInTheDocument()
        expect(screen.getByText('Undo')).toBeInTheDocument()
      })
    })

    it('should call action onClick when clicked', async () => {
      const user = userEvent.setup()
      const onClickSpy = vi.fn()

      renderWithToaster()

      toast('Item deleted', {
        action: {
          label: 'Undo',
          onClick: onClickSpy,
        },
      })

      await waitFor(() => {
        expect(screen.getByText('Undo')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Undo'))

      expect(onClickSpy).toHaveBeenCalledTimes(1)
    })

    it('should render toast with cancel button', async () => {
      renderWithToaster()

      toast('Confirm action', {
        cancel: {
          label: 'Cancel',
          onClick: vi.fn(),
        },
      })

      await waitFor(() => {
        expect(screen.getByText('Confirm action')).toBeInTheDocument()
        expect(screen.getByText('Cancel')).toBeInTheDocument()
      })
    })
  })

  describe('Dismissal', () => {
    it('should dismiss all toasts', async () => {
      renderWithToaster()

      toast.success('Toast 1')
      toast.error('Toast 2')
      toast.warning('Toast 3')

      await waitFor(() => {
        expect(screen.getByText('Toast 1')).toBeInTheDocument()
        expect(screen.getByText('Toast 2')).toBeInTheDocument()
        expect(screen.getByText('Toast 3')).toBeInTheDocument()
      })

      toast.dismiss()

      await waitFor(() => {
        expect(screen.queryByText('Toast 1')).not.toBeInTheDocument()
        expect(screen.queryByText('Toast 2')).not.toBeInTheDocument()
        expect(screen.queryByText('Toast 3')).not.toBeInTheDocument()
      })
    })
  })

  describe('Positioning', () => {
    it('should support top-left position', () => {
      render(<Toaster position="top-left" />)

      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
    })

    it('should support top-right position', () => {
      render(<Toaster position="top-right" />)

      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
    })

    it('should support bottom-left position', () => {
      render(<Toaster position="bottom-left" />)

      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
    })

    it('should support top-center position', () => {
      render(<Toaster position="top-center" />)

      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
    })

    it('should support bottom-center position', () => {
      render(<Toaster position="bottom-center" />)

      const toaster = screen.getByRole('region')
      expect(toaster).toBeInTheDocument()
    })
  })

  describe('Custom ID', () => {
    it('should update toast with same ID', async () => {
      renderWithToaster()

      toast.loading('Processing...', { id: 'my-toast' })

      await waitFor(() => {
        expect(screen.getByText('Processing...')).toBeInTheDocument()
      })

      toast.success('Complete!', { id: 'my-toast' })

      await waitFor(() => {
        expect(screen.queryByText('Processing...')).not.toBeInTheDocument()
        expect(screen.getByText('Complete!')).toBeInTheDocument()
      })
    })
  })

  describe('Custom Duration', () => {
    it('should accept custom duration option', async () => {
      renderWithToaster()

      // Just test that the toast renders with custom duration - actual timing would require real timers
      toast.info('Custom duration', { duration: 2000 })

      await waitFor(() => {
        expect(screen.getByText('Custom duration')).toBeInTheDocument()
      })
    })

    it('should accept infinite duration option', async () => {
      renderWithToaster()

      toast.info('Infinite toast', { duration: Infinity })

      await waitFor(() => {
        expect(screen.getByText('Infinite toast')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on toaster', () => {
      renderWithToaster()

      const toaster = screen.getByRole('region')
      expect(toaster).toHaveAttribute('aria-live', 'polite')
      expect(toaster).toHaveAttribute('aria-atomic', 'false')
      expect(toaster).toHaveAttribute('aria-relevant')
    })

    it('should announce toasts to screen readers', async () => {
      renderWithToaster()

      toast.success('Screen reader announcement')

      await waitFor(() => {
        const toastElement = screen.getByText('Screen reader announcement')
        expect(toastElement).toBeInTheDocument()
        expect(toastElement).toBeVisible()
      })
    })
  })

  describe('Rich Content', () => {
    it('should render toast with JSX content', async () => {
      renderWithToaster()

      toast(
        <div data-testid="custom-content">
          <strong>Bold text</strong> and <em>italic</em>
        </div>
      )

      await waitFor(() => {
        expect(screen.getByTestId('custom-content')).toBeInTheDocument()
        expect(screen.getByText('Bold text')).toBeInTheDocument()
      })
    })
  })

  describe('Promise Toast', () => {
    it('should show success state when promise resolves', async () => {
      renderWithToaster()

      const promise = Promise.resolve('data')

      toast.promise(promise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Error occurred',
      })

      await waitFor(() => {
        expect(screen.getByText('Done!')).toBeInTheDocument()
      })
    })

    it('should show error state when promise rejects', async () => {
      renderWithToaster()

      const promise = Promise.reject(new Error('Failed'))

      toast.promise(promise, {
        loading: 'Loading...',
        success: 'Done!',
        error: 'Error occurred',
      })

      await waitFor(() => {
        expect(screen.getByText('Error occurred')).toBeInTheDocument()
      })
    })
  })
})

describe('Toast export', () => {
  it('should export toast function', () => {
    expect(toast).toBeDefined()
    expect(typeof toast).toBe('function')
  })

  it('should have success method', () => {
    expect(toast.success).toBeDefined()
    expect(typeof toast.success).toBe('function')
  })

  it('should have error method', () => {
    expect(toast.error).toBeDefined()
    expect(typeof toast.error).toBe('function')
  })

  it('should have warning method', () => {
    expect(toast.warning).toBeDefined()
    expect(typeof toast.warning).toBe('function')
  })

  it('should have info method', () => {
    expect(toast.info).toBeDefined()
    expect(typeof toast.info).toBe('function')
  })

  it('should have loading method', () => {
    expect(toast.loading).toBeDefined()
    expect(typeof toast.loading).toBe('function')
  })

  it('should have promise method', () => {
    expect(toast.promise).toBeDefined()
    expect(typeof toast.promise).toBe('function')
  })

  it('should have dismiss method', () => {
    expect(toast.dismiss).toBeDefined()
    expect(typeof toast.dismiss).toBe('function')
  })
})

describe('Toaster component', () => {
  it('should export Toaster component', () => {
    expect(Toaster).toBeDefined()
    expect(typeof Toaster).toBe('function')
  })
})
