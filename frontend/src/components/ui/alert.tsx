import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 shadow-sm grid gap-x-3 [grid-template-columns:auto_1fr] [&>svg]:flex-shrink-0 [&>svg]:text-foreground [&>svg]:mt-0.5 [&>svg]:row-span-2',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        // F-287: text/icons on the tinted /5 wash use the dark *-strong shades
        // (the DEFAULT semantic colors fail WCAG AA on a near-white background).
        destructive:
          'border-destructive/50 bg-destructive/5 text-destructive-strong  [&>svg]:text-destructive-strong',
        success:
          'border-success/50 bg-success/5 text-success-strong  [&>svg]:text-success-strong',
        warning:
          'border-warning/50 bg-warning/5 text-warning-foreground  [&>svg]:text-warning-foreground',
        info: 'border-info/50 bg-info/5 text-info-strong  [&>svg]:text-info-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-fluid-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }
