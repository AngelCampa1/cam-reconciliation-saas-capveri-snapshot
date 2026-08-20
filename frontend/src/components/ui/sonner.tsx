import * as React from 'react'
import { Toaster as Sonner, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Toaster component that wraps sonner with project styling.
 *
 * Features:
 * - Success, error, warning, info variants with distinct colors
 * - Positioned in bottom-right by default
 * - 5 second default duration
 * - Stacking of multiple toasts
 * - Optional action buttons
 * - Accessible: announces to screen readers
 *
 * @example
 * ```tsx
 * // In your app root:
 * <Toaster />
 *
 * // To trigger toasts:
 * import { toast } from '@/components/ui/sonner'
 *
 * toast.success('Property created successfully')
 * toast.error('Failed to save changes')
 * toast.warning('Unsaved changes will be lost')
 * toast.info('Syncing data...')
 *
 * // With action
 * toast('Property deleted', {
 *   action: {
 *     label: 'Undo',
 *     onClick: () => restoreProperty(id),
 *   },
 * })
 * ```
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="bottom-right"
      duration={5000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-md',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:font-medium',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm',
          closeButton:
            'group-[.toast]:rounded-full group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border group-[.toast]:hover:bg-muted group-[.toast]:ring-offset-background group-[.toast]:focus-visible:outline-none group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-ring group-[.toast]:focus-visible:ring-offset-2',
          success:
            'group-[.toaster]:bg-success/10 group-[.toaster]:text-success-strong group-[.toaster]:border-success/20',
          error:
            'group-[.toaster]:bg-error/10 group-[.toaster]:text-destructive-strong group-[.toaster]:border-error/20',
          warning:
            'group-[.toaster]:bg-warning/10 group-[.toaster]:text-warning-foreground group-[.toaster]:border-warning/20',
          info: 'group-[.toaster]:bg-info/10 group-[.toaster]:text-info-strong group-[.toaster]:border-info/20',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
