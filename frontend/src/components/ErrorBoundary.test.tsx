import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ErrorBoundary,
  ErrorFallback,
  withErrorBoundary,
  useErrorBoundary,
} from './ErrorBoundary'

const { mockTrackEvent } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  getAnalyticsErrorCategory: vi.fn(() => 'unknown'),
  getAnalyticsErrorName: vi.fn((error: Error) => error.name),
  trackEvent: mockTrackEvent,
}))

// Component that throws an error on render
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div data-testid="child-content">No error</div>
}

// Component that throws after interaction

function ThrowOnClick() {
  const handleClick = () => {
    throw new Error('Click error')
  }
  return <button onClick={handleClick}>Click me</button>
}

describe('ErrorBoundary', () => {
  // Suppress console.error for cleaner test output
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    mockTrackEvent.mockClear()
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  describe('Error Catching', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Hello</div>
        </ErrorBoundary>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByText('Hello')).toBeInTheDocument()
    })

    it('should catch errors and display fallback', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should display "Try again" button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
    })

    it('should log error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        expect.objectContaining({
          error: expect.any(String),
          stack: expect.any(String),
          componentStack: expect.any(String),
        })
      )
    })

    it('tracks a privacy-safe error boundary event', () => {
      render(
        <ErrorBoundary context="DashboardPage" variant="inline">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(mockTrackEvent).toHaveBeenCalledWith('app_error_boundary_shown', {
        error_context: 'DashboardPage',
        error_name: 'Error',
        error_category: 'unknown',
        boundary_variant: 'inline',
      })
    })
  })

  describe('Reset Functionality', () => {
    it('should reset error state when "Try again" is clicked', async () => {
      const user = userEvent.setup()
      let shouldThrow = true

      function ConditionalError() {
        if (shouldThrow) {
          throw new Error('Test error')
        }
        return <div data-testid="recovered">Recovered!</div>
      }

      const { rerender } = render(
        <ErrorBoundary key="error-boundary">
          <ConditionalError />
        </ErrorBoundary>
      )

      // Should show error state
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Fix the error condition
      shouldThrow = false

      // Click try again
      await user.click(screen.getByRole('button', { name: /try again/i }))

      // Force rerender after state reset
      rerender(
        <ErrorBoundary key="error-boundary">
          <ConditionalError />
        </ErrorBoundary>
      )

      // Should show recovered content
      expect(screen.getByTestId('recovered')).toBeInTheDocument()
    })

    it('should call onReset callback when reset', async () => {
      const user = userEvent.setup()
      const onReset = vi.fn()
      let shouldThrow = true

      function ConditionalError() {
        if (shouldThrow) throw new Error('Test error')
        return <div>OK</div>
      }

      render(
        <ErrorBoundary onReset={onReset}>
          <ConditionalError />
        </ErrorBoundary>
      )

      shouldThrow = false
      await user.click(screen.getByRole('button', { name: /try again/i }))

      expect(onReset).toHaveBeenCalledTimes(1)
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'app_error_boundary_retry_clicked',
        expect.objectContaining({
          error_name: 'Error',
          error_category: 'unknown',
        })
      )
    })

    it('should reset automatically when resetKey changes (route navigation)', () => {
      let shouldThrow = true

      function ConditionalError() {
        if (shouldThrow) throw new Error('Route error')
        return <div data-testid="recovered">Recovered!</div>
      }

      const { rerender } = render(
        <ErrorBoundary resetKey="/broken">
          <ConditionalError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Simulate navigating to a different, working route.
      shouldThrow = false
      rerender(
        <ErrorBoundary resetKey="/dashboard">
          <ConditionalError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('recovered')).toBeInTheDocument()
    })

    it('should stay in error state when resetKey is unchanged', () => {
      let shouldThrow = true

      function ConditionalError() {
        if (shouldThrow) throw new Error('Route error')
        return <div data-testid="recovered">Recovered!</div>
      }

      const { rerender } = render(
        <ErrorBoundary resetKey="/broken">
          <ConditionalError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Same route re-renders should not clear the error.
      shouldThrow = false
      rerender(
        <ErrorBoundary resetKey="/broken">
          <ConditionalError />
        </ErrorBoundary>
      )

      expect(screen.queryByTestId('recovered')).not.toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })

  describe('Custom Fallback', () => {
    it('should render custom fallback when provided', () => {
      render(
        <ErrorBoundary
          fallback={<div data-testid="custom-fallback">Custom Error UI</div>}
        >
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
      expect(screen.getByText('Custom Error UI')).toBeInTheDocument()
    })

    it('should use fallbackRender prop when provided', () => {
      render(
        <ErrorBoundary
          fallbackRender={({ error, resetError }) => (
            <div data-testid="render-fallback">
              <span>Error: {error?.message}</span>
              <button onClick={resetError}>Reset</button>
            </div>
          )}
        >
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('render-fallback')).toBeInTheDocument()
      expect(screen.getByText('Error: Test error')).toBeInTheDocument()
    })
  })

  describe('Error Callback', () => {
    it('should call onError callback when error is caught', () => {
      const onError = vi.fn()

      render(
        <ErrorBoundary onError={onError}>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      )
    })

    it('should include context in error logging', () => {
      render(
        <ErrorBoundary context="TestComponent">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR:'),
        expect.objectContaining({
          error: expect.any(String),
          context: 'TestComponent',
        })
      )
    })
  })

  describe('Variants', () => {
    it('should render page variant by default', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('error-fallback-page')).toBeInTheDocument()
    })

    it('should render inline variant when specified', () => {
      render(
        <ErrorBoundary variant="inline">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('error-fallback-inline')).toBeInTheDocument()
    })

    it('should render minimal variant when specified', () => {
      render(
        <ErrorBoundary variant="minimal">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('error-fallback-minimal')).toBeInTheDocument()
    })
  })

  describe('Support Contact', () => {
    it('should display support email link', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const emailLink = screen.getByRole('link', {
        name: /angel\.campa@capveri\.com/i,
      })
      expect(emailLink).toBeInTheDocument()
      expect(emailLink).toHaveAttribute(
        'href',
        'mailto:angel.campa@capveri.com'
      )
    })

    it('should use custom support email when provided', () => {
      render(
        <ErrorBoundary supportEmail="help@example.com">
          <ThrowError />
        </ErrorBoundary>
      )

      const emailLink = screen.getByRole('link', { name: /help@example.com/i })
      expect(emailLink).toHaveAttribute('href', 'mailto:help@example.com')
    })
  })

  describe('Go to Home', () => {
    it('should have Go to home button in page variant', () => {
      render(
        <ErrorBoundary variant="page">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(
        screen.getByRole('button', { name: /go to home/i })
      ).toBeInTheDocument()
    })
  })

  describe('Retry Button TestId', () => {
    it('should have data-testid="retry-button" on page variant Try again button', () => {
      render(
        <ErrorBoundary variant="page">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('retry-button')).toBeInTheDocument()
      expect(screen.getByTestId('retry-button')).toHaveTextContent(/try again/i)
    })

    it('should have data-testid="retry-button" on inline variant Try again button', () => {
      render(
        <ErrorBoundary variant="inline">
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByTestId('retry-button')).toBeInTheDocument()
      expect(screen.getByTestId('retry-button')).toHaveTextContent(/try again/i)
    })
  })
})

describe('ErrorFallback', () => {
  describe('Page Variant', () => {
    it('should render page variant correctly', () => {
      render(<ErrorFallback error={new Error('Test')} variant="page" />)

      expect(screen.getByTestId('error-fallback-page')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(
        screen.getByText(/We couldn't load this page\. Try again/i)
      ).toBeInTheDocument()
    })

    it('should have ARIA alert role', () => {
      render(<ErrorFallback error={new Error('Test')} variant="page" />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('should show reset button when onReset is provided', () => {
      const onReset = vi.fn()
      render(
        <ErrorFallback
          error={new Error('Test')}
          onReset={onReset}
          variant="page"
        />
      )

      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
    })

    it('should not show reset button when onReset is not provided', () => {
      render(<ErrorFallback error={new Error('Test')} variant="page" />)

      expect(
        screen.queryByRole('button', { name: /try again/i })
      ).not.toBeInTheDocument()
    })

    it('should call onReset when Try again is clicked', async () => {
      const user = userEvent.setup()
      const onReset = vi.fn()

      render(
        <ErrorFallback
          error={new Error('Test')}
          onReset={onReset}
          variant="page"
        />
      )

      await user.click(screen.getByRole('button', { name: /try again/i }))

      expect(onReset).toHaveBeenCalledTimes(1)
    })
  })

  describe('Inline Variant', () => {
    it('should render inline variant correctly', () => {
      render(<ErrorFallback error={new Error('Test')} variant="inline" />)

      expect(screen.getByTestId('error-fallback-inline')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(
        screen.getByText("We couldn't load this part of the page.")
      ).toBeInTheDocument()
    })

    it('should have border styling', () => {
      render(<ErrorFallback error={new Error('Test')} variant="inline" />)

      const container = screen.getByTestId('error-fallback-inline')
      expect(container).toHaveClass('border')
    })
  })

  describe('Minimal Variant', () => {
    it('should render minimal variant correctly', () => {
      render(<ErrorFallback error={new Error('Test')} variant="minimal" />)

      expect(screen.getByTestId('error-fallback-minimal')).toBeInTheDocument()
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should show compact retry button', () => {
      const onReset = vi.fn()
      render(
        <ErrorFallback
          error={new Error('Test')}
          onReset={onReset}
          variant="minimal"
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('should be compact', () => {
      render(<ErrorFallback error={new Error('Test')} variant="minimal" />)

      const container = screen.getByTestId('error-fallback-minimal')
      expect(container).toHaveClass('p-2')
    })
  })

  describe('Custom ClassName', () => {
    it('should accept custom className', () => {
      render(
        <ErrorFallback
          error={new Error('Test')}
          variant="page"
          className="custom-class"
        />
      )

      expect(screen.getByTestId('error-fallback-page')).toHaveClass(
        'custom-class'
      )
    })
  })

  describe('Error Display', () => {
    it('should render even without error prop', () => {
      render(<ErrorFallback error={null} variant="page" />)

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })
})

describe('withErrorBoundary HOC', () => {
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  it('should wrap component with error boundary', () => {
    const TestComponent = () => <div data-testid="test">Test</div>
    const WrappedComponent = withErrorBoundary(TestComponent)

    render(<WrappedComponent />)

    expect(screen.getByTestId('test')).toBeInTheDocument()
  })

  it('should catch errors in wrapped component', () => {
    const WrappedError = withErrorBoundary(ThrowError)

    render(<WrappedError />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should pass error boundary props', () => {
    const WrappedError = withErrorBoundary(ThrowError, {
      variant: 'minimal',
    })

    render(<WrappedError />)

    expect(screen.getByTestId('error-fallback-minimal')).toBeInTheDocument()
  })

  it('should forward props to wrapped component', () => {
    interface Props {
      message: string
    }
    const TestComponent = ({ message }: Props) => (
      <div data-testid="test">{message}</div>
    )
    const WrappedComponent = withErrorBoundary(TestComponent)

    render(<WrappedComponent message="Hello" />)

    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('should have correct display name', () => {
    const TestComponent = () => <div>Test</div>
    TestComponent.displayName = 'TestComponent'

    const WrappedComponent = withErrorBoundary(TestComponent)

    expect(WrappedComponent.displayName).toBe(
      'withErrorBoundary(TestComponent)'
    )
  })
})

describe('Accessibility', () => {
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  it('should have role="alert" on all variants', () => {
    const { rerender } = render(
      <ErrorBoundary variant="page">
        <ThrowError />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ErrorBoundary variant="inline" key="inline">
        <ThrowError />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ErrorBoundary variant="minimal" key="minimal">
        <ThrowError />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('should be keyboard accessible', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowError />
      </ErrorBoundary>
    )

    const tryAgainButton = screen.getByRole('button', { name: /try again/i })

    // Tab to the button
    await user.tab()
    expect(tryAgainButton).toHaveFocus()

    // Press Enter to activate
    await user.keyboard('{Enter}')
    expect(onReset).toHaveBeenCalled()
  })
})

describe('Multiple ErrorBoundaries', () => {
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  it('should isolate errors to nearest boundary', () => {
    render(
      <ErrorBoundary>
        <div data-testid="outer-content">
          <ErrorBoundary variant="inline">
            <ThrowError />
          </ErrorBoundary>
          <div data-testid="sibling">Still works!</div>
        </div>
      </ErrorBoundary>
    )

    // Inner boundary catches the error
    expect(screen.getByTestId('error-fallback-inline')).toBeInTheDocument()
    // Sibling content still renders
    expect(screen.getByTestId('sibling')).toBeInTheDocument()
    // Outer content container is still there
    expect(screen.getByTestId('outer-content')).toBeInTheDocument()
  })
})

describe('useErrorBoundary Hook', () => {
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  it('should allow throwing errors programmatically', async () => {
    const user = userEvent.setup()

    function ComponentWithHook() {
      const throwError = useErrorBoundary()

      const handleClick = () => {
        throwError(new Error('Async error'))
      }

      return <button onClick={handleClick}>Trigger Error</button>
    }

    render(
      <ErrorBoundary>
        <ComponentWithHook />
      </ErrorBoundary>
    )

    // Initially shows button
    expect(
      screen.getByRole('button', { name: /trigger error/i })
    ).toBeInTheDocument()

    // Click to trigger error
    await user.click(screen.getByRole('button', { name: /trigger error/i }))

    // Should show error boundary fallback
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('should work with async functions', async () => {
    const user = userEvent.setup()

    function ComponentWithAsyncError() {
      const throwError = useErrorBoundary()

      const handleClick = async () => {
        try {
          // Simulate async operation
          await Promise.reject(new Error('Network error'))
        } catch (error) {
          throwError(error as Error)
        }
      }

      return <button onClick={handleClick}>Fetch Data</button>
    }

    render(
      <ErrorBoundary>
        <ComponentWithAsyncError />
      </ErrorBoundary>
    )

    await user.click(screen.getByRole('button', { name: /fetch data/i }))

    // Should catch async error
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should be caught by nearest error boundary', async () => {
    const user = userEvent.setup()

    function ComponentWithHook() {
      const throwError = useErrorBoundary()

      return (
        <button onClick={() => throwError(new Error('Inner error'))}>
          Throw
        </button>
      )
    }

    render(
      <ErrorBoundary variant="page">
        <div data-testid="outer">
          <ErrorBoundary variant="inline">
            <ComponentWithHook />
          </ErrorBoundary>
          <div data-testid="sibling">Sibling content</div>
        </div>
      </ErrorBoundary>
    )

    await user.click(screen.getByRole('button', { name: /throw/i }))

    // Inner boundary catches it with inline variant
    expect(screen.getByTestId('error-fallback-inline')).toBeInTheDocument()
    // Sibling content still renders
    expect(screen.getByTestId('sibling')).toBeInTheDocument()
  })
})

describe('ErrorBoundary Sentry integration', () => {
  const originalError = console.error
  const originalGroup = console.group
  const originalGroupEnd = console.groupEnd

  beforeEach(() => {
    // Clear all mocks including captureException accumulated from prior tests
    vi.clearAllMocks()
    console.error = vi.fn()
    console.group = vi.fn()
    console.groupEnd = vi.fn()
  })

  afterEach(() => {
    console.error = originalError
    console.group = originalGroup
    console.groupEnd = originalGroupEnd
  })

  it('calls captureException when child throws', async () => {
    const { captureException } = await import('@/lib/sentry')

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), undefined)
  })

  it('calls captureException with context when context prop provided', async () => {
    const { captureException } = await import('@/lib/sentry')

    render(
      <ErrorBoundary context="DashboardPage">
        <ThrowError />
      </ErrorBoundary>
    )

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      'DashboardPage'
    )
  })
})
