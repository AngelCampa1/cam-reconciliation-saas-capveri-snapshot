/**
 * Password Strength Indicator Component
 *
 * Displays real-time password strength feedback with visual indicators.
 * Calculates strength based on password characteristics.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface PasswordStrengthProps {
  password: string
  className?: string
}

/**
 * Calculate password strength score (0-6)
 *
 * Criteria:
 * - Length (0-3 points): 8+ chars = 1pt, 12+ chars = 2pts, 16+ chars = 3pts
 * - Uppercase letter (1 point)
 * - Lowercase letter (1 point)
 * - Number (1 point)
 *
 * Total possible: 6 points
 * - 0-2: Weak
 * - 3-4: Medium
 * - 5-6: Strong
 */
function calculateStrength(password: string): number {
  let score = 0

  // Length scoring
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1

  // Character type scoring
  if (/[A-Z]/.test(password)) score += 1 // Has uppercase
  if (/[a-z]/.test(password)) score += 1 // Has lowercase
  if (/[0-9]/.test(password)) score += 1 // Has number

  return score
}

/**
 * Get strength level text and color based on score
 */
function getStrengthInfo(score: number): {
  label: string
  color: string
  bars: number
} {
  if (score <= 2) {
    return { label: 'Weak', color: 'bg-destructive', bars: 1 }
  } else if (score <= 4) {
    return { label: 'Medium', color: 'bg-warning', bars: 2 }
  } else {
    return { label: 'Strong', color: 'bg-success', bars: 3 }
  }
}

export function PasswordStrength({
  password,
  className,
}: PasswordStrengthProps) {
  const score = useMemo(() => calculateStrength(password), [password])
  const { label, color, bars } = useMemo(() => getStrengthInfo(score), [score])

  // Don't show indicator if password is empty
  if (password.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-200',
              index <= bars ? color : 'bg-muted'
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password strength: <span className="font-medium">{label}</span>
      </p>
    </div>
  )
}
