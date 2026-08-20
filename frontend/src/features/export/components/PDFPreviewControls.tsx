/**
 * PDFPreviewControls component.
 *
 * Controls for PDF preview including zoom, download, and print.
 */

import { Download, Printer, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ZOOM_PRESETS } from '../utils/pdfHelpers'

interface PDFPreviewControlsProps {
  scale: number
  onScaleChange: (scale: number) => void
  onDownload: () => void
  onPrint: () => void
  disabled?: boolean
}

const ZOOM_OPTIONS = [
  { value: String(ZOOM_PRESETS.ZOOM_50), label: '50%' },
  { value: String(ZOOM_PRESETS.ZOOM_75), label: '75%' },
  { value: String(ZOOM_PRESETS.ACTUAL_SIZE), label: '100%' },
  { value: String(ZOOM_PRESETS.ZOOM_125), label: '125%' },
  { value: String(ZOOM_PRESETS.ZOOM_150), label: '150%' },
  { value: String(ZOOM_PRESETS.ZOOM_200), label: '200%' },
  { value: ZOOM_PRESETS.FIT_WIDTH, label: 'Fit Width' },
  { value: ZOOM_PRESETS.FIT_PAGE, label: 'Fit Page' },
]

export function PDFPreviewControls({
  scale,
  onScaleChange,
  onDownload,
  onPrint,
  disabled = false,
}: PDFPreviewControlsProps) {
  const handleZoomIn = () => {
    const newScale = Math.min(scale + 0.25, 3.0)
    onScaleChange(newScale)
  }

  const handleZoomOut = () => {
    const newScale = Math.max(scale - 0.25, 0.25)
    onScaleChange(newScale)
  }

  const handleZoomSelect = (value: string) => {
    // Check if it's a fit mode or a numeric scale
    if (value === ZOOM_PRESETS.FIT_WIDTH || value === ZOOM_PRESETS.FIT_PAGE) {
      // For fit modes, we'll use a placeholder scale
      // The actual scale will be calculated by the viewer based on container size
      onScaleChange(value === ZOOM_PRESETS.FIT_WIDTH ? -1 : -2)
    } else {
      onScaleChange(parseFloat(value))
    }
  }

  // Get current zoom value for display
  const currentZoomValue =
    scale === -1
      ? ZOOM_PRESETS.FIT_WIDTH
      : scale === -2
        ? ZOOM_PRESETS.FIT_PAGE
        : String(scale)

  return (
    <div className="flex items-center justify-between gap-4 p-2 border-b bg-muted/50 shadow-sm">
      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom out"
          onClick={handleZoomOut}
          disabled={disabled || scale <= 0.25}
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>

        <Select
          value={currentZoomValue}
          onValueChange={handleZoomSelect}
          disabled={disabled}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZOOM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          aria-label="Zoom in"
          onClick={handleZoomIn}
          disabled={disabled || scale >= 3.0}
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onPrint} disabled={disabled}>
          <Printer className="h-4 w-4 mr-2" aria-hidden="true" />
          Print
        </Button>
        <Button onClick={onDownload} disabled={disabled}>
          <Download className="h-4 w-4 mr-2" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  )
}
