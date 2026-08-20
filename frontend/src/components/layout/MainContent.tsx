import * as React from 'react'
import { cn } from '@/lib/utils'

export interface MainContentProps {
  /** Content to render in the main area */
  children: React.ReactNode
  /** Additional CSS classes */
  className?: string
  /** Whether to add default padding */
  padded?: boolean
}

/**
 * Main content area component.
 *
 * Features:
 * - Fills remaining space after header
 * - Consistent padding (configurable)
 * - Scrolls independently of sidebar
 * - Semantic main element for accessibility
 */
export function MainContent({
  children,
  className,
  padded = true,
}: MainContentProps) {
  // App.tsx renders the single <main id="main-content"> landmark; this div is a layout container only.
  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto',
        'relative',
        'bg-background',
        'transition-colors duration-normal',
        padded && 'p-4 md:p-6 lg:p-8',
        className
      )}
      data-testid="main-content"
    >
      <div className="relative mx-auto max-w-7xl">{children}</div>
    </div>
  )
}
