/**
 * BackButton Component
 *
 * A reusable navigation button that allows users to go back to a previous page.
 * Features:
 * - Uses browser history by default (navigate(-1))
 * - Optional explicit target route via `to` prop
 * - Accessible with proper ARIA labels
 * - Keyboard navigable
 * - Mobile-optimized touch targets
 */
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface BackButtonProps extends Omit<
  ButtonProps,
  'onClick' | 'children'
> {
  /** Explicit target route (overrides browser back) */
  to?: string
  /** Custom label text (default: "Back") */
  label?: string
}

/**
 * BackButton - Navigate to previous page or explicit route
 *
 * @example
 * ```tsx
 * // Browser back
 * <BackButton />
 *
 * // Explicit target
 * <BackButton to="/properties" label="Back to Properties" />
 * ```
 */
export function BackButton({
  to,
  label = 'Back',
  variant = 'ghost',
  className,
  ...props
}: BackButtonProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (to) {
      navigate(to)
    } else {
      navigate(-1)
    }
  }

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      className={cn('gap-2', className)}
      aria-label="Navigate back"
      {...props}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  )
}
