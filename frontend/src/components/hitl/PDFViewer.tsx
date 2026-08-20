import { useState, useCallback, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker from the bundled dependency so local/E2E runs do not
// depend on an external CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Load state of the source document, surfaced to parents so they can gate
 * actions that require the reviewer to have actually seen the source (see
 * F-231: a reviewer must not approve AI-extracted values without the source).
 */
export type PdfLoadState = 'loading' | 'loaded' | 'error'

interface PDFViewerProps {
  url: string
  currentPage?: number
  onPageChange?: (page: number) => void
  scale?: number
  /**
   * Upper bound for the rendered page width in CSS pixels. The page always
   * fits the available container width so it never overflows horizontally
   * (which would clip the left edge out of scroll reach); `width` only caps
   * how large the page may grow on a wide panel. Omit `width`/`scale` to
   * always fit the container.
   */
  width?: number
  className?: string
  /**
   * Render-prop for content overlaid on top of the rendered PDF page.
   * Receives the actual rendered CSS-pixel dimensions of the page so the
   * overlay can be sized to exactly cover the page canvas for any page
   * size / aspect ratio.
   */
  overlay?: (pageDimensions: {
    width: number
    height: number
  }) => React.ReactNode
  /**
   * Called whenever the document load state changes. Lets a parent disable
   * actions (e.g. "Approve & Commit") until the source PDF is visible.
   */
  onLoadStateChange?: (state: PdfLoadState) => void
}

export function PDFViewer({
  url,
  currentPage = 1,
  onPageChange,
  scale,
  width,
  className,
  overlay,
  onLoadStateChange,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageInputValue, setPageInputValue] = useState(String(currentPage))
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [pageDimensions, setPageDimensions] = useState<{
    width: number
    height: number
  } | null>(null)

  // Track the available width of the scroll container so the page can be
  // rendered to fit it. Rendering at a fixed width wider than the panel
  // (e.g. on the resizable verification split) overflows horizontally and,
  // combined with centering, pushes the page's left edge out of scroll
  // reach — clipping the document. Fitting the container avoids that.
  const contentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Horizontal padding reserved inside the scroll container so the page
  // never butts against the panel edges.
  const FIT_PADDING = 16
  const fittedWidth =
    containerWidth !== null
      ? Math.max(
          0,
          width !== undefined
            ? Math.min(width, containerWidth - FIT_PADDING)
            : containerWidth - FIT_PADDING
        )
      : width

  const handlePageRenderSuccess = useCallback(
    (page: { width: number; height: number }) => {
      setPageDimensions({ width: page.width, height: page.height })
    },
    []
  )

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages)
      setIsLoading(false)
      setHasError(false)
      onLoadStateChange?.('loaded')
    },
    [onLoadStateChange]
  )

  const handleDocumentLoadError = useCallback(
    (error: Error) => {
      setIsLoading(false)
      setHasError(true)
      onLoadStateChange?.('error')
      // Log the raw library error (which can include the signed document URL
      // and AWS credential query params) to the console only, never render it
      // in the DOM, where it would leak signed-URL secrets to the user. See
      // F-230.
      logger.error('Failed to load PDF document', { error: error.message })
    },
    [onLoadStateChange]
  )

  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, numPages))
      setPageInputValue(String(validPage))
      onPageChange?.(validPage)
    },
    [numPages, onPageChange]
  )

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value)
  }

  const handlePageInputBlur = () => {
    const page = parseInt(pageInputValue, 10)
    if (!isNaN(page)) {
      goToPage(page)
    } else {
      setPageInputValue(String(currentPage))
    }
  }

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageInputBlur()
    }
  }

  if (hasError) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center justify-center h-full gap-4 p-8"
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive-strong font-medium">
          We couldn't load the PDF
        </p>
        <p className="text-sm text-muted-foreground text-center">
          Try again, or go back and upload the file one more time.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Navigation Bar */}
      <div className="flex items-center justify-center gap-4 p-2 border-b bg-muted/50">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="flex items-center gap-2 text-sm">
          <Input
            type="text"
            value={pageInputValue}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            aria-label="Page number"
            className="w-16 h-8 text-center"
          />
          <span className="text-muted-foreground">of {numPages || '...'}</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* PDF Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto bg-muted/30 flex justify-center"
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={null}
        >
          <div className="relative inline-block">
            <Page
              pageNumber={currentPage}
              {...(fittedWidth
                ? { width: fittedWidth }
                : scale
                  ? { scale }
                  : { scale: 1.0 })}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
              onRenderSuccess={handlePageRenderSuccess}
            />
            {overlay && pageDimensions && (
              <div className="absolute inset-0">{overlay(pageDimensions)}</div>
            )}
          </div>
        </Document>
      </div>
    </div>
  )
}
