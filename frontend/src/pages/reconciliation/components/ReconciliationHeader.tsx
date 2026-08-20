/**
 * ReconciliationHeader Component
 *
 * Displays summary statistics for a reconciliation period.
 * Compact stat cards showing key metrics at a glance.
 */
import { Building2, Users, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/money'
import type { Property } from '@/api/client'

interface ReconciliationHeaderProps {
  property: Property
  year: string
  totalTenants: number
  totalRecovery: number
  isFinalized: boolean
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  wrap = false,
}: {
  icon: React.ElementType
  label: string
  value: string | React.ReactNode
  subValue?: string
  /**
   * When true, render a long text value across up to two lines instead of
   * clipping it to one. Used for the property name, which is the most
   * variable-length value in the header and the one the user is actively
   * working on (F-294: a 22-char name was being clipped to "Test Plaza Sho…").
   */
  wrap?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <div
          className={
            wrap
              ? 'text-base font-semibold leading-snug line-clamp-2 break-words'
              : 'text-lg font-semibold truncate'
          }
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </div>
        {subValue && (
          <p
            className="text-xs text-muted-foreground truncate"
            title={subValue}
          >
            {subValue}
          </p>
        )}
      </div>
    </div>
  )
}

export function ReconciliationHeader({
  property,
  totalTenants,
  totalRecovery,
  isFinalized,
}: ReconciliationHeaderProps) {
  return (
    <div className="border-b py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Property"
          value={property.name}
          wrap
        />
        <StatCard
          icon={Users}
          label="Tenants"
          value={totalTenants.toString()}
          subValue={totalTenants === 1 ? 'Active lease' : 'Active leases'}
        />
        <StatCard
          icon={DollarSign}
          label="Tenant Billable"
          value={
            <span className="tabular-nums font-mono">
              {formatMoney(totalRecovery)}
            </span>
          }
        />
        <StatCard
          icon={isFinalized ? CheckCircle : Clock}
          label="Status"
          value={
            <Badge
              variant={isFinalized ? 'success' : 'secondary'}
              className="gap-1"
            >
              {isFinalized ? 'Finalized' : 'Draft'}
            </Badge>
          }
        />
      </div>
    </div>
  )
}
