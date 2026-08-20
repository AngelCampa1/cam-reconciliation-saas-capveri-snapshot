import * as React from 'react'

import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Whether the input has an error */
  error?: boolean | undefined
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    // Two ways an input learns it's invalid: auth pages pass `error` directly;
    // FormControl injects `aria-invalid` on FormField-wired inputs (which never
    // get the `error` prop). Collapse both into one flag so the red border is a
    // real class swap — twMerge drops `border-input` for `border-destructive`,
    // which React always repaints. A CSS `aria-[invalid=true]:` variant doesn't:
    // it fails to repaint when the attribute toggles false->true at runtime.
    const hasError =
      error === true || ariaInvalid === true || ariaInvalid === 'true'
    return (
      <input
        type={type}
        className={cn(
          // Base structure
          'flex h-11 w-full rounded-lg border bg-background px-4 py-2',
          'text-base', // Always text-base to prevent iOS zoom on focus
          // Border and ring
          'border-input ring-offset-background',
          // Placeholder
          'placeholder:text-muted-foreground/60',
          // Transitions
          'transition-all duration-fast ease-out-expo',
          // Hover
          'hover:border-border-hover',
          // Focus - refined ring with border highlight
          'focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'focus-visible:border-primary',
          // Disabled
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30',
          // File inputs
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          // Error state
          hasError && [
            'border-destructive',
            'focus-visible:ring-destructive',
            'focus-visible:border-destructive',
          ],
          className
        )}
        ref={ref}
        aria-invalid={hasError || undefined}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
