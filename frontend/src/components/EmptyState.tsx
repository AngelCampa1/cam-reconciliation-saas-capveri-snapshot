import { cva, type VariantProps } from 'class-variance-authority'
import {
  Building2,
  FileText,
  FolderOpen,
  Upload,
  Search,
  FileQuestion,
  Users,
  Calculator,
  type LucideIcon,
  Plus,
  Sparkles,
  ExternalLink,
  Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const emptyStateVariants = cva(
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
  [
    'rounded-full flex items-center justify-center mb-4',
    // Gradient background for premium feel
    'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent',
    // Subtle ring accent
    'ring-1 ring-primary/10',
  ].join(' '),
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

const iconVariants = cva('text-muted-foreground', {
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

const titleVariants = cva('font-medium mb-1', {
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

export interface EmptyStateAction {
  /** Button label text */
  label: string
  /** Click handler */
  onClick: () => void
  /** Optional icon to show before label (defaults to Plus) */
  icon?: LucideIcon
  /** Button variant */
  variant?: 'default' | 'outline' | 'secondary'
}

export interface EmptyStateHint {
  /** Hint title */
  title: string
  /** Hint content */
  content: string
  /** Optional link for learning more */
  learnMoreUrl?: string
}

export interface EmptyStateProps extends VariantProps<
  typeof emptyStateVariants
> {
  /** Icon to display */
  icon?: LucideIcon | undefined
  /** Main title text */
  title: string
  /** Heading element for the title. Defaults to 'h3'. Set 'h2' when the
   *  empty state is the top-level content under a page's h1 to avoid a
   *  skipped heading level. */
  titleAs?: 'h2' | 'h3' | 'h4'
  /** Description text */
  description: string
  /** Primary action button (can be undefined for conditional rendering) */
  action?: EmptyStateAction | undefined
  /** Secondary action button (can be undefined for conditional rendering) */
  secondaryAction?: EmptyStateAction | undefined
  /** Educational hint shown below description */
  hint?: EmptyStateHint | undefined
  /** Additional CSS classes */
  className?: string | undefined
  /** Test ID for testing */
  'data-testid'?: string | undefined
}

/**
 * EmptyState component for displaying helpful messages when lists have no data.
 *
 * Features:
 * - Configurable icon (defaults to FolderOpen)
 * - Title and description text
 * - Optional primary and secondary action buttons
 * - Three size variants (sm, md, lg)
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Building2}
 *   title="No properties yet"
 *   description="Get started by adding your first commercial property."
 *   action={{
 *     label: 'Add Property',
 *     onClick: () => navigate('/properties/new'),
 *   }}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  titleAs: TitleTag = 'h3',
  description,
  action,
  secondaryAction,
  hint,
  size,
  className,
  'data-testid': testId = 'empty-state',
}: EmptyStateProps) {
  const ActionIcon = action?.icon ?? Plus

  return (
    <div
      className={cn(emptyStateVariants({ size }), className)}
      data-testid={testId}
      role="status"
      aria-label={title}
    >
      <div className={iconContainerVariants({ size })}>
        <Icon className={iconVariants({ size })} aria-hidden="true" />
      </div>

      <TitleTag className={titleVariants({ size })}>{title}</TitleTag>

      <p className={descriptionVariants({ size })}>{description}</p>

      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant ?? 'default'}
              size={size === 'sm' ? 'sm' : 'default'}
            >
              <ActionIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant={secondaryAction.variant ?? 'outline'}
              size={size === 'sm' ? 'sm' : 'default'}
            >
              {secondaryAction.icon && (
                <secondaryAction.icon
                  className="mr-2 h-4 w-4"
                  aria-hidden="true"
                />
              )}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}

      {hint && (
        <div className="mt-6 max-w-md rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Lightbulb
              className="h-5 w-5 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="text-left">
              <h4 className="font-medium text-sm text-foreground">
                {hint.title}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {hint.content}
              </p>
              {hint.learnMoreUrl && (
                <a
                  href={hint.learnMoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                >
                  Learn more
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Preset Empty States for Common Entities
// ============================================================================

export interface PresetEmptyStateProps {
  /** Action to perform (e.g., navigate to add page) */
  onAction?: (() => void) | undefined
  /** Optional: show a "See a sample" affordance pointing at the onboarding
   *  sample experience. When provided, a secondary button is rendered so a
   *  new user is never stuck on an empty screen. */
  onSeeSample?: (() => void) | undefined
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | undefined
  /** Additional CSS classes */
  className?: string | undefined
}

/** Builds the optional "See a sample" secondary action shared by presets. */
function sampleAction(
  onSeeSample: (() => void) | undefined
): EmptyStateAction | undefined {
  return onSeeSample
    ? {
        label: 'See a sample first',
        onClick: onSeeSample,
        icon: Sparkles,
        variant: 'outline',
      }
    : undefined
}

/**
 * Empty state for when no properties exist.
 */
export function EmptyStateNoProperties({
  onAction,
  onSeeSample,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Building2}
      title="No buildings yet"
      description="Add one building to start. We check the statement before you send it."
      action={
        onAction
          ? {
              label: 'Add your first building',
              onClick: onAction,
            }
          : undefined
      }
      secondaryAction={sampleAction(onSeeSample)}
      size={size}
      className={className}
      data-testid="empty-state-no-properties"
    />
  )
}

/**
 * Empty state for when no leases exist.
 */
export function EmptyStateNoLeases({
  onAction,
  onSeeSample,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FileText}
      title="No leases yet"
      description="Add a lease for each tenant. It tells us what they agreed to pay."
      action={
        onAction
          ? {
              label: 'Add a lease',
              onClick: onAction,
            }
          : undefined
      }
      secondaryAction={sampleAction(onSeeSample)}
      size={size}
      className={className}
      data-testid="empty-state-no-leases"
    />
  )
}

/**
 * Empty state for when no imports/uploads exist.
 */
export function EmptyStateNoImports({
  onAction,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Upload}
      title="No files yet"
      description="Start with your building cost file. A spreadsheet works, or a file you saved from your property software."
      action={
        onAction
          ? {
              label: 'Upload a file',
              icon: Upload,
              onClick: onAction,
            }
          : undefined
      }
      size={size}
      className={className}
      data-testid="empty-state-no-imports"
    />
  )
}

/**
 * Empty state for search with no results.
 */
export interface EmptyStateNoSearchResultsProps extends PresetEmptyStateProps {
  /** The search query that returned no results */
  query?: string | undefined
  /** Callback to clear the search */
  onClear?: (() => void) | undefined
}

export function EmptyStateNoSearchResults({
  query,
  onClear,
  size,
  className,
}: EmptyStateNoSearchResultsProps) {
  const description = query
    ? `No results found for "${query}". Try adjusting your search terms or filters.`
    : 'No results found. Try adjusting your search terms or filters.'

  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={description}
      action={
        onClear
          ? {
              label: 'Clear Search',
              onClick: onClear,
              icon: Search,
              variant: 'outline',
            }
          : undefined
      }
      size={size}
      className={className}
      data-testid="empty-state-no-search-results"
    />
  )
}

/**
 * Empty state for when no tenants exist.
 */
export function EmptyStateNoTenants({
  onAction,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Users}
      title="No tenants yet"
      description="Add a tenant to track their lease and their share of costs."
      action={
        onAction
          ? {
              label: 'Add a tenant',
              onClick: onAction,
            }
          : undefined
      }
      size={size}
      className={className}
      data-testid="empty-state-no-tenants"
    />
  )
}

/**
 * Empty state for when no reconciliations exist.
 */
export function EmptyStateNoReconciliations({
  onAction,
  onSeeSample,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Calculator}
      title="No checks yet"
      description="Run your first check. We compare the bills. We show where the money is off."
      action={
        onAction
          ? {
              label: 'Run your first check',
              onClick: onAction,
            }
          : undefined
      }
      secondaryAction={sampleAction(onSeeSample)}
      size={size}
      className={className}
      data-testid="empty-state-no-reconciliations"
    />
  )
}

/**
 * Generic empty state for data that hasn't been loaded or doesn't exist.
 */
export function EmptyStateNoData({
  onAction,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FileQuestion}
      title="No data available"
      description="No data to show."
      action={
        onAction
          ? {
              label: 'Refresh',
              onClick: onAction,
              variant: 'outline',
            }
          : undefined
      }
      size={size}
      className={className}
      data-testid="empty-state-no-data"
    />
  )
}

/**
 * Empty state for dashboard when user has no data.
 * Used to guide new users to start the onboarding flow.
 */
export interface EmptyStateDashboardProps extends PresetEmptyStateProps {
  /** Callback to start the onboarding flow */
  onStartOnboarding?: (() => void) | undefined
}

export function EmptyStateDashboard({
  onStartOnboarding,
  onSeeSample,
  size,
  className,
}: EmptyStateDashboardProps) {
  return (
    <EmptyState
      icon={Sparkles}
      title="Welcome to CapVeri"
      description="Add your first building. We check the statement before you send it."
      action={
        onStartOnboarding
          ? {
              label: 'Add your first building',
              onClick: onStartOnboarding,
              icon: Sparkles,
            }
          : undefined
      }
      secondaryAction={sampleAction(onSeeSample)}
      hint={{
        title: 'What does CapVeri do?',
        content:
          'CapVeri checks your building costs. It catches over-bills and under-bills before tenants see the statement.',
      }}
      size={size}
      className={className}
      data-testid="empty-state-dashboard"
    />
  )
}

/**
 * Empty state for extractions page when no documents exist.
 * Guides users to upload their first lease document.
 */
export function EmptyStateNoExtractions({
  onAction,
  size,
  className,
}: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FileText}
      title="No documents to verify"
      description="Upload a lease PDF to extract key terms. AI reads the document and pulls financial data for you to review before it's saved."
      action={
        onAction
          ? {
              label: 'Upload Document',
              onClick: onAction,
              icon: Upload,
            }
          : undefined
      }
      hint={{
        title: 'How does AI extraction work?',
        content:
          'Upload a lease PDF. AI reads it and pulls out the numbers that say what each tenant agreed to pay. You review and confirm before anything is saved.',
      }}
      size={size}
      className={className}
      data-testid="empty-state-no-extractions"
    />
  )
}

// Export icon variants for custom usage
// eslint-disable-next-line react-refresh/only-export-components -- styling variants are intentionally co-exported with the components in this module
export { emptyStateVariants, iconContainerVariants, iconVariants }
