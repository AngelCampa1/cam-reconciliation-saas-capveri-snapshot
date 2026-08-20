import * as React from 'react'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  /** Display label for the breadcrumb */
  label: string
  /** Navigation href - if undefined, this is the current page (not a link) */
  href?: string | undefined
  /** Optional icon to display before the label */
  icon?: React.ReactNode | undefined
}

export interface BreadcrumbsProps {
  /** Array of breadcrumb items */
  items: BreadcrumbItem[]
  /** Whether to show home icon for first item */
  showHomeIcon?: boolean | undefined
  /** Callback when a breadcrumb is clicked */
  onNavigate?: ((href: string) => void) | undefined
  /** Additional CSS classes */
  className?: string | undefined
}

/**
 * Breadcrumbs navigation component that displays a trail of links.
 *
 * Features:
 * - Clickable links for all items except current page
 * - Optional home icon for first item
 * - Chevron separators between items
 * - Screen reader accessible with nav and aria-label
 * - Current page indicated with aria-current="page"
 */
export function Breadcrumbs({
  items,
  showHomeIcon = true,
  onNavigate,
  className,
}: BreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (onNavigate) {
      e.preventDefault()
      onNavigate(href)
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('mb-4', className)}
      data-testid="breadcrumbs"
    >
      <ol
        className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        role="list"
      >
        {items.map((item, index) => {
          const isFirst = index === 0
          const isLast = index === items.length - 1
          const isCurrentPage = !item.href
          // The first crumb collapses to a 16px Home icon on mobile (the label
          // is sr-only below the sm breakpoint), which is well under the 40px
          // tap-target floor. Extend the hit area with an invisible 40x40
          // before: overlay (same pattern as HelpTip) without changing layout.
          const isIconOnlyHome =
            isFirst && showHomeIcon && item.icon === undefined

          return (
            <li key={item.label} className="flex items-center gap-2">
              {/* Separator (not shown before first item) */}
              {!isFirst && (
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/50"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              )}

              {/* Breadcrumb content */}
              {isCurrentPage ? (
                // Current page (not a link)
                <span
                  className={cn(
                    'font-medium text-foreground',
                    isLast &&
                      'truncate max-w-[200px] sm:max-w-[360px] lg:max-w-[520px]'
                  )}
                  aria-current="page"
                  data-testid={`breadcrumb-current-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isFirst && showHomeIcon && item.icon === undefined ? (
                    <span className="flex items-center gap-1.5">
                      <Home className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">
                        {item.label}
                      </span>
                    </span>
                  ) : (
                    <>
                      {item.icon && (
                        <span className="mr-1.5" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      {item.label}
                    </>
                  )}
                </span>
              ) : (
                // Link to previous page
                // F-292: title exposes the full label text when truncation
                // (max-w-[160px] truncate) clips long property names on hover.
                <a
                  href={item.href}
                  onClick={(e) => handleClick(e, item.href!)}
                  title={!isFirst ? item.label : undefined}
                  className={cn(
                    'transition-all duration-fast hover:text-foreground',
                    // Enhanced hover with underline
                    'underline decoration-transparent hover:decoration-primary/50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm',
                    !isFirst && 'max-w-[160px] truncate sm:max-w-[280px]',
                    isIconOnlyHome &&
                      "relative inline-flex items-center before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                  )}
                  data-testid={`breadcrumb-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isFirst && showHomeIcon && item.icon === undefined ? (
                    <span className="flex items-center gap-1.5">
                      <Home className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">
                        {item.label}
                      </span>
                    </span>
                  ) : (
                    <>
                      {item.icon && (
                        <span className="mr-1.5" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      {item.label}
                    </>
                  )}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
