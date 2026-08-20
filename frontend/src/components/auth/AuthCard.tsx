/**
 * Auth Card Component
 *
 * Enhanced form card for auth pages with premium styling.
 * Features:
 * - Elevated shadow with subtle border
 * - Focus-within glow effect
 * - Logo header with gradient
 * - Smooth transitions
 */
import * as React from 'react'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

export interface AuthCardProps {
  /** Card content */
  children: React.ReactNode
  /** Optional header content (e.g., logo) */
  header?: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

export function AuthCard({ children, header, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        // Base structure
        'rounded-2xl bg-card',
        // Border and shadow
        'border border-border-subtle',
        'shadow-md',
        // Focus-within effect (when form is focused)
        'transition-all duration-normal ease-out-expo',
        'focus-within:shadow-lg',
        'focus-within:border-primary/20',
        className
      )}
    >
      {/* Optional header with gradient background */}
      {header && (
        <div
          className={cn(
            'rounded-t-2xl border-b border-border-subtle',
            'bg-gradient-to-b from-muted/40 to-transparent',
            'px-8 py-6'
          )}
        >
          {header}
        </div>
      )}

      {/* Card content */}
      <div className="px-8 py-8">{children}</div>
    </div>
  )
}

export interface AuthCardHeaderProps {
  /** Logo element or icon */
  logo?: React.ReactNode
  /** Main title */
  title: string
  /** Optional subtitle/description */
  subtitle?: string
  /** Additional CSS classes */
  className?: string
}

export function AuthCardHeader({
  logo,
  title,
  subtitle,
  className,
}: AuthCardHeaderProps) {
  return (
    <div className={cn('text-center', className)}>
      {/* Logo */}
      {logo && <div className="mb-4 flex justify-center">{logo}</div>}

      {/* Title */}
      <h1 className="text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}

export interface AuthLogoProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
}

export function AuthLogo({ size = 'md', className }: AuthLogoProps) {
  // Map AuthLogo sizes to Logo component sizes
  const logoSize = {
    sm: 'md' as const, // h-10
    md: 'lg' as const, // h-12
    lg: 'xl' as const, // h-16
  }[size]

  return <Logo size={logoSize} showText={false} className={className} />
}
