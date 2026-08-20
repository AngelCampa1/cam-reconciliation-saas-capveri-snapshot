/**
 * Column configuration menu component.
 *
 * Provides UI for toggling column visibility and resetting to defaults.
 */

import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { VisibilityState } from '@tanstack/react-table'

export interface ColumnConfig {
  id: string
  label: string
}

export interface ColumnConfigMenuProps {
  columns: ColumnConfig[]
  columnVisibility: VisibilityState
  onVisibilityChange: (columnId: string) => void
  onReset: () => void
  minVisibleColumns?: number
}

/**
 * Column configuration dropdown menu.
 *
 * Features:
 * - Toggle column visibility with checkboxes
 * - Disable checkboxes when at minimum visible columns
 * - Reset to default configuration
 * - Visual indicator for hidden columns
 */
export function ColumnConfigMenu({
  columns,
  columnVisibility,
  onVisibilityChange,
  onReset,
  minVisibleColumns = 3,
}: ColumnConfigMenuProps) {
  // Count visible columns
  const visibleCount = columns.filter(
    (col) => columnVisibility[col.id] !== false
  ).length

  // Check if a column can be hidden
  const canHideColumn = (columnId: string) => {
    const isVisible = columnVisibility[columnId] !== false
    if (!isVisible) {
      // Already hidden, can always toggle back to visible
      return true
    }
    // Can hide if we have more than minimum visible
    return visibleCount > minVisibleColumns
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          data-testid="column-config-button"
        >
          <Settings2 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        data-testid="column-config-menu"
      >
        <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => {
          const isVisible = columnVisibility[column.id] !== false
          const canToggle = canHideColumn(column.id)

          return (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={isVisible}
              disabled={!canToggle}
              onSelect={(e) => {
                // Keep the menu open so several columns can be toggled at once.
                e.preventDefault()
                if (canToggle) {
                  onVisibilityChange(column.id)
                }
              }}
            >
              <span className={!isVisible ? 'text-muted-foreground' : ''}>
                {column.label}
              </span>
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>
          Reset to Defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
