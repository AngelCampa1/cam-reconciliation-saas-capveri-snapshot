/**
 * Cap Bank Ledger Table
 *
 * Displays year-by-year cap bank timeline with opening/closing balances,
 * deposits, and drawdowns. Uses TanStack Table for sortable columns.
 */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

import type { CapBankLedgerEntry } from '@/api/hooks'
import { formatMoney } from '@/lib/money'

const columnHelper = createColumnHelper<CapBankLedgerEntry>()

function fmtUsd(value: string): string {
  // Format the backend's exact decimal money string directly. Routing through
  // parseFloat first would coerce it to a JS float and reintroduce drift on the
  // large cap thresholds and bank balances landlords verify against (F-430).
  return formatMoney(value)
}

function formatPeriod(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  const startYear = startDate.getFullYear()
  const endYear = endDate.getFullYear()
  if (startYear === endYear) return `${startYear}`
  return `${startYear}-${endYear}`
}

const columns = [
  columnHelper.display({
    id: 'period',
    header: 'Period',
    cell: ({ row }) =>
      formatPeriod(row.original.period_start, row.original.period_end),
  }),
  columnHelper.accessor('cap_threshold', {
    header: 'Cap Threshold',
    cell: (info) => (
      <span className="font-mono tabular-nums">{fmtUsd(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('actual_expense', {
    header: 'Actual Expense',
    cell: (info) => (
      <span className="font-mono tabular-nums">{fmtUsd(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('amount_applied', {
    header: 'Amount Applied',
    cell: (info) => (
      <span className="font-mono tabular-nums font-medium">
        {fmtUsd(info.getValue())}
      </span>
    ),
  }),
  columnHelper.accessor('excess_absorbed_by_landlord', {
    header: 'Landlord Absorbed',
    cell: (info) => {
      const val = parseFloat(info.getValue())
      if (val === 0)
        return (
          <span className="font-mono tabular-nums text-muted-foreground">
            --
          </span>
        )
      return (
        <span className="font-mono tabular-nums text-destructive-strong">
          {fmtUsd(info.getValue())}
        </span>
      )
    },
  }),
  columnHelper.accessor('bank_opening', {
    header: 'Bank Opening',
    cell: (info) => (
      <span className="font-mono tabular-nums">{fmtUsd(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor('bank_change', {
    header: 'Bank Change',
    cell: (info) => {
      const val = parseFloat(info.getValue())
      const color =
        val > 0
          ? 'text-success-strong'
          : val < 0
            ? 'text-destructive-strong'
            : 'text-muted-foreground'
      const prefix = val > 0 ? '+' : ''
      return (
        <span className={`font-mono tabular-nums font-medium ${color}`}>
          {prefix}
          {fmtUsd(info.getValue())}
        </span>
      )
    },
  }),
  columnHelper.accessor('bank_closing', {
    header: 'Bank Closing',
    cell: (info) => (
      <span className="font-mono tabular-nums font-semibold">
        {fmtUsd(info.getValue())}
      </span>
    ),
  }),
]

interface CapBankLedgerTableProps {
  entries: CapBankLedgerEntry[]
}

export function CapBankLedgerTable({ entries }: CapBankLedgerTableProps) {
  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <caption className="sr-only">Cap bank ledger timeline</caption>
        <thead className="border-b bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-muted-foreground"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b last:border-0 hover:bg-muted/30"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
