/**
 * SB1103DeadlineBadge
 *
 * Displays the SB 1103 response deadline status as a colored badge.
 * Color coding:
 * - Delivered → grey
 * - days_remaining < 0 → red "Overdue (Nd)"
 * - days_remaining ≤ 7 → red "Nd remaining"
 * - days_remaining ≤ 14 → yellow "Nd remaining"
 * - else → green "Nd remaining"
 */
import { Badge } from '@/components/ui/badge'

interface SB1103DeadlineBadgeProps {
  status: string
  daysRemaining: number
}

export function SB1103DeadlineBadge({
  status,
  daysRemaining,
}: SB1103DeadlineBadgeProps) {
  if (status === 'delivered') {
    return <Badge variant="secondary">Delivered</Badge>
  }

  if (daysRemaining < 0) {
    return (
      <Badge variant="destructive">Overdue ({Math.abs(daysRemaining)}d)</Badge>
    )
  }

  if (daysRemaining <= 7) {
    return <Badge variant="destructive">{daysRemaining}d remaining</Badge>
  }

  if (daysRemaining <= 14) {
    return (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
        {daysRemaining}d remaining
      </Badge>
    )
  }

  return (
    <Badge className="bg-success text-success-foreground hover:bg-success/90">
      {daysRemaining}d remaining
    </Badge>
  )
}
