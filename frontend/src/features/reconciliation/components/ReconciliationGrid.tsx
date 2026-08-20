/**
 * ReconciliationGrid component.
 *
 * High-performance virtualized grid for CAM reconciliation data using
 * TanStack Table + TanStack Virtual for handling 1000+ rows at 60fps.
 *
 * Features mobile-responsive design with automatic viewport switching:
 * - Mobile (<768px): Card-based ReconciliationMobileView
 * - Desktop (>=768px): Virtualized table grid
 */

import { useRef, useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Eye, FileSpreadsheet, Loader2 } from 'lucide-react'

import { ReconciliationRow } from '../types/reconciliation-row'
import { EmptyState } from '@/components/EmptyState'
import { useViewport } from '@/hooks/useViewport'
import { ReconciliationMobileView } from '@/pages/reconciliation/components/ReconciliationMobileView'
import { GroupHeader } from './GroupHeader'
import { useGridKeyboard } from '../hooks/useGridKeyboard'
import { useGroupExpansion } from '../hooks/useGroupExpansion'
import { useCellMutation } from '../hooks/useCellMutation'

export interface ReconciliationGridProps {
  data: ReconciliationRow[]
  columns: ColumnDef<ReconciliationRow>[]
  isLoading?: boolean
  columnVisibility?: Record<string, boolean>
  isFinalized?: boolean
  onTrace?: (row: ReconciliationRow) => void
}

/**
 * Virtualized grid component for reconciliation data.
 *
 * Features:
 * - Handles 1000+ rows without performance degradation
 * - Sticky column headers during scroll
 * - 35px row height for consistent sizing
 * - 5-row overscan for smooth scrolling
 * - Loading and empty states
 * - Group expand/collapse for expense pools
 * - Inline cell editing with optimistic updates
 * - Keyboard navigation
 * - Calculation trace buttons per row
 */
export function ReconciliationGrid({
  data,
  columns,
  isLoading = false,
  columnVisibility = {},
  isFinalized = false,
  onTrace,
}: ReconciliationGridProps) {
  const { isMobile } = useViewport()
  const parentRef = useRef<HTMLDivElement>(null)

  const [editingCell, setEditingCell] = useState<{
    rowId: string
    columnId: string
  } | null>(null)
  const [editingValue, setEditingValue] = useState('')

  // Initialize table and virtualizer hooks unconditionally
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
    },
  })

  const { rows } = table.getRowModel()

  const { focusedCell, setFocusedCell } = useGridKeyboard(table, {
    onEnterEdit: (cell) => {
      const row = rows[cell.rowIndex]
      if (row) {
        const targetCell = row
          .getVisibleCells()
          .find((c) => c.column.id === cell.columnId)
        startEditing(row.id, cell.columnId, targetCell?.getValue())
      }
    },
  })

  const { isGroupExpanded, toggleGroup } = useGroupExpansion()
  const cellMutation = useCellMutation()

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Pre-calculate parent pool ID for each row
  const rowParentMap = useMemo(() => {
    const map: Record<string, string | null> = {}
    let lastPoolId: string | null = null
    rows.forEach((row) => {
      if (row.original.type === 'expense_pool') {
        lastPoolId = row.original.id
      }
      map[row.id] = lastPoolId
    })
    return map
  }, [rows])

  const startEditing = (rowId: string, columnId: string, value?: unknown) => {
    setEditingCell({ rowId, columnId })
    setEditingValue(String(value ?? ''))
  }

  const confirmEdit = (row: ReconciliationRow) => {
    if (!editingCell || row.type !== 'tenant_summary') return
    const numericValue = parseFloat(editingValue)
    if (isNaN(numericValue)) {
      setEditingCell(null)
      return
    }
    // A column's display id can differ from the backend field it writes
    // (e.g. the "tenant_share" column edits tenant_share_after_cap). Resolve
    // the real field from column meta, falling back to the column id.
    const columnMeta = table.getColumn(editingCell.columnId)?.columnDef.meta as
      | { editable?: boolean; field?: string }
      | undefined
    cellMutation.mutate({
      snapshotId: row.id,
      field: columnMeta?.field ?? editingCell.columnId,
      value: numericValue,
    })
    setEditingCell(null)
  }

  // Use mobile-optimized card view on small screens
  if (isMobile) {
    return <ReconciliationMobileView data={data} isLoading={isLoading} />
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center animate-fade-in-up">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center animate-fade-in-up">
        <EmptyState
          icon={FileSpreadsheet}
          title="No reconciliation data"
          description="Create your first reconciliation to get started."
        />
      </div>
    )
  }

  // Calculate column widths
  const headerGroup = table.getHeaderGroups()[0]
  const visibleHeaders = headerGroup?.headers || []
  const firstColId = visibleHeaders[0]?.column.id

  return (
    <div
      ref={parentRef}
      data-testid="reconciliation-grid"
      className="h-full w-full overflow-auto rounded-lg border bg-card"
      data-virtualized
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-sticky bg-muted/95 backdrop-blur-sm border-b">
        <div className="flex">
          {visibleHeaders.map((header, index) => (
            <div
              key={header.id}
              className={`
                px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide
                ${index === 0 ? 'sticky left-0 z-20 min-w-72 flex-1 bg-muted/95 text-left' : 'w-36 text-right'}
              `}
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
            </div>
          ))}
          {/* Trace button column header spacer */}
          {onTrace && <div className="w-10" />}
        </div>
      </div>

      {/* Virtualized Rows */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) return null

          const rowType = row.original.type
          const virtualItemStyle = {
            height: `${virtualItem.size}px`,
            transform: `translateY(${virtualItem.start}px)`,
            position: 'absolute' as const,
            width: '100%',
          }

          // expense_pool → render GroupHeader
          if (rowType === 'expense_pool') {
            const poolRow = row.original
            return (
              <div key={row.id} style={virtualItemStyle}>
                <GroupHeader
                  poolName={poolRow.pool_name}
                  subtotal={poolRow.total_expenses || '0'}
                  isExpanded={isGroupExpanded(poolRow.id)}
                  onToggle={() => toggleGroup(poolRow.id)}
                />
              </div>
            )
          }

          // tenant_summary → render as grid row
          const cells = row.getVisibleCells()
          const parentId = rowParentMap[row.id]
          const isHidden =
            parentId !== null &&
            parentId !== undefined &&
            !isGroupExpanded(parentId)

          return (
            <div
              key={row.id}
              data-testid="grid-row"
              data-row-id={row.original.id}
              data-row-type={row.original.type}
              data-parent-id={parentId ?? undefined}
              style={{
                ...virtualItemStyle,
                display: isHidden ? 'none' : undefined,
              }}
              className="flex items-center border-b border-border/30 transition-colors duration-fast hover:bg-muted/50 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() =>
                firstColId &&
                setFocusedCell({
                  rowIndex: virtualItem.index,
                  columnId: firstColId,
                })
              }
              tabIndex={0}
              onKeyDown={(e) => {
                // The row is a focusable grid row (no button role), so only
                // Enter activates it. Leaving Space alone preserves the
                // browser's native page-scroll behavior for keyboard users.
                if (e.key === 'Enter' && firstColId) {
                  setFocusedCell({
                    rowIndex: virtualItem.index,
                    columnId: firstColId,
                  })
                }
              }}
            >
              {cells.map((cell, index) => {
                const isEditable =
                  !isFinalized &&
                  row.original.type === 'tenant_summary' &&
                  (
                    cell.column.columnDef.meta as
                      | { editable?: boolean }
                      | undefined
                  )?.editable === true
                const isFocused =
                  focusedCell?.rowIndex === virtualItem.index &&
                  focusedCell.columnId === cell.column.id
                const isEditing =
                  editingCell?.rowId === row.id &&
                  editingCell.columnId === cell.column.id

                return (
                  <div
                    key={cell.id}
                    data-testid={isEditable ? 'editable-cell' : undefined}
                    data-focused={isFocused ? 'true' : undefined}
                    className={`
                      px-4 text-sm
                      ${index === 0 ? 'sticky left-0 z-10 min-w-72 flex-1 bg-card group-hover:bg-muted/50' : 'w-36 text-right tabular-nums'}
                    `}
                    onDoubleClick={() =>
                      isEditable &&
                      startEditing(row.id, cell.column.id, cell.getValue())
                    }
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          autoFocus
                          aria-label={`Edit ${cell.column.id}`}
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => confirmEdit(row.original)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              confirmEdit(row.original)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              setEditingCell(null)
                            }
                          }}
                          className="w-full border rounded px-1 text-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Save ${cell.column.id}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => confirmEdit(row.original)}
                          className="rounded-full border px-2 py-0.5 text-xs"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className={index === 0 ? 'truncate' : undefined}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Trace button */}
              {onTrace && (
                <button
                  data-testid="trace-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTrace(row.original)
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-70 transition-colors hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={
                    row.original.type === 'tenant_summary'
                      ? `View calculation trace for ${row.original.tenant_name}`
                      : 'View calculation trace'
                  }
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
