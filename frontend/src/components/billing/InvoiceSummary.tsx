/**
 * Invoice Summary Component
 *
 * Displays aggregated invoice statistics including total paid amount
 * and invoice counts. Typically used in billing dashboard.
 */
import { useInvoiceSummary } from '@/hooks/use-invoices'
import { formatMoney } from '@/lib/money'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export function InvoiceSummary() {
  const { data, isLoading, isError, refetch } = useInvoiceSummary()

  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive-strong"
        role="alert"
      >
        <p className="font-medium">We couldn't load your invoice summary.</p>
        <p className="mt-1 text-sm">
          This is a loading problem, not a billing issue — your invoices are
          safe.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SkeletonCard showImage={false} showHeader={false} bodyLines={2} />
        <SkeletonCard showImage={false} showHeader={false} bodyLines={2} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="p-4 rounded-lg border bg-card shadow-sm transition-all duration-fast hover:shadow-sm">
        <div className="text-sm text-muted-foreground">Total Paid</div>
        <div className="text-base md:text-lg lg:text-xl font-semibold font-mono tabular-nums">
          {formatMoney(data.total_paid, data.currency)}
        </div>
      </div>
      <div className="p-4 rounded-lg border bg-card shadow-sm transition-all duration-fast hover:shadow-sm">
        <div className="text-sm text-muted-foreground">Invoices</div>
        <div className="text-base md:text-lg lg:text-xl font-semibold">
          {data.paid_invoices} paid / {data.total_invoices} total
        </div>
      </div>
    </div>
  )
}
