/**
 * Invoices Page - View and download billing invoices
 */
import { useState } from 'react'
import { Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { SkeletonCard } from '@/components/ui/skeleton'
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { useInvoices, type Invoice } from '@/hooks/use-invoices'
import { formatMoney } from '@/lib/money'
import { formatTimestampDate } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'

export function InvoicesPage() {
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const perPage = 10

  const { data, isLoading, error, isPaused, refetch } = useInvoices(
    status,
    page,
    perPage
  )
  // A paused fetch (unreachable backend) leaves error null + data undefined, so
  // without this the "No invoices" empty state below would lie.
  const isOffline = isPaused && !data

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Invoices"
        description="View and download your billing history."
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/settings/billing' },
          { label: 'Invoices' },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
            <div className="flex gap-2">
              <Select
                value={status || 'all'}
                onValueChange={(v) => {
                  setStatus(v === 'all' ? undefined : v)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  aria-label="Filter by status"
                  className="w-[150px]"
                >
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error || isOffline ? (
            <ErrorState
              size="sm"
              title="Couldn't load invoices"
              offline={isOffline}
              action={{ onClick: () => refetch() }}
            />
          ) : isLoading ? (
            <>
              {/* Desktop: full table skeleton (6 cols: Date, Type, Period, Amount, Status, Actions) */}
              <div className="hidden md:block">
                <DataTableSkeleton columnCount={6} rowCount={5} />
              </div>
              {/* Mobile: card list skeleton */}
              <div className="md:hidden space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard
                    key={i}
                    showImage={false}
                    showHeader={false}
                    bodyLines={3}
                  />
                ))}
              </div>
            </>
          ) : data?.invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices"
              titleAs="h2"
              description={
                status
                  ? 'No invoices match the selected filter.'
                  : 'You have no invoices yet.'
              }
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          {formatTimestampDate(invoice.created_at)}
                        </TableCell>
                        <TableCell>
                          <InvoiceTypeBadge />
                        </TableCell>
                        <TableCell>
                          {invoice.period_start && invoice.period_end
                            ? `${formatTimestampDate(invoice.period_start, { month: 'short', day: 'numeric' })} - ${formatTimestampDate(invoice.period_end)}`
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono tabular-nums">
                            {formatMoney(invoice.amount_due, invoice.currency)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice.pdf_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={`/api/v1/billing/invoices/${invoice.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Download
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {data?.invoices.map((invoice) => (
                  <InvoiceMobileCard key={invoice.id} invoice={invoice} />
                ))}
              </div>

              {/* Pagination */}
              {data && data.total > perPage && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * perPage + 1} to{' '}
                    {Math.min(page * perPage, data.total)} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={page === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!data.has_more}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}

// The backend InvoiceResponse has no billing_reason or type field --- all
// invoices are subscription invoices today. When a non-subscription invoice
// type is added to the API, add a `type` prop here and map it to a label.
function InvoiceTypeBadge() {
  return <Badge variant="outline">Subscription</Badge>
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const variants: Record<
    string,
    'default' | 'secondary' | 'destructive' | 'outline'
  > = {
    paid: 'default',
    open: 'secondary',
    draft: 'outline',
    void: 'destructive',
    uncollectible: 'destructive',
  }

  const labels: Record<string, string> = {
    paid: 'Paid',
    open: 'Open',
    draft: 'Draft',
    void: 'Void',
    uncollectible: 'Uncollectible',
  }

  return (
    <Badge variant={variants[status] || 'outline'}>
      {labels[status] || status}
    </Badge>
  )
}

function InvoiceMobileCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {formatTimestampDate(invoice.created_at)}
        </span>
        <div className="flex gap-2">
          <InvoiceTypeBadge />
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        {invoice.period_start && invoice.period_end
          ? `${formatTimestampDate(invoice.period_start, { month: 'short', day: 'numeric' })} - ${formatTimestampDate(invoice.period_end)}`
          : 'N/A'}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold font-mono tabular-nums">
          {formatMoney(invoice.amount_due, invoice.currency)}
        </span>
        {invoice.pdf_url && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/v1/billing/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
