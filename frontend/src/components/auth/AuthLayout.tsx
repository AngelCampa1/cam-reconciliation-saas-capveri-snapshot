import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AuthLayoutProps {
  /** Content for the form side (right on desktop) */
  children: React.ReactNode
  /** Content for the feature showcase side (left on desktop) */
  showcase?: React.ReactNode
  /** Additional CSS classes for the layout */
  className?: string
}

export function AuthLayout({ children, showcase, className }: AuthLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-screen w-full',
        'bg-gradient-to-br from-background via-background to-muted/30',
        className
      )}
    >
      <div className="flex min-h-screen">
        {/* Feature showcase side - hidden on mobile, LEFT on desktop */}
        {showcase && (
          <div
            className={cn(
              'relative hidden lg:flex lg:w-1/2',
              'items-center justify-center',
              'bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900',
              'overflow-hidden'
            )}
          >
            {/* Decorative mesh pattern */}
            <div
              className="absolute inset-0 bg-decorative-mesh-1 opacity-30"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-decorative-mesh-2 opacity-30"
              aria-hidden="true"
            />

            {/* Decorative circles */}
            <div
              className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-foreground/5"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-foreground/5"
              aria-hidden="true"
            />

            {/* Showcase content */}
            <div className="relative z-sticky w-full max-w-lg px-8">
              {showcase}
            </div>
          </div>
        )}

        {/* Form side - scrollable on mobile, RIGHT on desktop */}
        <div
          className={cn(
            'flex w-full flex-col items-center justify-center',
            'px-4 py-12 sm:px-6 lg:px-8',
            showcase && 'lg:w-1/2'
          )}
        >
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  )
}
