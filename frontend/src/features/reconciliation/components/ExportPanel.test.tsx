/**
 * Tests for ExportPanel component. Covers all 5 tabs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExportPanel } from './ExportPanel'
import * as hooks from '@/api/hooks'

// Mock hooks
vi.mock('@/api/hooks', () => ({
  useExportPdfPreview: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
  })),
  useExportPdfDownload: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useExportBatchPdf: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useExportErp: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useExportHistory: vi.fn(() => ({
    data: {
      items: [
        {
          id: 'export-1',
          property_id: 'property-123',
          format: 'pdf',
          file_name: 'reconciliation-2024.pdf',
          file_size: 512000,
          status: 'completed',
          created_at: '2024-03-15T10:30:00Z',
          created_by_name: 'John Doe',
        },
      ],
      total: 1,
    },
    isLoading: false,
    isError: false,
    isPaused: false,
    refetch: vi.fn(),
  })),
  useExportBoardPreview: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
  })),
  useExportBoardDownload: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useExportVariancePdf: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useExportVarianceExcel: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useExportRedownload: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/features/export/hooks', () => ({
  useVarianceComparison: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useDetailAdvisor: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  propertyId: 'property-123',
  year: 2024,
  tenants: [
    { id: 'tenant-1', name: 'Acme Corp', unit: 'Suite 100' },
    { id: 'tenant-2', name: 'Beta Inc', unit: 'Suite 200' },
    { id: 'tenant-3', name: 'Gamma LLC', unit: 'Suite 300' },
  ],
}

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Panel presence ──────────────────────────────────────────
  it('renders the export panel when open', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('export-panel')).toBeInTheDocument()
  })

  it('does not render panel content when closed', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} open={false} />
      </Wrapper>
    )
    expect(screen.queryByTestId('export-panel')).not.toBeInTheDocument()
  })

  // ── PDF Tab ─────────────────────────────────────────────────
  it('shows PDF format card', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('format-card-pdf')).toBeInTheDocument()
  })

  it('shows include-charts checkbox on PDF tab', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-pdf'))
    expect(screen.getByTestId('include-charts')).toBeInTheDocument()
  })

  it('shows include-notes checkbox on PDF tab', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-pdf'))
    expect(screen.getByTestId('include-notes')).toBeInTheDocument()
  })

  it('shows preview button on PDF tab', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-pdf'))
    expect(screen.getByTestId('preview-button')).toBeInTheDocument()
  })

  // ── Batch Tab ───────────────────────────────────────────────
  it('shows tenant selector on batch tab', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('batch-export-tab'))
    expect(screen.getByTestId('tenant-selector')).toBeInTheDocument()
  })

  it('selects all tenants when select-all is clicked', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('batch-export-tab'))
    await user.click(screen.getByTestId('select-all-tenants'))
    expect(screen.getByTestId('selected-count')).toHaveTextContent(
      '3 tenants selected'
    )
  })

  it('selects individual tenants via checkboxes', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('batch-export-tab'))
    await user.click(screen.getByTestId('tenant-checkbox-tenant-1'))
    await user.click(screen.getByTestId('tenant-checkbox-tenant-2'))
    expect(screen.getByTestId('selected-count')).toHaveTextContent(
      '2 tenants selected'
    )
  })

  it('shows export mode radios on batch tab', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('batch-export-tab'))
    expect(screen.getByTestId('export-mode-zip')).toBeInTheDocument()
    expect(screen.getByTestId('export-mode-individual')).toBeInTheDocument()
  })

  it('shows batch export button', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('batch-export-tab'))
    expect(screen.getByTestId('batch-export-button')).toBeInTheDocument()
  })

  it('shows an honest indeterminate progress state while batch export is pending (F-034)', async () => {
    const user = userEvent.setup()
    vi.mocked(hooks.useExportBatchPdf).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof hooks.useExportBatchPdf>)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('batch-export-tab'))
    await user.click(screen.getByTestId('select-all-tenants'))

    // Progress region appears with an indeterminate (not fake-frozen) bar.
    const progress = screen.getByTestId('export-progress')
    expect(progress).toBeInTheDocument()
    const bar = screen.getByTestId('progress-bar')
    // Indeterminate progress has no numeric aria-valuenow (Radix omits it).
    expect(bar).not.toHaveAttribute('aria-valuenow')
    // Honest count-based copy instead of a misleading percentage.
    expect(screen.getByText(/Exporting 3 tenants…/)).toBeInTheDocument()
  })

  it('shows the complete state only after the batch export succeeds (F-034)', async () => {
    const user = userEvent.setup()
    let triggerSuccess: (() => void) | undefined
    vi.mocked(hooks.useExportBatchPdf).mockImplementation(((opts?: {
      onSuccess?: () => void
    }) => {
      triggerSuccess = opts?.onSuccess
      return {
        mutate: () => triggerSuccess?.(),
        isPending: false,
      }
    }) as unknown as typeof hooks.useExportBatchPdf)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('batch-export-tab'))
    await user.click(screen.getByTestId('select-all-tenants'))

    // Before export: no complete state.
    expect(screen.queryByTestId('export-complete')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('batch-export-button'))

    await waitFor(() => {
      expect(screen.getByTestId('export-complete')).toBeInTheDocument()
    })
  })

  it('clears the complete state when the tenant selection changes (F-034)', async () => {
    const user = userEvent.setup()
    let triggerSuccess: (() => void) | undefined
    vi.mocked(hooks.useExportBatchPdf).mockImplementation(((opts?: {
      onSuccess?: () => void
    }) => {
      triggerSuccess = opts?.onSuccess
      return {
        mutate: () => triggerSuccess?.(),
        isPending: false,
      }
    }) as unknown as typeof hooks.useExportBatchPdf)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('batch-export-tab'))
    await user.click(screen.getByTestId('select-all-tenants'))
    await user.click(screen.getByTestId('batch-export-button'))

    await waitFor(() => {
      expect(screen.getByTestId('export-complete')).toBeInTheDocument()
    })

    // Changing the selection invalidates the prior result → banner clears.
    await user.click(screen.getByTestId('tenant-checkbox-tenant-1'))
    expect(screen.queryByTestId('export-complete')).not.toBeInTheDocument()
  })

  // ── ERP Tab ─────────────────────────────────────────────────
  it('shows ERP format card', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('format-card-erp')).toBeInTheDocument()
  })

  it('shows ERP config panel when ERP card is clicked', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    expect(screen.getByTestId('erp-config-panel')).toBeInTheDocument()
  })

  it('shows ERP system select', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    expect(screen.getByTestId('erp-system-select')).toBeInTheDocument()
  })

  it('shows field mapping table after selecting ERP system', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    await user.click(screen.getByRole('combobox', { name: /erp system/i }))
    await user.click(screen.getByRole('option', { name: 'Yardi Voyager' }))
    expect(screen.getByTestId('field-mapping-table')).toBeInTheDocument()
  })

  it('shows save template button', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    expect(screen.getByTestId('save-template-button')).toBeInTheDocument()
  })

  it('f275: template name input has accessible name "Template name"', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    fireEvent.click(screen.getByTestId('save-template-button'))

    expect(screen.getByLabelText(/template name/i)).toBeInTheDocument()
  })

  it('shows template name input after clicking save template', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    fireEvent.click(screen.getByTestId('save-template-button'))
    expect(screen.getByTestId('template-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-save-template')).toBeInTheDocument()
  })

  it('saves and loads ERP templates from localStorage', async () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))

    // Save a template
    fireEvent.click(screen.getByTestId('save-template-button'))
    fireEvent.change(screen.getByTestId('template-name-input'), {
      target: { value: 'My Template' },
    })
    fireEvent.click(screen.getByTestId('confirm-save-template'))

    // Template select should now appear
    await waitFor(() => {
      expect(screen.getByTestId('template-select')).toBeInTheDocument()
    })
  })

  it('shows reset config button', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('format-card-erp'))
    expect(screen.getByTestId('reset-config-button')).toBeInTheDocument()
  })

  // ── History Tab ─────────────────────────────────────────────
  it('shows history table when history tab is clicked', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))
    expect(screen.getByTestId('export-history-table')).toBeInTheDocument()
  })

  it('shows export history items', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))
    expect(screen.getByText('reconciliation-2024.pdf')).toBeInTheDocument()
  })

  it('shows download button for each history item', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))
    expect(screen.getByTestId('download-export-export-1')).toBeInTheDocument()
  })

  it('re-downloads via the authenticated signed-URL hook (F-024)', () => {
    const mutate = vi.fn()
    vi.mocked(hooks.useExportRedownload).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useExportRedownload>)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))
    fireEvent.click(screen.getByTestId('download-export-export-1'))

    // Must hand the export id to the hook (which fetches a signed URL with the
    // bearer token) rather than opening the API route directly.
    expect(mutate).toHaveBeenCalledWith('export-1')
  })

  it('shows format filter dropdown', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))
    expect(screen.getByTestId('format-filter')).toBeInTheDocument()
  })

  it('surfaces a retryable error, not a false empty state, when history fails (F-424)', () => {
    const refetch = vi.fn()
    vi.mocked(hooks.useExportHistory).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isPaused: false,
      refetch,
    } as unknown as ReturnType<typeof hooks.useExportHistory>)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTestId('export-history-tab'))

    // A failed load must NOT masquerade as "No exports yet."
    expect(screen.queryByText('No exports yet.')).not.toBeInTheDocument()
    expect(screen.getByTestId('export-history-error')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('Board tab', () => {
  it('renders board tab trigger', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    expect(screen.getByTestId('board-export-tab')).toBeInTheDocument()
  })

  it('shows board presentation content when tab selected', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('board-export-tab'))
    expect(screen.getByTestId('board-cap-rate-slider')).toBeInTheDocument()
  })

  it('shows preview and download buttons in board tab', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} />
      </Wrapper>
    )
    await user.click(screen.getByTestId('board-export-tab'))
    expect(screen.getByTestId('board-preview-button')).toBeInTheDocument()
    expect(screen.getByTestId('board-download-button')).toBeInTheDocument()
  })

  it('shows locked board upgrade CTA when feature is gated', async () => {
    const user = userEvent.setup()
    const onUpgradeBoard = vi.fn()
    const previewMutate = vi.fn()
    const downloadMutate = vi.fn()

    vi.mocked(hooks.useExportBoardPreview).mockReturnValue({
      mutate: previewMutate,
      isPending: false,
      data: undefined,
    } as ReturnType<typeof hooks.useExportBoardPreview>)
    vi.mocked(hooks.useExportBoardDownload).mockReturnValue({
      mutate: downloadMutate,
      isPending: false,
    } as ReturnType<typeof hooks.useExportBoardDownload>)

    render(
      <Wrapper>
        <ExportPanel
          {...defaultProps}
          isBoardLocked
          onUpgradeBoard={onUpgradeBoard}
        />
      </Wrapper>
    )

    await user.click(screen.getByTestId('board-export-tab'))
    expect(screen.getByTestId('board-locked')).toBeInTheDocument()
    await user.click(screen.getByTestId('board-upgrade-button'))
    expect(onUpgradeBoard).toHaveBeenCalledTimes(1)
    expect(previewMutate).not.toHaveBeenCalled()
    expect(downloadMutate).not.toHaveBeenCalled()
  })
})

describe('Variance tab', () => {
  it('renders variance tab trigger', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} open />
      </Wrapper>
    )
    expect(screen.getByTestId('format-card-variance')).toBeInTheDocument()
    expect(screen.getByTestId('format-card-variance')).toHaveTextContent(
      'Statement Check'
    )
  })

  it('shows variance report content when tab selected', async () => {
    const user = userEvent.setup()
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} open />
      </Wrapper>
    )
    await user.click(screen.getByTestId('format-card-variance'))
    expect(screen.getByTestId('variance-report')).toBeInTheDocument()
  })

  it('opens to defaultTab="variance" immediately', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} open defaultTab="variance" />
      </Wrapper>
    )
    expect(screen.getByTestId('variance-report')).toBeInTheDocument()
  })

  it('syncs to new defaultTab when panel reopens', () => {
    const { rerender } = render(
      <Wrapper>
        <ExportPanel {...defaultProps} open={false} defaultTab="pdf" />
      </Wrapper>
    )
    rerender(
      <Wrapper>
        <ExportPanel {...defaultProps} open={true} defaultTab="variance" />
      </Wrapper>
    )
    expect(screen.getByTestId('variance-report')).toBeInTheDocument()
  })
})

describe('ExportPanel History tab - offline / paused', () => {
  it('shows offline ErrorState and Try again; hides misleading empty copy', () => {
    const refetch = vi.fn()
    vi.mocked(hooks.useExportHistory).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch,
    } as never)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} defaultTab="history" />
      </Wrapper>
    )

    expect(screen.getByText("Can't reach the server")).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText('No exports yet')).not.toBeInTheDocument()
  })

  it('Try again button calls refetch', () => {
    const refetch = vi.fn()
    vi.mocked(hooks.useExportHistory).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch,
    } as never)

    render(
      <Wrapper>
        <ExportPanel {...defaultProps} defaultTab="history" />
      </Wrapper>
    )

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})

describe('F-259: inactive forceMount tabs must be hidden', () => {
  it('forceMount inactive TabsContent elements carry data-[state=inactive]:hidden class', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} defaultTab="pdf" />
      </Wrapper>
    )

    const allPanels = document.querySelectorAll('[role="tabpanel"]')
    // At least 5 panels present because forceMount keeps them in the DOM
    expect(allPanels.length).toBeGreaterThanOrEqual(5)

    // The five forceMount tabs are: pdf (active), batch, erp, history, board.
    // Variance has no forceMount and may not carry the class.
    // Identify forceMount inactive panels by their known content landmarks.
    const forceMountIdentifiers = [
      '[data-testid="tenant-selector"]', // batch
      '[data-testid="erp-config-panel"]', // erp
      '[data-testid="format-filter"]', // history
      '[data-testid="board-cap-rate-slider"]', // board
    ]

    forceMountIdentifiers.forEach((selector) => {
      const panel = Array.from(allPanels).find(
        (el) => el.querySelector(selector) !== null
      )
      expect(panel).toBeDefined()
      expect(panel!.getAttribute('data-state')).toBe('inactive')
      expect(panel!.className).toContain('data-[state=inactive]:hidden')
    })
  })

  it('history panel is inactive and carries hiding class when pdf tab is active', () => {
    render(
      <Wrapper>
        <ExportPanel {...defaultProps} defaultTab="pdf" />
      </Wrapper>
    )

    const allPanels = document.querySelectorAll('[role="tabpanel"]')
    // Find the history panel: it is the one containing the format-filter select
    const historyPanel = Array.from(allPanels).find(
      (el) => el.querySelector('[data-testid="format-filter"]') !== null
    )

    expect(historyPanel).toBeDefined()
    expect(historyPanel!.getAttribute('data-state')).toBe('inactive')
    expect(historyPanel!.className).toContain('data-[state=inactive]:hidden')
  })
})
