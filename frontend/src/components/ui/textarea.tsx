import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Whether the textarea has an error */
  error?: boolean | undefined
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    // Same two invalid sources as Input: an explicit `error` prop, or the
    // `aria-invalid` FormControl injects on FormField-wired textareas. Collapse
    // both so the red border is a real class swap (twMerge drops `border-input`
    // for `border-destructive`) that React repaints on a runtime false->true
    // toggle — a CSS `aria-[invalid=true]:` variant doesn't.
    const hasError =
      error === true || ariaInvalid === true || ariaInvalid === 'true'
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-4 py-3 text-base ring-offset-background', // Always text-base to prevent iOS zoom
          'placeholder:text-muted-foreground/60',
          'transition-all duration-fast ease-out-expo',
          'hover:border-border-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30',
          hasError &&
            'border-destructive focus-visible:ring-destructive focus-visible:border-destructive',
          className
        )}
        ref={ref}
        data-testid="textarea"
        aria-invalid={hasError || undefined}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
