/**
 * Per-tenant signed variance table with expandable per-pool breakdowns.
 *
 * Each row shows one tenant's CapVeri-correct amount, what the other system
 * charged, the signed difference, a direction badge, and the percent. When a
 * tenant carries `pool_breakdowns` (pool mode on), the row expands to show the
 * same columns split by expense pool.
 *
 * Display only. Every number comes straight from the backend's decimal strings.
 */
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import type { TenantVariance, PoolVariance } from '@/api/comparison'
import {
  directionBadgeVariant,
  directionLabel,
  directionTextColor,
  formatVariancePct,
  signedMoney,
} from '../utils/variance'

interface TenantVarianceTableProps {
  tenants: TenantVariance[]
}

function DirectionBadge({
  direction,
}: {
  direction: TenantVariance['direction']
}) {
  return (
    <Badge variant={directionBadgeVariant(direction)}>
      {directionLabel(direction)}
    </Badge>
  )
}

function MatchBadge({ tenant }: { tenant: TenantVariance }) {
  if (tenant.match_status !== 'needs_review') {
    return null
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-warning-foreground">
      <Badge variant="outline" className="rounded-full">
        <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
        Needs match
      </Badge>
      {tenant.match_note && <span>{tenant.match_note}</span>}
    </div>
  )
}

function PoolRows({ pools }: { pools: PoolVariance[] }) {
  if (pools.length === 0) {
    return (
      <tr className="border-b bg-muted/20">
        <td
          colSpan={6}
          className="py-2 pl-12 pr-3 text-xs text-muted-foreground"
        >
          No pool-level detail for this tenant.
        </td>
      </tr>
    )
  }
  return (
    <>
      {pools.map((pool) => (
        <tr key={pool.pool_id} className="border-b bg-muted/20 text-sm">
          <td className="py-2 pl-12 pr-3">
            <span className="text-muted-foreground">
              {pool.pool_name ?? pool.pool_id}
            </span>
          </td>
          <td className="p-2 text-right font-mono tabular-nums">
            {formatMoney(pool.capveri_correct)}
          </td>
          <td className="p-2 text-right font-mono tabular-nums">
            {formatMoney(pool.actual_charged)}
          </td>
          <td
            className={cn(
              'p-2 text-right font-mono font-medium tabular-nums',
              directionTextColor(pool.direction)
            )}
          >
            {signedMoney(pool.variance, (v) => formatMoney(v))}
          </td>
          <td className="p-2">
            <DirectionBadge direction={pool.direction} />
          </td>
          <td className="p-2 text-right tabular-nums">
            {formatVariancePct(pool.variance_pct)}
          </td>
        </tr>
      ))}
    </>
  )
}

export function TenantVarianceTable({ tenants }: TenantVarianceTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (leaseId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(leaseId)) {
        next.delete(leaseId)
      } else {
        next.add(leaseId)
      }
      return next
    })
  }

  if (tenants.length === 0) {
    return (
      <div className="rounded-md border">
        <EmptyState
          icon={Users}
          title="No tenants to compare yet"
          description="There are no tenants to compare for this period yet."
          size="sm"
        />
      </div>
    )
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-md border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Per-tenant comparison of CapVeri-correct amounts against the other
          system
        </caption>
        <thead>
          <tr className="border-b bg-muted/60">
            <th scope="col" className="p-3 text-left font-semibold">
              Tenant
            </th>
            <th scope="col" className="p-3 text-right font-semibold">
              CapVeri correct
            </th>
            <th scope="col" className="p-3 text-right font-semibold">
              Other system
            </th>
            <th scope="col" className="p-3 text-right font-semibold">
              Difference
            </th>
            <th scope="col" className="p-3 text-left font-semibold">
              Result
            </th>
            <th scope="col" className="p-3 text-right font-semibold">
              Percent
            </th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => {
            const hasPools =
              tenant.pool_breakdowns !== null &&
              tenant.pool_breakdowns !== undefined
            const isOpen = expanded.has(tenant.lease_id)
            return (
              <FragmentRow
                key={tenant.lease_id}
                tenant={tenant}
                hasPools={hasPools}
                isOpen={isOpen}
                onToggle={() => toggle(tenant.lease_id)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({
  tenant,
  hasPools,
  isOpen,
  onToggle,
}: {
  tenant: TenantVariance
  hasPools: boolean
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b transition-colors hover:bg-muted/40">
        <td className="p-3">
          <div className="flex items-center gap-2">
            {hasPools ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-label={isOpen ? 'Hide pool detail' : 'Show pool detail'}
                data-testid={`toggle-pools-${tenant.lease_id}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            ) : (
              <span className="inline-block w-6 shrink-0" />
            )}
            <span className="font-medium">
              {tenant.tenant_name ?? tenant.lease_id}
            </span>
          </div>
          <MatchBadge tenant={tenant} />
        </td>
        <td className="p-3 text-right font-mono tabular-nums">
          {formatMoney(tenant.capveri_correct)}
        </td>
        <td className="p-3 text-right font-mono tabular-nums">
          {formatMoney(tenant.actual_charged)}
        </td>
        <td
          className={cn(
            'p-3 text-right font-mono font-semibold tabular-nums',
            directionTextColor(tenant.direction)
          )}
        >
          {signedMoney(tenant.variance, (v) => formatMoney(v))}
        </td>
        <td className="p-3">
          <DirectionBadge direction={tenant.direction} />
        </td>
        <td className="p-3 text-right tabular-nums">
          {formatVariancePct(tenant.variance_pct)}
        </td>
      </tr>
      {hasPools && isOpen && <PoolRows pools={tenant.pool_breakdowns ?? []} />}
    </>
  )
}
