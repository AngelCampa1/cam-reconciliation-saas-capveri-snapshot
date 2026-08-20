import { ReactNode } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { cn } from '@/lib/utils'

interface ResponsiveTableWrapperProps {
  /** Desktop table view */
  table: ReactNode
  /** Mobile card view */
  mobileCards: ReactNode
  /** Additional className */
  className?: string
  /** Force mobile view regardless of viewport (for testing) */
  forceMobile?: boolean
}

/**
 * Responsive wrapper that switches between table and card views based on viewport
 *
 * @example
 * <ResponsiveTableWrapper
 *   table={<DataTable columns={columns} data={data} />}
 *   mobileCards={data.map(item => <ItemCard key={item.id} item={item} />)}
 * />
 */
export function ResponsiveTableWrapper({
  table,
  mobileCards,
  className,
  forceMobile = false,
}: ResponsiveTableWrapperProps) {
  const { isMobile } = useViewport()
  const showMobile = forceMobile || isMobile

  return (
    <div className={cn('w-full', className)}>
      {showMobile ? (
        <div className="space-y-3" data-testid="mobile-cards-view">
          {mobileCards}
        </div>
      ) : (
        <div className="overflow-x-auto" data-testid="desktop-table-view">
          {table}
        </div>
      )}
    </div>
  )
}
