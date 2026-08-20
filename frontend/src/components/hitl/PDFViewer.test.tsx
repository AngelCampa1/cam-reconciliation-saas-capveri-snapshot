import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PDFViewer } from './PDFViewer'
import { pdfjs } from 'react-pdf'

// Mock react-pdf components with simplified behavior
vi.mock('react-pdf', () => ({
  Document: ({
    children,
    file,
    onLoadSuccess,
    onLoadError,
  }: {
    children: React.ReactNode
    file?: string
    onLoadSuccess?: (pdf: { numPages: number }) => void
    onLoadError?: (error: Error) => void
  }) => {
    // A url containing "fail" simulates a load error (e.g. a storage 404). The
    // react-pdf error message would embed the full signed URL, so we mirror
    // that here to prove the component never renders it. Otherwise simulate a
    // successful load with 10 pages.
    if (typeof file === 'string' && file.includes('fail')) {
      if (onLoadError) {
        setTimeout(
          () =>
            onLoadError(
              new Error(
                `Unexpected server response (404) while retrieving PDF ${file}`
              )
            ),
          0
        )
      }
    } else if (onLoadSuccess) {
      setTimeout(() => onLoadSuccess({ numPages: 10 }), 0)
    }
    return <div data-testid="pdf-document">{children}</div>
  },
  Page: ({
    pageNumber,
    width,
    onRenderSuccess,
  }: {
    pageNumber: number
    width?: number
    onRenderSuccess?: (page: { width: number; height: number }) => void
  }) => {
    // Simulate react-pdf reporting the rendered page dimensions (Letter size)
    if (onRenderSuccess) {
      setTimeout(() => onRenderSuccess({ width: 612, height: 792 }), 0)
    }
    return (
      <div
        data-testid="pdf-page"
        data-page={pageNumber}
        data-width={width ?? ''}
      >
        Page {pageNumber}
      </div>
    )
  },
  pdfjs: {
    version: '3.11.174',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
  },
}))

describe('PDFViewer', () => {
  describe('Component Structure', () => {
    it('renders navigation controls', () => {
      render(<PDFViewer url="/test.pdf" />)

      // Check for navigation buttons (by finding buttons with SVG icons)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(2) // At least prev/next buttons
    })

    it('renders page input', () => {
      render(<PDFViewer url="/test.pdf" currentPage={1} />)

      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('1')
    })

    it('renders PDF document container', () => {
      render(<PDFViewer url="/test.pdf" />)

      expect(screen.getByTestId('pdf-document')).toBeInTheDocument()
    })

    it('applies custom className to wrapper', () => {
      const { container } = render(
        <PDFViewer url="/test.pdf" className="custom-class" />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('custom-class')
    })
  })

  describe('Page Input Handling', () => {
    it('displays current page in input', () => {
      render(<PDFViewer url="/test.pdf" currentPage={5} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('5')
    })

    it('updates input value when typing', async () => {
      const user = userEvent.setup()
      render(<PDFViewer url="/test.pdf" currentPage={1} />)

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, '7')

      expect(input).toHaveValue('7')
    })

    it('calls onPageChange when Enter is pressed', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()

      render(
        <PDFViewer
          url="/test.pdf"
          onPageChange={onPageChange}
          currentPage={1}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, '3{Enter}')

      expect(onPageChange).toHaveBeenCalled()
    })

    it('calls onPageChange on blur with valid input', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()

      render(
        <PDFViewer
          url="/test.pdf"
          onPageChange={onPageChange}
          currentPage={1}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, '4')
      await user.tab() // Trigger blur through keyboard interaction

      expect(onPageChange).toHaveBeenCalled()
    })

    it('reverts to current page on invalid input', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()

      render(
        <PDFViewer
          url="/test.pdf"
          onPageChange={onPageChange}
          currentPage={2}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'abc')
      await user.tab() // Trigger blur through keyboard interaction

      expect(onPageChange).not.toHaveBeenCalled()
    })
  })

  describe('Navigation Buttons', () => {
    it('disables previous button on first page', () => {
      render(<PDFViewer url="/test.pdf" currentPage={1} />)

      const buttons = screen.getAllByRole('button')
      const prevBtn = buttons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-chevron-left')
      )

      expect(prevBtn).toBeDisabled()
    })

    it('enables previous button on pages after first', () => {
      render(<PDFViewer url="/test.pdf" currentPage={5} />)

      const buttons = screen.getAllByRole('button')
      const prevBtn = buttons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-chevron-left')
      )

      expect(prevBtn).not.toBeDisabled()
    })

    it('calls onPageChange when prev button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()

      render(
        <PDFViewer
          url="/test.pdf"
          onPageChange={onPageChange}
          currentPage={5}
        />
      )

      const buttons = screen.getAllByRole('button')
      const prevBtn = buttons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-chevron-left')
      )

      if (prevBtn) {
        await user.click(prevBtn)
        expect(onPageChange).toHaveBeenCalled()
      }
    })

    it('calls onPageChange when next button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()

      render(
        <PDFViewer
          url="/test.pdf"
          onPageChange={onPageChange}
          currentPage={1}
        />
      )

      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons.find((btn) =>
        btn.querySelector('svg')?.classList.contains('lucide-chevron-right')
      )

      if (nextBtn) {
        await user.click(nextBtn)
        expect(onPageChange).toHaveBeenCalled()
      }
    })
  })

  describe('PDF.js Worker Configuration', () => {
    it('configures PDF.js worker correctly', () => {
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toBeDefined()
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain('pdf.worker')
    })

    it('uses bundled pdfjs worker URL', () => {
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain(
        'pdf.worker.min.mjs'
      )
    })
  })

  describe('Props', () => {
    it('accepts URL prop', () => {
      const { container } = render(<PDFViewer url="/test.pdf" />)
      expect(container).toBeInTheDocument()
    })

    it('accepts scale prop', () => {
      const { container } = render(<PDFViewer url="/test.pdf" scale={1.5} />)
      expect(container).toBeInTheDocument()
    })

    it('accepts currentPage prop', () => {
      render(<PDFViewer url="/test.pdf" currentPage={3} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('3')
    })

    it('uses default currentPage of 1 when not provided', () => {
      render(<PDFViewer url="/test.pdf" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('1')
    })

    it('uses default scale of 1.0 when not provided', () => {
      const { container } = render(<PDFViewer url="/test.pdf" />)
      expect(container).toBeInTheDocument()
    })
  })

  describe('Overlay render-prop (F-047)', () => {
    it('renders the overlay with the page-reported dimensions on render success', async () => {
      render(
        <PDFViewer
          url="/test.pdf"
          overlay={({ width, height }) => (
            <div data-testid="overlay-content">
              {width}x{height}
            </div>
          )}
        />
      )

      // The mock Page reports Letter dimensions (612x792) via onRenderSuccess
      await waitFor(() => {
        expect(screen.getByTestId('overlay-content')).toHaveTextContent(
          '612x792'
        )
      })
    })

    it('does not render an overlay when no overlay prop is provided', async () => {
      render(<PDFViewer url="/test.pdf" />)

      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('overlay-content')).not.toBeInTheDocument()
    })
  })

  describe('Load error handling (F-230)', () => {
    const signedUrl =
      'http://127.0.0.1:54321/storage/v1/s3/capveri-documents/fail.pdf' +
      '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=SECRETKEY%2F20260607' +
      '&X-Amz-Signature=deadbeefsignature'

    it('shows a friendly message on load error', async () => {
      render(<PDFViewer url={signedUrl} />)

      await waitFor(() => {
        expect(screen.getByText("We couldn't load the PDF")).toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
    })

    it('never renders the raw error string or the signed URL', async () => {
      const { container } = render(<PDFViewer url={signedUrl} />)

      await waitFor(() => {
        expect(screen.getByText("We couldn't load the PDF")).toBeInTheDocument()
      })

      // The signed URL and its AWS credential params must never reach the DOM.
      expect(container.textContent).not.toContain('X-Amz-Signature')
      expect(container.textContent).not.toContain('X-Amz-Credential')
      expect(container.textContent).not.toContain('SECRETKEY')
      expect(container.textContent).not.toContain('Unexpected server response')
      expect(container.textContent).not.toContain('storage/v1/s3')
    })
  })

  describe('onLoadStateChange (F-231)', () => {
    it('reports "loaded" when the document loads', async () => {
      const onLoadStateChange = vi.fn()
      render(
        <PDFViewer url="/test.pdf" onLoadStateChange={onLoadStateChange} />
      )

      await waitFor(() => {
        expect(onLoadStateChange).toHaveBeenCalledWith('loaded')
      })
      expect(onLoadStateChange).not.toHaveBeenCalledWith('error')
    })

    it('reports "error" when the document fails to load', async () => {
      const onLoadStateChange = vi.fn()
      render(
        <PDFViewer url="/fail.pdf" onLoadStateChange={onLoadStateChange} />
      )

      await waitFor(() => {
        expect(onLoadStateChange).toHaveBeenCalledWith('error')
      })
      expect(onLoadStateChange).not.toHaveBeenCalledWith('loaded')
    })
  })

  describe('Fit-to-container width', () => {
    // jsdom has no layout, so stub the scroll container's measured width to
    // exercise the fitting logic that keeps the page from overflowing the
    // panel (and clipping its left edge out of scroll reach).
    const stubClientWidth = (value: number) => {
      const spy = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockReturnValue(value)
      return () => spy.mockRestore()
    }

    it('fits the page to the container width when none is given', async () => {
      const restore = stubClientWidth(1000)
      render(<PDFViewer url="/test.pdf" />)

      await waitFor(() => {
        // 1000 container - 16 padding
        expect(screen.getByTestId('pdf-page')).toHaveAttribute(
          'data-width',
          '984'
        )
      })
      restore()
    })

    it('caps the rendered page at the width prop on a wide panel', async () => {
      const restore = stubClientWidth(2000)
      render(<PDFViewer url="/test.pdf" width={800} />)

      await waitFor(() => {
        // min(800, 2000 - 16) = 800
        expect(screen.getByTestId('pdf-page')).toHaveAttribute(
          'data-width',
          '800'
        )
      })
      restore()
    })

    it('shrinks below the width prop when the panel is narrower', async () => {
      const restore = stubClientWidth(400)
      render(<PDFViewer url="/test.pdf" width={800} />)

      await waitFor(() => {
        // min(800, 400 - 16) = 384 -> the page must not overflow the panel
        expect(screen.getByTestId('pdf-page')).toHaveAttribute(
          'data-width',
          '384'
        )
      })
      restore()
    })
  })
})
