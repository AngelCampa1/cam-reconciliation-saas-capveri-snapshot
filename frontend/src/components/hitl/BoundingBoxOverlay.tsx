import { useMemo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface BoundingBox {
  left: number // 0-1 relative to page width
  top: number // 0-1 relative to page height
  width: number // 0-1 relative to page width
  height: number // 0-1 relative to page height
}

export interface SourceHighlight {
  field: string
  text: string
  boundingBox: BoundingBox
  confidence: 'high' | 'medium' | 'low'
  page: number
}

interface BoundingBoxOverlayProps {
  sources: SourceHighlight[]
  currentPage: number
  pageWidth: number
  pageHeight: number
  onBoxClick?: (field: string) => void
  activeField?: string
  className?: string
}

const confidenceColors = {
  high: 'border-success bg-success/10',
  medium: 'border-warning bg-warning/10',
  low: 'border-destructive bg-destructive/10',
}

const confidenceTextColors = {
  high: 'text-success',
  medium: 'text-warning-foreground',
  low: 'text-destructive',
}

export function BoundingBoxOverlay({
  sources,
  currentPage,
  pageWidth,
  pageHeight,
  onBoxClick,
  activeField,
  className,
}: BoundingBoxOverlayProps) {
  // Filter sources for current page
  const pageBoxes = useMemo(
    () => sources.filter((s) => s.page === currentPage),
    [sources, currentPage]
  )

  if (pageBoxes.length === 0) {
    return null
  }

  return (
    <div
      className={cn('absolute inset-0 pointer-events-none', className)}
      style={{ width: pageWidth, height: pageHeight }}
      data-testid="bounding-box-overlay"
    >
      {pageBoxes.map((source, index) => {
        const { boundingBox: bbox, field, text, confidence } = source
        const isActive = field === activeField

        // Skip if no bounding box coordinates available
        if (!bbox) {
          return null
        }

        return (
          <Tooltip key={`${field}-${index}`}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onBoxClick?.(field)}
                className={cn(
                  'absolute border-2 rounded-sm pointer-events-auto',
                  'transition-all duration-200',
                  confidenceColors[confidence],
                  isActive && 'ring-2 ring-primary border-primary',
                  'hover:opacity-80 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                )}
                style={{
                  left: `${bbox.left * 100}%`,
                  top: `${bbox.top * 100}%`,
                  width: `${bbox.width * 100}%`,
                  height: `${bbox.height * 100}%`,
                }}
                aria-label={`Source for ${field}: ${text}`}
                data-testid={`bbox-${field}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">{formatFieldName(field)}</p>
                <p className="text-sm text-muted-foreground">"{text}"</p>
                <p className="text-xs">
                  Confidence:{' '}
                  <span className={confidenceTextColors[confidence]}>
                    {confidence}
                  </span>
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
