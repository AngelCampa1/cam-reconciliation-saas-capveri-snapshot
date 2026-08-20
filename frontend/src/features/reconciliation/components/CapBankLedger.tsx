/**
 * Cap Bank Ledger Component
 *
 * Displays the cumulative cap bank timeline for a lease.
 * Shows summary header with key metrics and a year-by-year table.
 */
import { TrendingUp } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { useCapBankLedger } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { snakeToTitleCase } from '@/lib/title-case'

import { CapBankLedgerTable } from './CapBankLedgerTable'

interface CapBankLedgerProps {
  leaseId: string
}

export function CapBankLedger({ leaseId }: CapBankLedgerProps) {
  const {
    data: ledger,
    isLoading,
    error,
    isPaused,
    refetch,
  } = useCapBankLedger(leaseId)
  const isOffline = isPaused && !ledger

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">
              Loading cap bank ledger…
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || isOffline) {
    return (
      <Card>
        <CardContent className="py-8">
          <ErrorState
            size="sm"
            title="Couldn't load cap history"
            offline={isOffline}
            action={{ onClick: () => refetch() }}
          />
        </CardContent>
      </Card>
    )
  }

  if (!ledger || ledger.entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={TrendingUp}
            title="No cap history yet"
            description="No finalized reconciliation periods with cumulative caps yet."
            size="sm"
          />
        </CardContent>
      </Card>
    )
  }

  const capRatePercent = (parseFloat(ledger.cap_rate) * 100).toFixed(1)

  // The two summary balances are exact decimal money strings from the backend.
  // formatMoney parses them directly; a parseFloat round-trip would reintroduce
  // float drift on the large cumulative cap totals landlords reconcile (F-430).

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cap Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">
              {snakeToTitleCase(ledger.cap_type)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cap Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{capRatePercent}%</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold tabular-nums">
              {formatMoney(ledger.current_bank_balance)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Landlord Absorbed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold tabular-nums text-destructive">
              {formatMoney(ledger.total_landlord_absorbed)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cap Bank Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <CapBankLedgerTable entries={ledger.entries} />
        </CardContent>
      </Card>

      {/* Fine-print verification disclaimer */}
      <p className="mt-2 text-xs text-muted-foreground">
        These numbers come from your files and may have errors. Check your lease
        and GL before you act on them.
      </p>
    </div>
  )
}
