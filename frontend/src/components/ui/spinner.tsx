import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-solid border-current border-r-transparent motion-reduce:animate-none',
  {
    variants: {
      size: {
        xs: 'h-3 w-3 border',
        sm: 'h-4 w-4 border-2',
        md: 'h-6 w-6 border-2',
        lg: 'h-8 w-8 border-[3px]',
        xl: 'h-12 w-12 border-4',
      },
      variant: {
        default: 'text-primary',
        muted: 'text-muted-foreground',
        destructive: 'text-destructive',
        success: 'text-success',
        white: 'text-primary-foreground',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
)

export interface SpinnerProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  /** Accessible label for screen readers */
  label?: string
}

/**
 * Spinner loading indicator component.
 *
 * Features:
 * - Multiple sizes (xs, sm, md, lg, xl)
 * - Color variants matching design system
 * - Respects reduced motion preferences
 * - Accessible with screen reader support
 *
 * @example
 * ```tsx
 * // Basic spinner
 * <Spinner />
 *
 * // Different sizes
 * <Spinner size="sm" />
 * <Spinner size="lg" />
 *
 * // Different variants
 * <Spinner variant="muted" />
 * <Spinner variant="success" />
 *
 * // With custom label
 * <Spinner label="Loading properties..." />
 *
 * // Full-page centered
 * <SpinnerOverlay />
 * ```
 */
function Spinner({
  className,
  size,
  variant,
  label = 'Loading',
  ...props
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center justify-center', className)}
      data-testid="spinner"
      {...props}
    >
      <div
        className={cn(spinnerVariants({ size, variant }))}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export interface SpinnerOverlayProps extends SpinnerProps {
  /** Whether to show a semi-transparent backdrop */
  showBackdrop?: boolean
  /** Text to display below the spinner */
  text?: string
}

/**
 * Full-screen spinner overlay for page-level loading states.
 * Centered spinner with optional backdrop and text.
 */
function SpinnerOverlay({
  showBackdrop = true,
  text,
  size = 'lg',
  variant = 'default',
  label = 'Loading',
  className,
  ...props
}: SpinnerOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-modal flex flex-col items-center justify-center',
        showBackdrop && 'bg-background/80 backdrop-blur-sm',
        className
      )}
      role="status"
      aria-label={label}
      data-testid="spinner-overlay"
      {...props}
    >
      <Spinner size={size} variant={variant} label={label} />
      {text && (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  )
}

export interface InlineSpinnerProps extends SpinnerProps {
  /** Text to display next to the spinner */
  text?: string
  /** Position of text relative to spinner */
  textPosition?: 'left' | 'right'
}

/**
 * Inline spinner with optional text, useful for buttons or inline loading states.
 */
function InlineSpinner({
  text,
  textPosition = 'right',
  size = 'sm',
  className,
  ...props
}: InlineSpinnerProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2',
        textPosition === 'left' && 'flex-row-reverse',
        className
      )}
      data-testid="inline-spinner"
    >
      <Spinner size={size} {...props} />
      {text && <span className="text-sm">{text}</span>}
    </div>
  )
}

export { Spinner, SpinnerOverlay, InlineSpinner, spinnerVariants }
