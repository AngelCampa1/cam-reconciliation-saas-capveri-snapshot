/**
 * TenantSelector component.
 *
 * Allows selecting multiple tenants with checkboxes and select all/deselect all functionality.
 */

import { Users } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/EmptyState'
import type { TenantInfo } from '../types'

export interface TenantSelectorProps {
  tenants: TenantInfo[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function TenantSelector({
  tenants,
  selected,
  onChange,
}: TenantSelectorProps) {
  const allSelected = tenants.length > 0 && selected.length === tenants.length
  const someSelected = selected.length > 0 && selected.length < tenants.length

  const handleSelectAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(tenants.map((t) => t.id))
    }
  }

  const handleToggleTenant = (tenantId: string) => {
    if (selected.includes(tenantId)) {
      onChange(selected.filter((id) => id !== tenantId))
    } else {
      onChange([...selected, tenantId])
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="select-all"
            checked={allSelected}
            aria-checked={someSelected ? 'mixed' : allSelected}
            onCheckedChange={handleSelectAll}
          />
          <label
            htmlFor="select-all"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Select All Tenants
          </label>
        </div>
        <div className="text-sm text-muted-foreground">
          {selected.length} of {tenants.length} selected
        </div>
      </div>

      {tenants.length === 0 && (
        <EmptyState
          icon={Users}
          title="No tenants"
          description="No tenants available for export."
          size="sm"
        />
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {tenants.map((tenant) => {
          const isSelected = selected.includes(tenant.id)
          return (
            <div
              key={tenant.id}
              className="flex items-center space-x-2 p-2 rounded-md transition-colors duration-fast hover:bg-muted/50"
            >
              <Checkbox
                id={`tenant-${tenant.id}`}
                checked={isSelected}
                onCheckedChange={() => handleToggleTenant(tenant.id)}
              />
              <label
                htmlFor={`tenant-${tenant.id}`}
                className="flex-1 min-w-0 overflow-hidden text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {tenant.name}
                {tenant.suiteNumber && (
                  <span className="ml-2 text-muted-foreground">
                    Suite {tenant.suiteNumber}
                  </span>
                )}
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
