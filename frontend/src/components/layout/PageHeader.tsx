import * as React from 'react'
import { cn } from '@/lib/utils'
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs'
import { BackButton } from './BackButton'

export interface PageHeaderProps {
  /** Page title - rendered as h1. Usually a string; accepts a node so loading
   *  states can render a skeleton bar in place of literal "Loading..." text. */
  title: React.ReactNode
  /** Optional description/subtitle shown below title */
  description?: string | undefined
  /** Breadcrumb items for navigation trail */
  breadcrumbs?: BreadcrumbItem[] | undefined
  /** Action buttons or controls to display on the right */
  actions?: React.ReactNode | undefined
  /** Callback when a breadcrumb is clicked */
  onBreadcrumbNavigate?: ((href: string) => void) | undefined
  /** Additional CSS classes */
  className?: string | undefined
  /** Show back button (hidden on mobile, breadcrumbs shown on desktop) */
  showBackButton?: boolean | undefined
  /** Explicit back button target route (optional) */
  backButtonTo?: string | undefined
  /** Custom back button label (default: "Back") */
  backButtonLabel?: string | undefined
  /** Opt into decorative title treatment for rare hero-like pages */
  decorativeTitle?: boolean | undefined
}

/**
 * Page header component with breadcrumbs, title, description, and actions.
 *
 * Features:
 * - Semantic h1 title for accessibility
 * - Optional description/subtitle
 * - Breadcrumb navigation trail
 * - Optional back button (mobile-first, breadcrumbs on desktop)
 * - Action buttons slot on the right
 * - Responsive: stacks vertically on mobile, horizontal on desktop
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  onBreadcrumbNavigate,
  className,
  showBackButton = false,
  backButtonTo,
  backButtonLabel,
  decorativeTitle = false,
}: PageHeaderProps) {
  const hasBreadcrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0)

  return (
    <div
      className={cn(
        'mb-8 pb-6',
        // Subtle bottom border separator
        'border-b border-border-subtle',
        className
      )}
      data-testid="page-header"
    >
      {/* Back button. On desktop, breadcrumbs replace it — but only when
          breadcrumbs are actually provided. Without breadcrumbs, hiding the
          back button on desktop would leave the page with no in-header back
          navigation, so keep it visible at every width in that case. */}
      {showBackButton && (
        <div className={cn('mb-4', hasBreadcrumbs && 'md:hidden')}>
          <BackButton
            {...(backButtonTo && { to: backButtonTo })}
            {...(backButtonLabel && { label: backButtonLabel })}
          />
        </div>
      )}

      {/* Breadcrumbs navigation - hidden on mobile when back button shown, visible on desktop */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className={cn(showBackButton && 'hidden md:block')}>
          <Breadcrumbs items={breadcrumbs} onNavigate={onBreadcrumbNavigate} />
        </div>
      )}

      {/* Title and actions row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        {/* Title and description */}
        <div className="min-w-0 flex-1 sm:min-w-[16rem]">
          <h1
            className={cn(
              'hyphens-auto break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl',
              decorativeTitle &&
                'bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent'
            )}
            data-testid="page-header-title"
          >
            {title}
          </h1>
          {description && (
            <p
              className={cn(
                'mt-2 max-w-2xl break-words text-base leading-relaxed text-muted-foreground'
              )}
              data-testid="page-header-description"
            >
              {description}
            </p>
          )}
        </div>

        {/* Actions slot */}
        {actions && (
          <div
            className="flex min-w-0 flex-col items-stretch gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3"
            data-testid="page-header-actions"
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

export { type BreadcrumbItem } from './Breadcrumbs'
