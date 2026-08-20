import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const errorStateVariants = cva(
  'flex flex-col items-center justify-center text-center',
  {
    variants: {
      size: {
        sm: 'py-6 px-4',
        md: 'py-12 px-6',
        lg: 'py-16 px-8',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const iconContainerVariants = cva(
  'rounded-full flex items-center justify-center mb-4 bg-destructive/10 ring-1 ring-destructive/15',
  {
    variants: {
      size: {
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-7',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

const iconVariants = cva('text-destructive', {
  variants: {
    size: {
      sm: 'h-5 w-5',
      md: 'h-8 w-8',
      lg: 'h-12 w-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const titleVariants = cva('font-medium mb-1 text-destructive-strong', {
  variants: {
    size: {
      sm: 'text-base',
      md: 'text-lg',
      lg: 'text-xl',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

const descriptionVariants = cva('text-muted-foreground max-w-sm', {
  variants: {
    size: {
      sm: 'text-sm mb-3',
      md: 'text-sm mb-4',
      lg: 'text-base mb-6',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export interface ErrorStateAction {
  /** Button label text (defaults to "Try again" when omitted) */
  label?: string
  /** Click handler, typically () => refetch() */
  onClick: () => void
  /** Optional icon to show before label (defaults to RefreshCw) */
  icon?: LucideIcon
  /** Button variant (defaults to outline) */
  variant?: 'default' | 'outline' | 'secondary'
}

export interface ErrorStateProps extends VariantProps<
  typeof errorStateVariants
> {
  /** Icon to display (defaults to AlertCircle) */
  icon?: LucideIcon | undefined
  /** Main title text, e.g. "Couldn't load leases" */
  title: string
  /**
   * Heading level for the title. Defaults to 'h3'. Pass 'h2' when the
   * ErrorState is the top-level content directly under a page `<h1>` so the
   * screen-reader heading ladder isn't skipped. Mirrors {@link EmptyState}.
   */
  titleAs?: 'h2' | 'h3' | 'h4'
  /** Description text shown under the title */
  description?: string | undefined
  /** Retry / recovery action button */
  action?: ErrorStateAction | undefined
  /**
   * Optional second action shown beside the primary one, e.g. a "Go back"
   * escape hatch. Defaults to a `ghost` variant with no icon so it reads as
   * the quieter, secondary choice.
   */
  secondaryAction?: ErrorStateAction | undefined
  /**
   * When true, the error is a lost-connection state (e.g. React Query
   * `isPaused`). Swaps in offline-aware copy so a paused fetch reads as a
   * retryable connection problem rather than a server error.
   */
  offline?: boolean | undefined
  /** Additional CSS classes */
  className?: string | undefined
  /** Test ID for testing */
  'data-testid'?: string | undefined
}

const OFFLINE_TITLE = "Can't reach the server"
const OFFLINE_DESCRIPTION = 'Check your connection and try again.'

/**
 * ErrorState component for displaying a load/fetch failure with a retry action.
 *
 * Mirrors {@link EmptyState}'s API (icon, title, description, action, size) so
 * empty and error states stay visually consistent. Use this instead of
 * hand-rolling a "Failed to load…" + Try again block.
 *
 * @example
 * ```tsx
 * if (error) {
 *   return (
 *     <ErrorState
 *       title="Couldn't load units"
 *       action={{ onClick: () => refetch() }}
 *     />
 *   )
 * }
 * ```
 *
 * @example Offline-aware (React Query isPaused)
 * ```tsx
 * if (error || (isPaused && !data)) {
 *   return (
 *     <ErrorState
 *       title="Couldn't load notifications"
 *       offline={isPaused && !data}
 *       action={{ onClick: () => refetch() }}
 *     />
 *   )
 * }
 * ```
 */
export function ErrorState({
  icon: Icon = AlertCircle,
  title,
  titleAs: TitleTag = 'h3',
  description,
  action,
  secondaryAction,
  offline = false,
  size,
  className,
  'data-testid': testId = 'error-state',
}: ErrorStateProps) {
  const resolvedTitle = offline ? OFFLINE_TITLE : title
  const resolvedDescription = offline ? OFFLINE_DESCRIPTION : description
  const ActionIcon = action?.icon ?? RefreshCw
  const buttonSize = size === 'sm' ? 'sm' : 'default'

  return (
    <div
      className={cn(errorStateVariants({ size }), className)}
      data-testid={testId}
      role="alert"
    >
      <div className={iconContainerVariants({ size })}>
        <Icon className={iconVariants({ size })} aria-hidden="true" />
      </div>

      <TitleTag className={titleVariants({ size })}>{resolvedTitle}</TitleTag>

      {resolvedDescription && (
        <p className={descriptionVariants({ size })}>{resolvedDescription}</p>
      )}

      {action && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-3',
            !resolvedDescription && 'mt-2'
          )}
        >
          <Button
            onClick={action.onClick}
            variant={action.variant ?? 'outline'}
            size={buttonSize}
          >
            <ActionIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {action.label ?? 'Try again'}
          </Button>
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant ?? 'ghost'}
              size={buttonSize}
            >
              {secondaryAction.icon && (
                <secondaryAction.icon
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {secondaryAction.label ?? 'Go back'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { errorStateVariants, iconContainerVariants, iconVariants }
