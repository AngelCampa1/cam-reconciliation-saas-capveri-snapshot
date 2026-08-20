/**
 * Column definitions for the reconciliation grid.
 *
 * Simplified tenant-focused columns since current data is tenant summaries.
 */

import { ColumnDef } from '@tanstack/react-table'

import { ReconciliationRow } from '../../types/reconciliation-row'
import { CurrencyCell } from '../cells/CellRenderers'

/**
 * Column definitions for the reconciliation grid.
 * Focused on tenant data with clean, aligned layout.
 */
export const reconciliationColumns: ColumnDef<ReconciliationRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Tenant',
    size: 200,
    cell: ({ row }) => {
      const name =
        row.original.type === 'expense_pool'
          ? row.original.pool_name
          : row.original.tenant_name
      return (
        <span className="font-medium truncate block" title={name || 'Unknown'}>
          {name || 'Unknown'}
        </span>
      )
    },
  },
  {
    id: 'tenant_share',
    accessorKey: 'tenant_share',
    header: 'Tenant Share',
    size: 140,
    // Displayed as "Tenant Share" but the editable backend field is
    // tenant_share_after_cap (the pre-fee share this column shows).
    meta: { editable: true, field: 'tenant_share_after_cap' },
    cell: ({ row }) => {
      if (row.original.type === 'tenant_summary') {
        // Pre-fee share. Fall back to the all-in total for older snapshots
        // that predate the stored tenant_share_after_cap value.
        return (
          <CurrencyCell
            value={row.original.tenant_share ?? row.original.total_recovery}
          />
        )
      }
      if (row.original.type === 'expense_pool') {
        return <CurrencyCell value={row.original.total_expenses} />
      }
      return <span className="text-muted-foreground">--</span>
    },
  },
  {
    id: 'admin_fee',
    accessorKey: 'admin_fee',
    header: 'Admin Fee',
    size: 120,
    meta: { editable: true },
    cell: ({ row }) => {
      if (row.original.type === 'tenant_summary' && row.original.admin_fee) {
        return <CurrencyCell value={row.original.admin_fee} />
      }
      // F-291: bare "--" has no accessible meaning; aria-hidden the visual dash
      // and add sr-only text so screen readers announce "Not applicable".
      return (
        <span className="text-muted-foreground">
          <span aria-hidden="true">--</span>
          <span className="sr-only">Not applicable</span>
        </span>
      )
    },
  },
  {
    id: 'final_amount',
    accessorKey: 'final_amount',
    header: 'Final Amount',
    size: 140,
    cell: ({ row }) => {
      if (row.original.type === 'tenant_summary') {
        return (
          <span className="font-semibold text-success-strong">
            <CurrencyCell value={row.original.final_amount} />
          </span>
        )
      }
      // F-291: bare "--" has no accessible meaning; aria-hidden the visual dash
      // and add sr-only text so screen readers announce "Not applicable".
      return (
        <span className="text-muted-foreground">
          <span aria-hidden="true">--</span>
          <span className="sr-only">Not applicable</span>
        </span>
      )
    },
  },
]

/**
 * Tenant-only columns for simpler tenant summary view.
 * @deprecated Use reconciliationColumns which handles both types
 */
export const tenantSummaryColumns: ColumnDef<ReconciliationRow>[] = []
