/**
 * Leakage Summary Card Component
 *
 * Dashboard widget that shows a billing issue caught in the latest comparison.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { logger } from '@/lib/logger'
import { getSession } from '@/api/client'
import { resolveApiUrl } from '@/api/url'

interface LeakageData {
  property_id: string
  property_name?: string
  capveri_calculated: number
  actual_billed: number
  leakage: number
  leakage_pct: number
}

interface LeakageSummaryCardProps {
  propertyId?: string
}

export function LeakageSummaryCard({ propertyId }: LeakageSummaryCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [leakageData, setLeakageData] = useState<LeakageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const fetchLeakage = async () => {
      if (!propertyId) {
        setIsLoading(false)
        return
      }

      try {
        const currentYear = new Date().getFullYear()
        const periodStart = `${currentYear - 1}-01-01`
        const periodEnd = `${currentYear - 1}-12-31`

        const session = await getSession()
        const response = await fetch(
          resolveApiUrl(
            `/api/v1/leakage/${propertyId}?period_start=${periodStart}&period_end=${periodEnd}`
          ),
          {
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {},
          }
        )

        if (!response.ok) {
          setLeakageData(null)
          return
        }

        const data = await response.json()

        if (
          data.leakage !== 0 &&
          data.has_reconciliation_data &&
          data.has_billing_data
        ) {
          setLeakageData(data)
        }
      } catch (err) {
        logger.error('Failed to fetch leakage data for dashboard', {
          error: err,
        })
        setError('Failed to load leakage data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLeakage()
  }, [propertyId])

  if (isLoading) {
    return <SkeletonCard showImage={false} showHeader bodyLines={4} />
  }

  if (error) {
    return null
  }

  if (!leakageData || leakageData.leakage === 0) {
    return null
  }

  const isOverbilling = leakageData.leakage < 0
  const issueTitle = isOverbilling ? 'Over-bill to fix' : 'Under-bill to fix'
  const issuePercentText = isOverbilling
    ? `${Math.abs(leakageData.leakage_pct).toFixed(1)}% more than calculated`
    : `${leakageData.leakage_pct.toFixed(1)}% less than calculated`

  if (isOverbilling) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-primary">
            <AlertTriangle className="h-5 w-5" />
            {issueTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground font-mono tabular-nums">
                {formatMoney(Math.abs(leakageData.leakage))}
              </span>
              <span className="text-sm text-muted-foreground">
                ({issuePercentText})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">CapVeri Calculated</p>
                <p className="font-medium font-mono tabular-nums">
                  {formatMoney(leakageData.capveri_calculated)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">What You Billed</p>
                <p className="font-medium font-mono tabular-nums">
                  {formatMoney(leakageData.actual_billed)}
                </p>
              </div>
            </div>

            {/* Fine-print verification disclaimer */}
            <p className="mt-2 text-xs text-muted-foreground">
              These numbers come from your files and may have errors. Check your
              lease and GL before you act on them.
            </p>

            <div className="pt-2">
              <Button asChild className="w-full rounded-full" size="sm">
                <Link to={`/properties/${propertyId}/reconciliations`}>
                  View issue details
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-primary">
          <AlertTriangle className="h-5 w-5" />
          {issueTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground font-mono tabular-nums">
              {formatMoney(leakageData.leakage)}
            </span>
            <span className="text-sm text-muted-foreground">
              ({issuePercentText})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">CapVeri Calculated</p>
              <p className="font-medium font-mono tabular-nums">
                {formatMoney(leakageData.capveri_calculated)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">What You Billed</p>
              <p className="font-medium font-mono tabular-nums">
                {formatMoney(leakageData.actual_billed)}
              </p>
            </div>
          </div>

          {/* Fine-print verification disclaimer */}
          <p className="mt-2 text-xs text-muted-foreground">
            These numbers come from your files and may have errors. Check your
            lease and GL before you act on them.
          </p>

          <div className="pt-2">
            <Button asChild className="w-full rounded-full" size="sm">
              <Link to={`/properties/${propertyId}/reconciliations`}>
                View issue details
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
