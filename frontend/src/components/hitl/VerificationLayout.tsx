import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useViewport } from '@/hooks/useViewport'

interface VerificationLayoutProps {
  pdfPanel: React.ReactNode
  formPanel: React.ReactNode
  initialSplit?: number // 0.3 to 0.7
  className?: string
}

const STORAGE_KEY = 'hitl-split-position'
const MIN_WIDTH = 0.25
const MAX_WIDTH = 0.75

export function VerificationLayout({
  pdfPanel,
  formPanel,
  initialSplit = 0.5,
  className,
}: VerificationLayoutProps) {
  const { isMobile, isTablet } = useViewport()
  const [splitPosition, setSplitPosition] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseFloat(stored) : initialSplit
  })
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Stack vertically on mobile/tablet
  const shouldStack = isMobile || isTablet

  // Persist split position
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(splitPosition))
  }, [splitPosition])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const newPosition = (e.clientX - rect.left) / rect.width
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newPosition))
      setSplitPosition(clamped)
    },
    [isDragging]
  )

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Keyboard resize
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 0.05
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSplitPosition((prev) => Math.max(MIN_WIDTH, prev - step))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setSplitPosition((prev) => Math.min(MAX_WIDTH, prev + step))
    }
  }, [])

  // Mobile/tablet: Stack vertically
  if (shouldStack) {
    return (
      <div
        className={cn('flex flex-col h-full w-full overflow-hidden', className)}
        data-testid="verification-layout"
      >
        {/* PDF Panel (scrollable on mobile) - 60% height */}
        <div
          className="w-full h-3/5 overflow-auto border-b"
          data-testid="pdf-panel"
        >
          {pdfPanel}
        </div>

        {/* Form Panel - 40% height */}
        <div className="w-full h-2/5 overflow-auto" data-testid="form-panel">
          {formPanel}
        </div>
      </div>
    )
  }

  // Desktop: Side-by-side with resizable divider
  return (
    <div
      ref={containerRef}
      className={cn('flex h-full w-full overflow-hidden', className)}
      data-testid="verification-layout"
    >
      {/* PDF Panel */}
      <div
        className="h-full overflow-hidden"
        style={{ width: `${splitPosition * 100}%` }}
        data-testid="pdf-panel"
      >
        {pdfPanel}
      </div>

      {/* Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuemin={MIN_WIDTH * 100}
        aria-valuemax={MAX_WIDTH * 100}
        aria-valuenow={splitPosition * 100}
        tabIndex={0}
        className={cn(
          'w-2 h-full cursor-col-resize flex-shrink-0',
          'bg-border hover:bg-primary/50 transition-colors duration-200',
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isDragging && 'bg-primary'
        )}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        data-testid="resize-handle"
      />

      {/* Form Panel */}
      <div
        className="h-full overflow-auto flex-1"
        style={{ width: `${(1 - splitPosition) * 100}%` }}
        data-testid="form-panel"
      >
        {formPanel}
      </div>
    </div>
  )
}
