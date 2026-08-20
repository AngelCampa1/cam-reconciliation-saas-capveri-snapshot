import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground transition-all duration-normal ease-out-expo',
  {
    variants: {
      variant: {
        default: 'border-border-subtle shadow-sm',
        elevated: ['border-border-subtle', 'shadow-sm', 'hover:shadow-md'].join(
          ' '
        ),
        interactive: [
          'border-border-subtle',
          'shadow-sm',
          'cursor-pointer',
          'hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5',
          'active:shadow-sm active:translate-y-0',
        ].join(' '),
        outline: 'border-border shadow-none',
        ghost: 'border-transparent bg-transparent shadow-none',
      },
      accent: {
        none: '',
        primary: 'border-l-[3px] border-l-primary',
        success: 'border-l-[3px] border-l-success',
        warning: 'border-l-[3px] border-l-warning',
        destructive: 'border-l-[3px] border-l-destructive',
        info: 'border-l-[3px] border-l-info',
      },
    },
    defaultVariants: {
      variant: 'default',
      accent: 'none',
    },
  }
)

interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, accent, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, accent }), className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const cardHeaderVariants = cva('flex flex-col space-y-1.5 p-6', {
  variants: {
    variant: {
      default: '',
      // Tinted header washes drop muted-foreground description text below WCAG
      // AA (≈3.97:1 on the wash vs 4.7:1 on plain white). Bump descendant
      // description/paragraph text to the full foreground color so it passes on
      // the tint; the descendant selector wins on specificity over the <p>'s own
      // text-muted-foreground utility. Title weight still separates the heading.
      // (F-303; same muted-on-tint remedy as F-348.)
      gradient:
        'bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-lg [&_p]:text-foreground',
      muted:
        'bg-gradient-to-r from-muted/50 to-muted/30 rounded-t-lg [&_p]:text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface CardHeaderProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardHeaderVariants> {}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardHeaderVariants({ variant }), className)}
      {...props}
    />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & {
    /**
     * Heading element to render. Defaults to `h3` (the shadcn default).
     * Pass `h2` for a top-level section card sitting directly under a page
     * `h1` so the heading ladder has no skipped level (H1 -> H2). Pass `p`
     * for metric-value cards that are not headings (keeps the heading ladder
     * clean). The shared default stays `h3` to keep every existing usage
     * unchanged.
     */
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  }
>(({ className, as: Comp = 'h3', ...props }, ref) => (
  <Comp
    ref={ref as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
    className={cn(
      'text-fluid-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 md:p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
  cardHeaderVariants,
}
