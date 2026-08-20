import * as React from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Standardized page container with responsive padding
 *
 * Provides consistent spacing across all pages:
 * - Mobile (default): px-4 (16px horizontal)
 * - Tablet (md): px-6 (24px horizontal)
 * - Desktop (lg+): px-8 (32px horizontal)
 * - All sizes: py-8 (32px vertical)
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('container px-4 md:px-6 lg:px-8 py-8', className)}>
      {children}
    </div>
  )
}
