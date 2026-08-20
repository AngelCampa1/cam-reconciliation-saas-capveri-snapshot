import * as React from 'react'
import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { captureException } from '@/lib/sentry'
import {
  getAnalyticsErrorCategory,
  getAnalyticsErrorName,
  trackEvent,
} from '@/lib/analytics'

/**
 * Error logging function - logs to console in dev, could send to service in prod
 */
function logError(error: Error, errorInfo: ErrorInfo, context?: string): void {
  logger.error('ErrorBoundary caught an error', {
    error: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
    context,
  })
  captureException(error, context)
}

export type ErrorBoundaryVariant = 'page' | 'inline' | 'minimal'

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode
  /** Custom fallback UI to render on error */
  fallback?: ReactNode
  /** Fallback render prop for access to error and reset */
  fallbackRender?: (props: {
    error: Error | null
    resetError: () => void
  }) => ReactNode
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Callback when error is reset */
  onReset?: () => void
  /** Variant of the error display */
  variant?: ErrorBoundaryVariant
  /** Context identifier for error logging */
  context?: string
  /** Support email for contact link */
  supportEmail?: string
  /**
   * When this value changes while an error is shown, the boundary resets
   * itself. Pass the current route path so one broken route does not keep the
   * error screen pinned across later client-side navigations.
   */
  resetKey?: string | number
}

export interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary component that catches JavaScript errors in child components.
 *
 * Features:
 * - Catches rendering errors, lifecycle errors, and errors in constructors
 * - Provides "Try again" reset functionality
 * - Multiple display variants (page, inline, minimal)
 * - Error logging to console (dev) or service (prod)
 * - Custom fallback support
 *
 * @example
 * ```tsx
 * // Wrap your app or specific sections
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 *
 * // With custom variant
 * <ErrorBoundary variant="inline">
 *   <DataGrid />
 * </ErrorBoundary>
 *
 * // With custom fallback
 * <ErrorBoundary fallback={<CustomError />}>
 *   <SomeComponent />
 * </ErrorBoundary>
 *
 * // With error callback
 * <ErrorBoundary onError={(error) => trackError(error)}>
 *   <SomeComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(
    error: Error
  ): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log the error
    logError(error, errorInfo, this.props.context)
    trackEvent('app_error_boundary_shown', {
      ...(this.props.context ? { error_context: this.props.context } : {}),
      error_name: getAnalyticsErrorName(error),
      error_category: getAnalyticsErrorCategory(error),
      ...(this.props.variant ? { boundary_variant: this.props.variant } : {}),
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset the boundary when the caller's resetKey changes (e.g. the route
    // path) so a single broken route does not stay pinned across navigations.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, errorInfo: null })
    }
  }

  private handleReset = (): void => {
    trackEvent('app_error_boundary_retry_clicked', {
      ...(this.props.context ? { error_context: this.props.context } : {}),
      ...(this.state.error
        ? {
            error_name: getAnalyticsErrorName(this.state.error),
            error_category: getAnalyticsErrorCategory(this.state.error),
          }
        : {}),
      ...(this.props.variant ? { boundary_variant: this.props.variant } : {}),
    })
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onReset?.()
  }

  public render(): ReactNode {
    const { hasError, error } = this.state
    const {
      children,
      fallback,
      fallbackRender,
      variant = 'page',
      supportEmail = 'angel.campa@capveri.com',
    } = this.props

    if (hasError) {
      // Custom fallback takes precedence
      if (fallback) {
        return fallback
      }

      // Render prop fallback
      if (fallbackRender) {
        return fallbackRender({ error, resetError: this.handleReset })
      }

      // Default fallback based on variant
      return (
        <ErrorFallback
          error={error}
          onReset={this.handleReset}
          variant={variant}
          supportEmail={supportEmail}
        />
      )
    }

    return children
  }
}

export interface ErrorFallbackProps {
  /** The error that was caught */
  error: Error | null
  /** Function to reset the error state */
  onReset?: () => void
  /** Display variant */
  variant?: ErrorBoundaryVariant
  /** Support email for contact */
  supportEmail?: string
  /** Custom className */
  className?: string
}

/**
 * Default error fallback UI component.
 * Can be used standalone or as the default for ErrorBoundary.
 */
export function ErrorFallback({
  error,
  onReset,
  variant = 'page',
  supportEmail = 'angel.campa@capveri.com',
  className,
}: ErrorFallbackProps) {
  const isDev = import.meta.env.DEV

  if (variant === 'minimal') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-2 text-sm text-destructive-strong bg-destructive/10 rounded-md',
          className
        )}
        role="alert"
        data-testid="error-fallback-minimal"
      >
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Something went wrong</span>
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-6 px-2 text-xs"
          >
            Retry
          </Button>
        )}
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-6 border border-destructive/20 bg-destructive/5 rounded-lg',
          className
        )}
        role="alert"
        data-testid="error-fallback-inline"
      >
        <AlertCircle className="h-8 w-8 text-destructive mb-3" />
        <h3 className="text-lg font-semibold mb-1">Something went wrong</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          We couldn't load this part of the page.
        </p>
        {isDev && error && (
          <details className="w-full mb-4">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Error details
            </summary>
            <pre className="mt-2 p-2 text-xs bg-muted rounded overflow-auto max-h-32">
              {error.message}
            </pre>
          </details>
        )}
        {onReset && (
          <Button
            onClick={onReset}
            variant="outline"
            size="sm"
            data-testid="retry-button"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
        )}
      </div>
    )
  }

  // Full page variant (default)
  return (
    <div
      className={cn(
        'min-h-[400px] flex flex-col items-center justify-center p-8',
        className
      )}
      role="alert"
      data-testid="error-fallback-page"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>

        {/* The page-level fallback replaces the whole route, so it owns the
            document's only <h1> (otherwise the error state renders with no h1
            and an orphaned h2). */}
        <h1 className="text-fluid-2xl font-semibold mb-2">
          Something went wrong
        </h1>

        <p className="text-muted-foreground mb-6">
          We couldn't load this page. Try again, or email support if it keeps
          happening.
        </p>

        {isDev && error && (
          <details className="text-left mb-6">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
              Show error details (development only)
            </summary>
            <pre className="mt-2 p-3 text-xs bg-muted rounded-lg overflow-auto max-h-48 text-left">
              <strong>Error:</strong> {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  <strong>Stack:</strong>
                  {'\n'}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onReset && (
            <Button onClick={onReset} data-testid="retry-button">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => (window.location.href = '/')}
          >
            <Home className="h-4 w-4 mr-2" />
            Go to home
          </Button>
        </div>

        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Need help? Email support:
          </p>
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            <Mail className="h-4 w-4 mr-1" />
            {supportEmail}
          </a>
        </div>
      </div>
    </div>
  )
}

/**
 * Higher-order component to wrap a component with an error boundary.
 *
 * @example
 * ```tsx
 * const SafeComponent = withErrorBoundary(UnsafeComponent, {
 *   variant: 'inline',
 *   context: 'DataGrid',
 * })
 * ```
 */
// eslint-disable-next-line react-refresh/only-export-components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || 'Component'

  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`

  return ComponentWithErrorBoundary
}

/**
 * Hook to programmatically throw errors that will be caught by the nearest ErrorBoundary.
 * Useful for handling async errors or errors in event handlers.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const throwError = useErrorBoundary()
 *
 *   const handleClick = async () => {
 *     try {
 *       await fetchData()
 *     } catch (error) {
 *       throwError(error as Error)
 *     }
 *   }
 *
 *   return <button onClick={handleClick}>Fetch</button>
 * }
 * ```
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useErrorBoundary(): (error: Error) => void {
  const [, setError] = React.useState<Error | null>(null)

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error
    })
  }, [])
}
