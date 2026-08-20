/**
 * Returns a Badge variant based on days remaining until a tax protest deadline.
 */
export function urgencyVariant(
  daysRemaining: number | null,
  isPast: boolean
): 'default' | 'secondary' | 'destructive' {
  if (isPast || daysRemaining === null || daysRemaining <= 0)
    return 'destructive'
  if (daysRemaining <= 30) return 'secondary'
  return 'default'
}
