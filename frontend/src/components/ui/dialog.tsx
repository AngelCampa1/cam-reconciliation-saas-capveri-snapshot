import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-overlay bg-overlay/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    data-testid="dialog-overlay"
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentVariants = cva(
  'fixed left-[50%] top-[50%] z-modal grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 max-h-[calc(100vh-4rem)] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
  {
    variants: {
      size: {
        xs: 'max-w-xs', // 320px - Confirmations (NEW)
        sm: 'max-w-sm', // 384px
        md: 'max-w-md', // 448px
        lg: 'max-w-lg', // 512px
        xl: 'max-w-xl', // 576px
        '2xl': 'max-w-2xl', // 672px - Complex forms (NEW)
        '3xl': 'max-w-3xl', // 768px
        full: 'w-[calc(100vw-2rem)] max-w-[1200px] h-[calc(100vh-2rem)] max-h-[900px]', // Fixed: Leave margin
        'mobile-full':
          'w-screen h-screen max-w-none max-h-none rounded-none md:w-auto md:h-auto md:max-w-lg md:rounded-lg',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

export interface DialogContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size,
      showCloseButton = true,
      onOpenAutoFocus,
      onCloseAutoFocus,
      ...props
    },
    ref
  ) => {
    // Restore focus to the opener on close. Dialogs driven by a controlled
    // `open` prop with no <DialogTrigger> give Radix no trigger ref to return
    // focus to, so it falls back to <body> (a WCAG 2.4.3 failure). Capture
    // whatever was focused when the dialog took focus and send focus back to
    // it on close, as long as it is still mounted.
    const openerRef = React.useRef<HTMLElement | null>(null)

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogContentVariants({ size }), className)}
          data-testid="dialog-content"
          // Radix Dialog.Content does not emit aria-modal in this version, so
          // set it explicitly. Without it, some screen readers in browse mode
          // can wander into the inert page behind the modal. Placed before
          // {...props} so a caller can still override it.
          aria-modal
          onOpenAutoFocus={(event) => {
            const active = document.activeElement
            openerRef.current =
              active instanceof HTMLElement && active !== document.body
                ? active
                : null
            onOpenAutoFocus?.(event)
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event)
            const opener = openerRef.current
            if (
              !event.defaultPrevented &&
              opener &&
              document.body.contains(opener)
            ) {
              event.preventDefault()
              opener.focus()
            }
          }}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full opacity-70 ring-offset-background transition-all duration-fast hover:opacity-100 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
              data-testid="dialog-close-button"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  }
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    data-testid="dialog-header"
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    data-testid="dialog-footer"
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-fluid-xl font-semibold leading-none tracking-tight',
      className
    )}
    data-testid="dialog-title"
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    data-testid="dialog-description"
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
