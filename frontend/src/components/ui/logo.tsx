import { cn } from '@/lib/utils'

export interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string | undefined
  showText?: boolean
}

export function Logo({ size = 'md', className, showText = true }: LogoProps) {
  const sizeClasses = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        src="/icons/icon.svg"
        alt="CapVeri"
        className={cn(sizeClasses[size])}
      />
      {showText && <span className="text-lg font-semibold">CapVeri</span>}
    </div>
  )
}
