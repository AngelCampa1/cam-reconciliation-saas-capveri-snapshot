import { HelpCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface HelpTipProps {
  label: string
  children: ReactNode
  className?: string
}

export function HelpTip({ label, children, className }: HelpTipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Help: ${label}`}
            data-help-label={label}
            className={cn(
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground',
              // Invisible 40px hit area centered on the 24px icon so the tap
              // target meets the touch floor without enlarging the visible
              // control (forms can show several help icons inline).
              'relative before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
              'transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              className
            )}
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs leading-relaxed" side="top">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
