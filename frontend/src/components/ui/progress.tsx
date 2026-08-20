import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const progressVariants = cva(
  'relative h-2 w-full overflow-hidden rounded-full bg-muted',
  {
    variants: {
      size: {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
        xl: 'h-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const indicatorVariants = cva(
  'h-full w-full flex-1 transition-all duration-300 ease-in-out',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        success: 'bg-success',
        warning: 'bg-warning',
        destructive: 'bg-destructive',
        info: 'bg-primary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface ProgressProps
  extends
    React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof indicatorVariants> {
  /** Progress value (0-100). If undefined, shows indeterminate animation. */
  value?: number
  /** Maximum value (default 100) */
  max?: number
  /** Whether to show the progress as indeterminate (animated) */
  indeterminate?: boolean
  /** Accessible label for screen readers */
  label?: string
  /** Whether to show the percentage text */
  showValue?: boolean
}

/**
 * Progress bar component for showing task completion or loading states.
 *
 * Features:
 * - Determinate mode: Shows specific progress percentage
 * - Indeterminate mode: Animated bar for unknown duration
 * - Multiple sizes and color variants
 * - Respects reduced motion preferences
 * - Accessible with ARIA attributes
 *
 * @example
 * ```tsx
 * // Determinate progress
 * <Progress value={75} />
 *
 * // Indeterminate (loading)
 * <Progress indeterminate />
 *
 * // With label and value display
 * <Progress value={45} showValue label="Uploading file..." />
 *
 * // Different variants
 * <Progress value={100} variant="success" />
 * <Progress value={30} variant="warning" />
 * ```
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(
  (
    {
      className,
      value,
      max = 100,
      size,
      variant,
      indeterminate = false,
      label,
      showValue = false,
      ...props
    },
    ref
  ) => {
    const percentage =
      value !== undefined ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

    return (
      <div className="w-full">
        {(label || showValue) && (
          <div className="mb-1 flex items-center justify-between text-sm">
            {label && <span className="text-muted-foreground">{label}</span>}
            {showValue && value !== undefined && (
              <span className="font-medium tabular-nums">
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        )}
        <ProgressPrimitive.Root
          ref={ref}
          className={cn(progressVariants({ size }), className)}
          value={indeterminate ? undefined : percentage}
          max={100}
          aria-label={label || 'Progress'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : Math.round(percentage)}
          aria-valuetext={
            indeterminate ? 'Loading' : `${Math.round(percentage)}%`
          }
          data-testid="progress"
          data-indeterminate={indeterminate || undefined}
          {...props}
        >
          <ProgressPrimitive.Indicator
            className={cn(
              indicatorVariants({ variant }),
              indeterminate && 'animate-progress-indeterminate origin-left'
            )}
            style={
              indeterminate
                ? undefined
                : { transform: `translateX(-${100 - percentage}%)` }
            }
            data-testid="progress-indicator"
          />
        </ProgressPrimitive.Root>
      </div>
    )
  }
)
Progress.displayName = ProgressPrimitive.Root.displayName

export interface ProgressCircularProps
  extends
    React.HTMLAttributes<SVGSVGElement>,
    VariantProps<typeof indicatorVariants> {
  /** Progress value (0-100). If undefined, shows indeterminate animation. */
  value?: number
  /** Size of the circular progress in pixels */
  size?: number
  /** Stroke width of the circle */
  strokeWidth?: number
  /** Whether to show indeterminate animation */
  indeterminate?: boolean
  /** Accessible label for screen readers */
  label?: string
  /** Whether to show the percentage in the center */
  showValue?: boolean
}

/**
 * Circular progress indicator component.
 *
 * @example
 * ```tsx
 * // Determinate
 * <ProgressCircular value={75} />
 *
 * // Indeterminate
 * <ProgressCircular indeterminate />
 *
 * // With value display
 * <ProgressCircular value={45} showValue size={64} />
 * ```
 */
function ProgressCircular({
  value,
  size = 40,
  strokeWidth = 4,
  variant = 'default',
  indeterminate = false,
  label,
  showValue = false,
  className,
  ...props
}: ProgressCircularProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percentage = value !== undefined ? Math.min(100, Math.max(0, value)) : 0
  const offset = circumference - (percentage / 100) * circumference

  const variantColors: Record<string, string> = {
    default: 'stroke-primary',
    success: 'stroke-success',
    warning: 'stroke-warning',
    destructive: 'stroke-destructive',
    info: 'stroke-primary',
  }

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        className
      )}
      role="progressbar"
      aria-label={label || 'Progress'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percentage)}
      aria-valuetext={indeterminate ? 'Loading' : `${Math.round(percentage)}%`}
      data-testid="progress-circular"
    >
      <svg
        width={size}
        height={size}
        className={cn(indeterminate && 'animate-spin')}
        {...props}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn(
            variantColors[variant || 'default'],
            'transition-all duration-300 ease-in-out',
            indeterminate && 'animate-progress-circular'
          )}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: indeterminate ? circumference * 0.75 : offset,
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
      </svg>
      {showValue && value !== undefined && !indeterminate && (
        <span
          className="absolute text-xs font-medium tabular-nums"
          style={{ fontSize: size * 0.25 }}
        >
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  )
}

export { Progress, ProgressCircular, progressVariants, indicatorVariants }
