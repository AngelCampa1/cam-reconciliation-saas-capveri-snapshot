import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface LazyPageBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Suspense boundary for lazy-loaded page components.
 *
 * Provides a consistent loading experience with skeleton fallback
 * while route chunks are being loaded.
 */
export function LazyPageBoundary({
  children,
  fallback,
}: LazyPageBoundaryProps) {
  return <Suspense fallback={fallback || <PageSkeleton />}>{children}</Suspense>
}

/**
 * Default skeleton shown while lazy pages are loading.
 */
function PageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
