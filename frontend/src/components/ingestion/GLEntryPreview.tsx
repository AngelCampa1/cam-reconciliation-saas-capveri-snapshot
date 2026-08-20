import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { pluralizeWithCount } from '@/lib/pluralize'
import {
  Download,
  Search,
  Calendar,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

export interface GLEntry {
  id: string
  date: Date
  account: string
  description: string
  // Money values are exact decimal STRINGS from the backend (never floats).
  debit: string | null
  credit: string | null
  balance: string
}

interface GLEntryPreviewProps {
  entries: GLEntry[]
  importBatchId?: string
  onViewImportBatch?: (batchId: string) => void
  onExportCSV?: () => void
  pageSize?: number
}

type SortColumn =
  | 'date'
  | 'account'
  | 'description'
  | 'debit'
  | 'credit'
  | 'balance'
type SortDirection = 'asc' | 'desc' | null

export function GLEntryPreview({
  entries,
  importBatchId,
  onViewImportBatch,
  onExportCSV,
  pageSize = 50,
}: GLEntryPreviewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  // Filter entries based on search and date range
  const filteredEntries = useMemo(() => {
    let result = [...entries]

    // Search filter (account or description)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (entry) =>
          entry.account.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query)
      )
    }

    // Date range filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      result = result.filter((entry) => entry.date >= fromDate)
    }
    if (dateTo) {
      const toDate = new Date(dateTo)
      result = result.filter((entry) => entry.date <= toDate)
    }

    return result
  }, [entries, searchQuery, dateFrom, dateTo])

  // Sort entries
  const sortedEntries = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return filteredEntries
    }

    return [...filteredEntries].sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      // Handle date sorting
      if (sortColumn === 'date') {
        aValue = a.date.getTime()
        bValue = b.date.getTime()
      }
      // Numeric money columns: compare as numbers (sort ordering only; display
      // still uses the exact decimal string). Null debit/credit sort as 0.
      else if (
        sortColumn === 'debit' ||
        sortColumn === 'credit' ||
        sortColumn === 'balance'
      ) {
        aValue = Number(a[sortColumn] ?? 0)
        bValue = Number(b[sortColumn] ?? 0)
      }
      // Handle text columns (account, description)
      else {
        aValue = a[sortColumn] as string
        bValue = b[sortColumn] as string
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [filteredEntries, sortColumn, sortDirection])

  // Paginate entries
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return sortedEntries.slice(startIndex, endIndex)
  }, [sortedEntries, currentPage, pageSize])

  const totalPages = Math.ceil(sortedEntries.length / pageSize)

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction or clear sort
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const formatCurrency = (amount: string | null) => {
    if (amount === null) return '-'
    // Exact decimal-string formatting (no float coercion). See lib/money.ts.
    return formatMoney(amount)
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1" aria-hidden="true" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1" aria-hidden="true" />
    }
    return <ArrowDown className="h-3 w-3 ml-1" aria-hidden="true" />
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="space-y-4">
      {/* Header with Import Batch Link */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">GL Entry Preview</h3>
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            {sortedEntries.length} entr
            {sortedEntries.length !== 1 ? 'ies' : 'y'}{' '}
            {searchQuery || dateFrom || dateTo ? '(filtered)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {importBatchId && onViewImportBatch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewImportBatch(importBatchId)}
            >
              <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
              View Import Batch
            </Button>
          )}
          {onExportCSV && (
            <Button variant="outline" size="sm" onClick={onExportCSV}>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Export to CSV
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Search Account or Description</Label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="search"
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1) // Reset to first page on search
              }}
              className="pl-9"
            />
          </div>
        </div>

        {/* Date From */}
        <div className="space-y-2">
          <Label htmlFor="date-from">Date From</Label>
          <div className="relative">
            <Calendar
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9"
            />
          </div>
        </div>

        {/* Date To */}
        <div className="space-y-2">
          <Label htmlFor="date-to">Date To</Label>
          <div className="relative">
            <Calendar
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">GL entry preview</caption>
            <thead className="bg-muted/50">
              <tr>
                <th
                  className="text-left p-3"
                  aria-sort={
                    sortColumn === 'date'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center text-sm font-medium hover:text-foreground"
                  >
                    Date
                    {getSortIcon('date')}
                  </button>
                </th>
                <th
                  className="text-left p-3"
                  aria-sort={
                    sortColumn === 'account'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('account')}
                    className="flex items-center text-sm font-medium hover:text-foreground"
                  >
                    Account
                    {getSortIcon('account')}
                  </button>
                </th>
                <th
                  className="text-left p-3"
                  aria-sort={
                    sortColumn === 'description'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('description')}
                    className="flex items-center text-sm font-medium hover:text-foreground"
                  >
                    Description
                    {getSortIcon('description')}
                  </button>
                </th>
                <th
                  className="text-right p-3"
                  aria-sort={
                    sortColumn === 'debit'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('debit')}
                    className="flex items-center justify-end text-sm font-medium hover:text-foreground w-full"
                  >
                    Debit
                    {getSortIcon('debit')}
                  </button>
                </th>
                <th
                  className="text-right p-3"
                  aria-sort={
                    sortColumn === 'credit'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('credit')}
                    className="flex items-center justify-end text-sm font-medium hover:text-foreground w-full"
                  >
                    Credit
                    {getSortIcon('credit')}
                  </button>
                </th>
                <th
                  className="text-right p-3"
                  aria-sort={
                    sortColumn === 'balance'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => handleSort('balance')}
                    className="flex items-center justify-end text-sm font-medium hover:text-foreground w-full"
                  >
                    Balance
                    {getSortIcon('balance')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No entries found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-t transition-colors duration-fast hover:bg-muted/50',
                      index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                    )}
                  >
                    <td className="p-3 text-sm">{formatDate(entry.date)}</td>
                    <td className="p-3 text-sm font-mono max-w-0 w-[120px]">
                      <span
                        className="block truncate max-w-[120px]"
                        title={entry.account}
                      >
                        {entry.account}
                      </span>
                    </td>
                    <td className="p-3 text-sm max-w-0 w-[200px]">
                      <span
                        className="block truncate max-w-[200px]"
                        title={entry.description}
                      >
                        {entry.description}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(entry.debit)}
                    </td>
                    <td className="p-3 text-sm text-right font-mono tabular-nums">
                      {formatCurrency(entry.credit)}
                    </td>
                    <td
                      className={cn(
                        'p-3 text-sm text-right font-mono tabular-nums font-medium',
                        Number(entry.balance) < 0
                          ? 'text-destructive-strong'
                          : 'text-success-strong'
                      )}
                    >
                      {formatCurrency(entry.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t p-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedEntries.length)} of{' '}
              {pluralizeWithCount(sortedEntries.length, 'entry', 'entries')}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="text-sm">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
