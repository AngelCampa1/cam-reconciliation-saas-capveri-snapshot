import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button',
    'text-sm font-medium',
    'ring-offset-background transition-all duration-fast ease-out-expo',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-gradient-to-b from-primary to-primary/95',
          'text-primary-foreground',
          'shadow-sm',
          'hover:from-primary/95 hover:to-primary/90 hover:shadow-primary-sm',
          'active:from-primary active:to-primary active:shadow-none active:translate-y-px',
        ].join(' '),
        destructive: [
          'bg-gradient-to-b from-destructive to-destructive/95',
          'text-destructive-foreground',
          'shadow-sm',
          'hover:from-destructive/95 hover:to-destructive/90 hover:shadow-md',
          'active:shadow-none active:translate-y-px',
        ].join(' '),
        outline: [
          'border border-input bg-background',
          'shadow-sm',
          'hover:bg-surface-hover hover:border-border-hover hover:shadow-sm',
          'active:bg-surface-active active:shadow-none',
        ].join(' '),
        secondary: [
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/80',
          'active:bg-secondary/70',
        ].join(' '),
        ghost: [
          'hover:bg-surface-hover hover:text-accent-foreground',
          'active:bg-surface-active',
        ].join(' '),
        link: 'text-primary underline-offset-4 hover:underline',
        success: [
          'bg-gradient-to-b from-success to-success/95',
          'text-success-foreground',
          'shadow-sm',
          'hover:from-success/95 hover:to-success/90 hover:shadow-md',
          'active:shadow-none active:translate-y-px',
        ].join(' '),
        warning: [
          'bg-gradient-to-b from-warning to-warning/95',
          'text-warning-foreground',
          'shadow-sm',
          'hover:from-warning/95 hover:to-warning/90 hover:shadow-md',
          'active:shadow-none active:translate-y-px',
        ].join(' '),
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-10 px-3 text-xs',
        xs: 'h-8 px-2 text-xs',
        lg: 'h-12 px-6',
        xl: 'h-12 px-8 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
