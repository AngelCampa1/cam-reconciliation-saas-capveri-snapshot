/**
 * Summary stat cards for a system comparison result.
 *
 * Shows the net direction plus both-direction totals and tenant counts. All
 * money figures are rendered from the backend's exact decimal strings.
 */
import { StatCard } from '@/components/ui/stat-card'
import { formatMoney } from '@/lib/money'
import { ArrowDownRight, ArrowUpRight, Scale, CheckCircle2 } from 'lucide-react'
import type { ComparisonResult } from '@/api/comparison'
import { signedMoney } from '../utils/variance'

interface ComparisonSummaryProps {
  result: ComparisonResult
}

export function ComparisonSummary({ result }: ComparisonSummaryProps) {
  const netVariance = signedMoney(result.total_net_variance, (v) =>
    formatMoney(v)
  )

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="comparison-summary"
    >
      <StatCard
        title="Net difference"
        value={netVariance}
        icon={Scale}
        iconColor="primary"
        mono
      />
      <StatCard
        title={`Overcharged (${result.overcharge_count})`}
        value={formatMoney(result.total_overcharge)}
        icon={ArrowUpRight}
        iconColor="warning"
        mono
      />
      <StatCard
        title={`Undercharged (${result.undercharge_count})`}
        value={formatMoney(result.total_undercharge)}
        icon={ArrowDownRight}
        iconColor="warning"
        mono
      />
      <StatCard
        title={`Match (${result.match_count})`}
        value={String(result.match_count)}
        icon={CheckCircle2}
        iconColor="success"
      />
    </div>
  )
}
