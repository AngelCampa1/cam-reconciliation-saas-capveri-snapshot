/**
 * Badge Component
 *
 * A versatile badge component for displaying status, labels, and counts.
 * Built with shadcn/ui design patterns.
 */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90',
        outline: 'text-foreground',
        success:
          'border-transparent bg-success-strong text-success-foreground hover:bg-success-strong/90',
        warning:
          'border-transparent bg-warning text-warning-foreground hover:bg-warning/80',
        info: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        // Extended status variants for workflow states
        neutral:
          'border-transparent bg-status-neutral text-status-neutral-foreground hover:bg-status-neutral/80',
        pending:
          'border-transparent bg-status-pending text-status-pending-foreground hover:bg-status-pending/80',
        'in-progress':
          'border-transparent bg-status-in-progress text-status-in-progress-foreground hover:bg-status-in-progress/80',
        draft:
          'border-transparent bg-status-draft text-status-draft-foreground hover:bg-status-draft/80',
        verified:
          'border-transparent bg-status-verified text-status-verified-foreground hover:bg-status-verified/80',
        archived:
          'border-transparent bg-status-archived text-status-archived-foreground hover:bg-status-archived/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
