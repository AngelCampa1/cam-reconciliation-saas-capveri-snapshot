/**
 * TaxProtestDeadlineCard: dashboard reminder for upcoming tax protest deadlines.
 *
 * Only renders January to June (month <= 6) and only when configured properties exist.
 * Shows up to 3 properties sorted by days_remaining ascending.
 */
import { Link } from 'react-router-dom'
import { Landmark, ChevronRight } from 'lucide-react'
import { useTaxProtestDeadlines } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { urgencyVariant } from '@/features/tax-protest/lib/urgency'

interface TaxProtestDeadlineCardProps {
  /** Current month 1 to 12. Defaults to `new Date().getMonth() + 1`. */
  currentMonth?: number
}

export function TaxProtestDeadlineCard({
  currentMonth = new Date().getMonth() + 1,
}: TaxProtestDeadlineCardProps) {
  const { data, isLoading } = useTaxProtestDeadlines()

  if (currentMonth > 6) return null
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }
  if (!data) return null

  const configured = data.items.filter((item) => item.is_configured)
  if (configured.length === 0) return null

  const sorted = [...configured].sort((a, b) => {
    if (a.days_remaining === null) return 1
    if (b.days_remaining === null) return -1
    return a.days_remaining - b.days_remaining
  })

  const topItems = sorted.slice(0, 3)

  return (
    <Card data-testid="tax-protest-deadline-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle
          as="h2"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Landmark className="h-4 w-4" aria-hidden="true" />
          Tax Protest Deadlines
        </CardTitle>
        <Link
          to="/tax-protest"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View All
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {topItems.map((item) => (
          <div
            key={item.property_id}
            data-testid={`deadline-row-${item.property_id}`}
            className="flex items-center justify-between text-sm"
          >
            <div>
              <p className="font-medium leading-tight">{item.property_name}</p>
              <p className="text-xs text-muted-foreground">
                {item.county}, {item.state}
              </p>
            </div>
            <Badge variant={urgencyVariant(item.days_remaining, item.is_past)}>
              {item.is_past
                ? 'Past'
                : item.days_remaining === 0
                  ? 'Today'
                  : item.days_remaining !== null
                    ? `${item.days_remaining}d`
                    : (item.effective_deadline ?? 'N/A')}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
