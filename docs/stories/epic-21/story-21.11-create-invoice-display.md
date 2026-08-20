# Story 21.11: Create Invoice Display

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 2
- **Dependencies**: Story 21.7 (Billing History Endpoints), Epic 1 (UI Components)
- **Status**: `pending`

## User Story
**As a** billing administrator
**I want** to view and download my invoices
**So that** I can track expenses and provide records to accounting

## Acceptance Criteria
- [ ] **AC1**: Invoice list page with pagination
- [ ] **AC2**: Filter by status (all, paid, open)
- [ ] **AC3**: Each invoice shows: date, amount, status, period
- [ ] **AC4**: Download PDF button for each invoice
- [ ] **AC5**: Invoice detail view with line items
- [ ] **AC6**: Responsive table for mobile

## Technical Specifications

**Frontend - Invoice List Page**:

```tsx
// frontend/src/pages/settings/Invoices.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useInvoices } from '@/hooks/use-invoices'
import { formatCurrency } from '@/lib/utils'

export function InvoicesPage() {
  const [status, setStatus] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const perPage = 10

  const { data, isLoading } = useInvoices(status, page, perPage)

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/billing">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Billing
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                View and download your billing history
              </CardDescription>
            </div>
            <Select
              value={status || 'all'}
              onValueChange={(v) => {
                setStatus(v === 'all' ? undefined : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
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
                          {format(new Date(invoice.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.period_start), 'MMM d')} -{' '}
                          {format(new Date(invoice.period_end), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(invoice.amount_due, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice.pdf_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a
                                href={`/api/billing/invoices/${invoice.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Download className="h-4 w-4 mr-1" />
                                PDF
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
                      onClick={() => setPage(p => p - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={!data.has_more}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
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
          {format(new Date(invoice.created_at), 'MMM d, yyyy')}
        </span>
        <InvoiceStatusBadge status={invoice.status} />
      </div>
      <div className="text-sm text-muted-foreground">
        {format(new Date(invoice.period_start), 'MMM d')} -{' '}
        {format(new Date(invoice.period_end), 'MMM d, yyyy')}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">
          {formatCurrency(invoice.amount_due, invoice.currency)}
        </span>
        {invoice.pdf_url && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/billing/invoices/${invoice.id}/pdf`}
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

interface Invoice {
  id: string
  stripe_invoice_id: string | null
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  period_start: string
  period_end: string
  pdf_url: string | null
  created_at: string
}
```

**Invoice Summary Component** (for dashboard):

```tsx
// frontend/src/components/billing/InvoiceSummary.tsx
import { useInvoiceSummary } from '@/hooks/use-invoices'
import { formatCurrency } from '@/lib/utils'

export function InvoiceSummary() {
  const { data, isLoading } = useInvoiceSummary()

  if (isLoading || !data) return null

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-sm text-muted-foreground">Total Paid</div>
        <div className="text-xl font-semibold">
          {formatCurrency(data.total_paid, data.currency)}
        </div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Invoices</div>
        <div className="text-xl font-semibold">
          {data.paid_invoices} paid / {data.total_invoices} total
        </div>
      </div>
    </div>
  )
}
```

**Utility Function**:

```typescript
// frontend/src/lib/utils.ts (add to existing)

export function formatCurrency(
  amount: number,
  currency: string = 'usd'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}
```

**Route Registration**:

```tsx
// frontend/src/App.tsx
<Route path="/settings/billing/invoices" element={<InvoicesPage />} />
```

## Test Cases

```typescript
describe('InvoicesPage', () => {
  it('displays invoice list with correct columns', async () => {
    // Mock invoice data
    // Verify date, period, amount, status columns
  })

  it('filters invoices by status', async () => {
    // Select "Paid" filter
    // Verify only paid invoices shown
  })

  it('paginates through invoice list', async () => {
    // Mock 25 invoices
    // Verify first page shows 10
    // Click next, verify page 2
  })

  it('shows download button for invoices with PDF', async () => {
    // Mock invoice with pdf_url
    // Verify download button visible
  })

  it('hides download button when no PDF', async () => {
    // Mock invoice without pdf_url
    // Verify no download button
  })

  it('renders mobile cards on small screens', async () => {
    // Set viewport to mobile
    // Verify card layout used instead of table
  })
})

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'usd')).toBe('$1,234.56')
  })

  it('formats EUR correctly', () => {
    expect(formatCurrency(1234.56, 'eur')).toBe('€1,234.56')
  })
})
```

## Definition of Done
- [ ] Invoice list displays correctly
- [ ] Status filter works
- [ ] Pagination works
- [ ] PDF download works
- [ ] Mobile responsive design
- [ ] Currency formatting correct
