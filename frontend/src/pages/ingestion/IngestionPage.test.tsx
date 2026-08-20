/**
 * IngestionPage tests - single-step GL upload flow
 *
 * Coverage groups:
 *  1. Render
 *  2. Property guard (no property selected)
 *  3. Auto-upload on file selection
 *  4. Yardi source detection
 *  5. Generic source detection / column mapping
 *  6. Column mapping validation
 *  7. Continue button - success transition
 *  8. Success state
 *  9. Partial errors state
 * 10. 413 file-size error
 * 11. 409 duplicate file error
 * 12. Network error
 * 13. History tab
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IngestionPage } from './IngestionPage'
import { MemoryRouter, useLocation } from 'react-router-dom'

// F-278: surfaces the in-memory router location so tests can assert the
// `?tab=` query param the ingestion tabs write. MemoryRouter does not touch
// window.location, so we read it from the router instead.
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

// -- Mocks --

const { mockCaptureUnexpectedError, mockTrackEvent } = vi.hoisted(() => ({
  mockCaptureUnexpectedError: vi.fn(),
  mockTrackEvent: vi.fn(),
}))

vi.mock('@/lib/analytics', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics')
  return {
    ...actual,
    trackEvent: mockTrackEvent,
  }
})

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedError: mockCaptureUnexpectedError,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}))

vi.mock('@/api/generated/sdk.gen', () => ({
  listPropertiesApiV1PropertiesGet: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'prop-1',
          name: 'Test Property',
          address_line1: null,
          city: null,
        },
      ],
    },
  }),
}))

vi.mock('@/api/client', () => ({ apiClient: {} }))

vi.mock('@/components/ingestion/FileUploader', () => ({
  FileUploader: ({
    onFilesSelected,
    accept,
    isDisabled,
  }: {
    onFilesSelected: (files: File[]) => void
    accept?: Record<string, string[]>
    isDisabled?: boolean
  }) => {
    const acceptAttr = accept
      ? Object.values(accept).flat().join("','")
      : '.csv,.xls,.xlsx'
    return (
      <div data-testid="file-uploader">
        <input
          type="file"
          accept={acceptAttr}
          data-testid="file-input"
          disabled={isDisabled}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) onFilesSelected(files)
          }}
        />
        <p>Drag and drop files here</p>
        <p>or click to browse</p>
      </div>
    )
  },
}))

vi.mock('@/components/ingestion/ImportErrorDisplay', () => ({
  ImportErrorDisplay: ({
    summary,
  }: {
    summary: { failedRows: number; errors: Array<{ errorType: string }> }
  }) => (
    <div>
      <div>Import Errors</div>
      <div>{summary.failedRows} rows failed</div>
      {summary.errors.map((e, i) => (
        <div key={i}>
          {e.errorType === 'invalid_format' ? 'Invalid Format' : e.errorType}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/ingestion/ImportHistoryList', () => ({
  ImportHistoryList: ({
    imports,
    onViewDetails,
    onReupload,
    onDelete,
    onNewImport,
  }: {
    imports: Array<{
      id: string
      fileName: string
      status: string
      rowCount: number
    }>
    onViewDetails?: (id: string) => void
    onReupload?: (id: string) => void
    onDelete?: (id: string) => void
    onNewImport?: () => void
  }) => (
    <div>
      {onNewImport && (
        <button onClick={() => onNewImport()}>Start New Upload</button>
      )}
      {imports.map((imp) => (
        <div key={imp.id}>
          <span>{imp.fileName}</span>
          {onViewDetails && (
            <button onClick={() => onViewDetails(imp.id)}>
              View {imp.fileName}
            </button>
          )}
          <span>{imp.status === 'success' ? 'Success' : imp.status}</span>
          <span>{imp.rowCount}</span>
          {imp.status === 'failed' && onReupload && (
            <button onClick={() => onReupload(imp.id)}>
              Re-upload {imp.fileName}
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(imp.id)}>
              Delete {imp.fileName}
            </button>
          )}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// -- Helpers --

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFile(name = 'test.csv'): File {
  return new File(['col1,col2\nval1,val2'], name, { type: 'text/csv' })
}

function makeUploadYardiResponse() {
  return makeJsonResponse({
    batch_id: 'batch-123',
    source_system: 'yardi',
    source_confidence: 0.95,
    row_count: 150,
    error_count: 0,
    warnings: [],
    detected_columns: ['Account', 'Description', 'Debit', 'Credit', 'Date'],
  })
}

function makeUploadGenericResponse() {
  return makeJsonResponse({
    batch_id: 'batch-456',
    source_system: 'generic',
    source_confidence: 0.0,
    row_count: 100,
    error_count: 0,
    warnings: [],
    detected_columns: ['AcctNum', 'Desc', 'Amount', 'TxDate'],
  })
}

function makeUploadPartialResponse() {
  return makeJsonResponse({
    batch_id: 'batch-err',
    source_system: 'yardi',
    source_confidence: 0.92,
    row_count: 100,
    error_count: 5,
    warnings: [],
    detected_columns: ['Account', 'Description', 'Debit', 'Credit', 'Date'],
  })
}

function makeBatchPreviewResponse() {
  return makeJsonResponse({
    preview_entries: [
      {
        id: 'entry-1',
        transaction_date: '2024-01-15T00:00:00.000Z',
        account_code: '5100',
        account_description: 'Janitorial',
        description: 'Lobby cleaning',
        debit: '18500.00',
        credit: null,
        balance: '18500.00',
      },
      {
        id: 'entry-2',
        transaction_date: '2024-01-16',
        account_code: '5200',
        account_description: 'Utilities',
        description: 'Electric bill',
        debit: null,
        credit: '250.00',
        balance: '-250.00',
      },
    ],
  })
}

function renderPage(initialEntry = '/ingestion') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <IngestionPage />
      <LocationProbe />
    </MemoryRouter>
  )
}

/** Select the only property from the mock dropdown. */
async function selectProperty() {
  const user = userEvent.setup()
  const trigger = await screen.findByRole('combobox')
  await user.click(trigger)
  const option = await screen.findByRole('option', { name: 'Test Property' })
  await user.click(option)
}

/** Dispatch a file-change event on the hidden file input. */
function dispatchFileChange(input: HTMLElement) {
  Object.defineProperty(input, 'files', {
    value: [makeFile()],
    configurable: true,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function expectSafeGlImportAnalyticsPayloads() {
  const unsafeKeys = new Set([
    'file_name',
    'filename',
    'fileName',
    'detected_columns',
    'mapping_config',
    'column_mappings',
    'description',
    'detail',
    'error',
    'error_message',
    'message',
  ])
  const unsafeValueFragments = [
    'yardi-gl-jan-2024.csv',
    'generated-yardi.csv',
    'retry-success.csv',
    'broken-import.csv',
    'Lobby cleaning',
    'Electric bill',
  ]

  function inspect(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, nestedValue]) => {
        expect(unsafeKeys.has(key)).toBe(false)
        inspect(nestedValue)
      })
      return
    }
    if (typeof value === 'string') {
      unsafeValueFragments.forEach((fragment) => {
        expect(value).not.toContain(fragment)
      })
    }
  }

  mockTrackEvent.mock.calls
    .filter(([eventName]) => String(eventName).startsWith('gl_import_'))
    .forEach(([, payload]) => inspect(payload))
}

// -- Tests --

describe('IngestionPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mockCaptureUnexpectedError.mockClear()
    mockTrackEvent.mockClear()
  })

  afterEach(() => {
    expectSafeGlImportAnalyticsPayloads()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  // -- 1. Render --

  describe('Render', () => {
    it('shows Upload General Ledger heading', async () => {
      await act(async () => {
        renderPage()
      })
      expect(screen.getByText('Upload General Ledger')).toBeInTheDocument()
    })

    it('renders property select dropdown', async () => {
      await act(async () => {
        renderPage()
      })
      await waitFor(() =>
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      )
    })

    it('renders file input with accepted spreadsheet formats', async () => {
      await act(async () => {
        renderPage()
      })
      const input = await screen.findByTestId('file-input')
      expect(input).toHaveAttribute('accept', ".csv','.xls','.xlsx")
    })

    it('shows drag and drop text', async () => {
      await act(async () => {
        renderPage()
      })
      expect(screen.getByText('Drag and drop files here')).toBeInTheDocument()
    })

    it('shows History tab', async () => {
      await act(async () => {
        renderPage()
      })
      expect(screen.getByRole('tab', { name: /History/i })).toBeInTheDocument()
    })

    it('guides the user to pick a property before uploading and disables the dropzone', async () => {
      await act(async () => {
        renderPage()
      })
      // With no property chosen, the dropzone must not be droppable yet —
      // a first action should be guidance, not an error.
      expect(screen.getByTestId('property-required-hint')).toBeInTheDocument()
      const input = await screen.findByTestId('file-input')
      expect(input).toBeDisabled()
    })
  })

  // -- 2. Property guard --

  describe('Property guard', () => {
    it('shows error when file selected with no property chosen', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      const input = await screen.findByTestId('file-input')
      // Do NOT select a property; trigger upload directly
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByText(/Please select a property before uploading/i)
        ).toBeInTheDocument()
      )
      // Backend fetch should NOT have been called
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // -- 3. Auto-upload --

  describe('Auto-upload', () => {
    it('auto-uploads on file selection and shows loading spinner', async () => {
      let resolveUpload!: (v: Response) => void
      const uploadPromise = new Promise<Response>((res) => {
        resolveUpload = res
      })
      mockFetch.mockReturnValueOnce(uploadPromise)
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      act(() => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
      )
      await act(async () => {
        resolveUpload(makeUploadYardiResponse())
      })
    })

    it('calls POST /api/v1/ingestion/upload on file selection', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/ingestion/upload'),
          expect.objectContaining({ method: 'POST' })
        )
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_started',
        expect.objectContaining({
          property_id: 'prop-1',
          file_type: 'csv',
          file_size_bucket: '<1mb',
        })
      )
    })
  })

  // -- 4. Yardi detection --

  describe('Yardi source detection', () => {
    it('shows Yardi Voyager and confidence after upload', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Yardi Voyager/i)).toBeInTheDocument()
      )
      expect(screen.getByText(/Confidence: 95%/i)).toBeInTheDocument()
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_source_detected',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-123',
          source_system: 'yardi',
          source_confidence_bucket: '90-100',
          row_count_bucket: '101-1k',
          error_count_bucket: '0',
        })
      )
    })

    it('shows Continue button for Yardi detection', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Continue/i })
        ).toBeInTheDocument()
      )
    })

    it('shows a plain-language note when detection confidence is low (F-237)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batch_id: 'batch-low',
          source_system: 'yardi',
          source_confidence: 0.2,
          row_count: 150,
          error_count: 0,
          warnings: [],
          detected_columns: [
            'Account',
            'Description',
            'Debit',
            'Credit',
            'Date',
          ],
        })
      )
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Confidence: 20%/i)).toBeInTheDocument()
      )
      expect(
        screen.getByText(/A low score means we weren't sure/i)
      ).toBeInTheDocument()
    })

    it('does not show the low-confidence note when confidence is high (F-237)', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Confidence: 95%/i)).toBeInTheDocument()
      )
      expect(
        screen.queryByText(/A low score means we weren't sure/i)
      ).not.toBeInTheDocument()
    })

    it('frames a low-confidence result as a guess, not a confident match (F-240)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batch_id: 'batch-low-guess',
          source_system: 'yardi',
          source_confidence: 0.2,
          row_count: 150,
          error_count: 0,
          warnings: [],
          detected_columns: ['Account', 'Description', 'Debit', 'Credit'],
        })
      )
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Our best guess:/i)).toBeInTheDocument()
      )
      // The source name is still shown, just framed as a guess.
      expect(screen.getByText(/Yardi Voyager/i)).toBeInTheDocument()
      // It must NOT claim a confident match at 20%.
      expect(screen.queryByText(/Yardi Voyager detected/i)).toBeNull()
    })

    it('still shows a confident "detected" match when confidence is high (F-240)', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadYardiResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Yardi Voyager/i)).toBeInTheDocument()
      )
      // Confident framing: "detected", not the hedged "Our best guess".
      expect(screen.getByText(/detected/i)).toBeInTheDocument()
      expect(screen.queryByText(/Our best guess:/i)).toBeNull()
    })
  })

  // -- 5. Generic detection --

  describe('Generic source detection', () => {
    it('shows Generic Format and Map Columns section', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadGenericResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Generic Format/i)).toBeInTheDocument()
      )
      expect(screen.getByText(/Map Columns/i)).toBeInTheDocument()
    })

    it('renders shared select controls for mapping fields', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadGenericResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Map Columns/i)).toBeInTheDocument()
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_mapping_required',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-456',
          source_system: 'generic',
        })
      )
      expect(
        screen.getByRole('combobox', { name: /^Account$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: /^Description$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: /^Date$/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('combobox', { name: /^Debit$/i })
      ).toBeInTheDocument()
    })
  })

  // -- 6. Column mapping validation --

  describe('Column mapping validation', () => {
    it('shows error when Continue clicked without mapping fields', async () => {
      mockFetch.mockResolvedValueOnce(makeUploadGenericResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Map Columns/i)).toBeInTheDocument()
      )
      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })
      // With no columns mapped, all four required fields are named (in
      // on-screen order) so the user knows exactly which dropdowns to fill.
      expect(
        screen.getByText(
          /Map these fields to continue: Account, Description, Date, and Debit/i
        )
      ).toBeInTheDocument()
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_failed',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-456',
          failure_stage: 'mapping_validation',
          status_bucket: 'client',
        })
      )
    })

    it('POSTs the mapping + file to apply-mapping and imports the GL rows (F-040)', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce(makeUploadGenericResponse())
        .mockResolvedValueOnce(
          makeJsonResponse({
            batch_id: 'batch-456',
            source_system: 'generic',
            source_confidence: 1.0,
            row_count: 100,
            error_count: 0,
            warnings: [],
            detected_columns: ['AcctNum', 'Desc', 'Amount', 'TxDate'],
          })
        )
        .mockResolvedValueOnce(makeBatchPreviewResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Map Columns/i)).toBeInTheDocument()
      )

      // Fill the four required mapping selects from the detected columns.
      const pick = async (labelRe: RegExp, column: string) => {
        await user.click(screen.getByLabelText(labelRe))
        const options = await screen.findAllByRole('option', { name: column })
        await user.click(options[0])
      }
      await pick(/^Account/i, 'AcctNum')
      await pick(/^Description/i, 'Desc')
      await pick(/^Date/i, 'TxDate')
      await pick(/^Debit/i, 'Amount')

      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })

      await waitFor(() =>
        expect(
          screen.getByText(/100 GL entries imported successfully/i)
        ).toBeInTheDocument()
      )

      // The apply-mapping POST must have fired with the file + mapping_config.
      const applyCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes(
          '/api/v1/ingestion/batches/batch-456/apply-mapping'
        )
      )
      expect(applyCall).toBeDefined()
      const init = applyCall![1] as RequestInit
      expect(init.method).toBe('POST')
      const body = init.body as FormData
      expect(body.get('file')).toBeInstanceOf(File)
      const mapping = JSON.parse(String(body.get('mapping_config')))
      expect(mapping).toMatchObject({
        account_code: 'AcctNum',
        account_description: 'Desc',
        transaction_date: 'TxDate',
        amount: 'Amount',
      })
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_mapping_submitted',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-456',
        })
      )
      // The batch preview is fetched last.
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/v1/ingestion/batches/batch-456'),
        expect.any(Object)
      )
    })
  })

  describe('Continue button', () => {
    it('loads the batch preview before transitioning to success state', async () => {
      mockFetch
        .mockResolvedValueOnce(makeUploadYardiResponse())
        .mockResolvedValueOnce(makeBatchPreviewResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Continue/i })
        ).toBeInTheDocument()
      )
      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })
      await waitFor(() =>
        expect(
          screen.getByText(/150 GL entries imported successfully/i)
        ).toBeInTheDocument()
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_completed',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-123',
          row_count_bucket: '101-1k',
          error_count_bucket: '0',
          has_preview: true,
          result_status: 'success',
        })
      )
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/v1/ingestion/batches/batch-123'),
        expect.any(Object)
      )
    })
  })

  describe('Success state', () => {
    it('shows imported preview rows from the batch details endpoint', async () => {
      mockFetch
        .mockResolvedValueOnce(makeUploadYardiResponse())
        .mockResolvedValueOnce(makeBatchPreviewResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Continue/i })
        ).toBeInTheDocument()
      )
      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })
      await waitFor(() =>
        expect(
          screen.getByText(/150 GL entries imported successfully/i)
        ).toBeInTheDocument()
      )
      expect(screen.getByText('GL Entry Preview')).toBeInTheDocument()
      expect(screen.getByText('Lobby cleaning')).toBeInTheDocument()
      expect(screen.getByText('Electric bill')).toBeInTheDocument()
      expect(
        screen.queryByText(/No entries found\. Try adjusting your filters\./i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Partial errors state', () => {
    it('shows Import Errors and failed row count when error_count > 0', async () => {
      mockFetch
        .mockResolvedValueOnce(makeUploadPartialResponse())
        .mockResolvedValueOnce(makeBatchPreviewResponse())
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Continue/i })
        ).toBeInTheDocument()
      )
      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })
      await waitFor(() =>
        expect(screen.getByText(/Import Errors/i)).toBeInTheDocument()
      )
      expect(screen.getByText(/5 rows failed/i)).toBeInTheDocument()
    })

    it('shows a dedicated preview error when the batch preview request fails', async () => {
      mockFetch
        .mockResolvedValueOnce(makeUploadYardiResponse())
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })
        )
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Continue/i })
        ).toBeInTheDocument()
      )
      await act(async () => {
        screen.getByRole('button', { name: /Continue/i }).click()
      })
      await waitFor(() =>
        expect(
          screen.getByText(/GL preview could not be loaded/i)
        ).toBeInTheDocument()
      )
      expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: 'ingestion.preview',
          path: '/api/v1/ingestion/batches/:batchId',
          statusCode: 500,
        }
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_preview_failed',
        expect.objectContaining({
          property_id: 'prop-1',
          batch_id: 'batch-123',
          status_bucket: '5xx',
        })
      )
      expect(
        screen.queryByText(/No entries found\. Try adjusting your filters\./i)
      ).not.toBeInTheDocument()
    })
  })

  describe('413 file-size error', () => {
    it('shows file size exceeded message on 413', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too large' }), { status: 413 })
      )
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByText(/File size exceeds maximum limit/i)
        ).toBeInTheDocument()
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_failed',
        expect.objectContaining({
          property_id: 'prop-1',
          failure_stage: 'upload',
          status_bucket: 'too_large',
        })
      )
    })
  })

  describe('409 duplicate file error', () => {
    it('shows already imported message on 409', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: 'File has already been imported' }),
          { status: 409 }
        )
      )
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(
          screen.getByText(/This file has already been imported/i)
        ).toBeInTheDocument()
      )
    })
  })

  describe('Network error', () => {
    it('shows Upload failed on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'))
      renderPage()
      await selectProperty()
      const input = await screen.findByTestId('file-input')
      await act(async () => {
        dispatchFileChange(input)
      })
      await waitFor(() =>
        expect(screen.getByText(/Upload failed/i)).toBeInTheDocument()
      )
      expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: 'ingestion.upload',
          path: '/api/v1/ingestion/upload',
        }
      )
    })
  })

  describe('History tab', () => {
    it('shows history records using /api/v1/ingestion/batches endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batches: [
            {
              id: 'import-123',
              file_name: 'yardi-gl-jan-2024.csv',
              created_at: new Date().toISOString(),
              source_system: 'yardi',
              row_count: 150,
              status: 'completed',
            },
          ],
        })
      )
      renderPage()
      const user = userEvent.setup()
      const historyTab = screen.getByRole('tab', { name: /History/i })
      await user.click(historyTab)
      await waitFor(() =>
        expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
      )
      expect(mockTrackEvent).toHaveBeenCalledWith('gl_import_history_loaded', {
        import_count_bucket: '1-10',
      })
      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText('150')).toBeInTheDocument()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ingestion/batches'),
        expect.any(Object)
      )
    })

    it('maps generated import history field names', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batches: [
            {
              id: 'import-456',
              filename: 'generated-yardi.csv',
              created_at: new Date().toISOString(),
              parser_type: 'yardi',
              rows_processed: 275,
              status: 'completed',
            },
          ],
        })
      )
      renderPage()
      const user = userEvent.setup()

      await user.click(screen.getByRole('tab', { name: /History/i }))

      await waitFor(() =>
        expect(screen.getByText('generated-yardi.csv')).toBeInTheDocument()
      )
      expect(screen.getByText('275')).toBeInTheDocument()
    })

    it('shows an error with retry when history fails to load, then recovers', async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({}, 500))
      renderPage()
      const user = userEvent.setup()

      await user.click(screen.getByRole('tab', { name: /History/i }))

      await waitFor(() =>
        expect(screen.getByTestId('history-error')).toBeInTheDocument()
      )
      expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: 'ingestion.history',
          path: '/api/v1/ingestion/batches',
          statusCode: 500,
        }
      )
      expect(mockTrackEvent).toHaveBeenCalledWith('gl_import_history_failed', {
        status_bucket: '5xx',
      })

      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batches: [
            {
              id: 'import-789',
              file_name: 'retry-success.csv',
              created_at: new Date().toISOString(),
              source_system: 'yardi',
              row_count: 42,
              status: 'completed',
            },
          ],
        })
      )

      await user.click(screen.getByRole('button', { name: /Retry/i }))

      await waitFor(() =>
        expect(screen.getByText('retry-success.csv')).toBeInTheDocument()
      )
      expect(screen.queryByTestId('history-error')).not.toBeInTheDocument()
    })

    it('opens the GL entry preview when a history filename is clicked (F-238)', async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeJsonResponse({
            batches: [
              {
                id: 'import-123',
                file_name: 'yardi-gl-jan-2024.csv',
                created_at: new Date().toISOString(),
                source_system: 'yardi',
                row_count: 150,
                status: 'completed',
              },
            ],
          })
        )
        .mockResolvedValueOnce(makeBatchPreviewResponse())
      renderPage()
      const user = userEvent.setup()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /View yardi-gl-jan-2024\.csv/i })
      )

      await waitFor(() =>
        expect(screen.getByText('Lobby cleaning')).toBeInTheDocument()
      )
      expect(screen.getByText('Electric bill')).toBeInTheDocument()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ingestion/batches/import-123'),
        expect.any(Object)
      )
    })

    it('shows an error in the details dialog when the preview fails to load (F-238)', async () => {
      mockFetch
        .mockResolvedValueOnce(
          makeJsonResponse({
            batches: [
              {
                id: 'import-123',
                file_name: 'yardi-gl-jan-2024.csv',
                created_at: new Date().toISOString(),
                source_system: 'yardi',
                row_count: 150,
                status: 'completed',
              },
            ],
          })
        )
        .mockResolvedValueOnce(makeJsonResponse({ detail: 'boom' }, 500))
      renderPage()
      const user = userEvent.setup()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /View yardi-gl-jan-2024\.csv/i })
      )

      await waitFor(() =>
        expect(
          screen.getByText(
            /We could not open this import\. Please try again\./i
          )
        ).toBeInTheDocument()
      )
      expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: 'ingestion.details',
          path: '/api/v1/ingestion/batches/:batchId',
          statusCode: 500,
        }
      )
    })

    it('deep-links to the History tab and loads history on mount when ?tab=history (F-278)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({
          batches: [
            {
              id: 'import-deeplink',
              file_name: 'deeplinked.csv',
              created_at: new Date().toISOString(),
              source_system: 'yardi',
              row_count: 12,
              status: 'completed',
            },
          ],
        })
      )
      renderPage('/ingestion?tab=history')

      expect(screen.getByRole('tab', { name: /History/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await waitFor(() =>
        expect(screen.getByText('deeplinked.csv')).toBeInTheDocument()
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/ingestion/batches'),
        expect.any(Object)
      )
    })

    it('reflects the active tab in the ?tab= URL param when switching tabs (F-278)', async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ batches: [] }))
      renderPage()
      const user = userEvent.setup()

      // Defaults to Upload with no tab param.
      expect(screen.getByRole('tab', { name: /Upload/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /History/i })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      )
      // The URL param drives the tab, so it must reflect the switch.
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        'tab=history'
      )

      // Switching back to Upload clears the param entirely.
      await user.click(screen.getByRole('tab', { name: /Upload/i }))
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /Upload/i })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      )
      expect(screen.getByTestId('location-search')).not.toHaveTextContent(
        'tab='
      )
    })
  })

  // -- 14. History row actions (F-118) --

  describe('History row actions (F-118)', () => {
    function makeHistoryResponse(status: string) {
      return makeJsonResponse({
        batches: [
          {
            id: 'import-999',
            file_name: 'broken-import.csv',
            created_at: new Date().toISOString(),
            source_system: 'yardi',
            row_count: 0,
            status,
          },
        ],
      })
    }

    it('clears a failed import via POST .../retry and returns to upload', async () => {
      const { toast } = await import('sonner')
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce(makeHistoryResponse('failed')) // initial load
        .mockResolvedValueOnce(
          makeJsonResponse({
            success: true,
            status: 'ready_for_upload',
            message: 'Failed batch cleared. Upload the file again to retry.',
          })
        ) // retry POST
      renderPage()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('broken-import.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /Re-upload broken-import\.csv/i })
      )

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/ingestion/batches/import-999/retry'),
          expect.objectContaining({ method: 'POST' })
        )
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'gl_import_retry_clicked',
        expect.objectContaining({
          batch_id: 'import-999',
          source_system: 'yardi',
          row_count_bucket: '0',
          previous_status: 'failed',
        })
      )
      expect(toast.success).toHaveBeenCalledWith(
        'Failed batch cleared. Upload the file again to retry.'
      )
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /Upload/i })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      )
      expect(screen.getByTestId('location-search')).not.toHaveTextContent(
        'tab=history'
      )
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('deletes an import via DELETE .../{id} and reloads history', async () => {
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce(makeHistoryResponse('completed')) // initial load
        .mockResolvedValueOnce(makeJsonResponse({})) // delete
        .mockResolvedValueOnce(makeJsonResponse({ batches: [] })) // reload
      renderPage()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('broken-import.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /Delete broken-import\.csv/i })
      )

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/ingestion/batches/import-999'),
          expect.objectContaining({ method: 'DELETE' })
        )
      )
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    })

    it('surfaces an error toast when the retry request fails', async () => {
      const { toast } = await import('sonner')
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce(makeHistoryResponse('failed')) // initial load
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'Retry blocked' }), {
            status: 409,
          })
        )
      renderPage()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('broken-import.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /Re-upload broken-import\.csv/i })
      )

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Could not retry this import. Please try again.'
        )
      )
      expect(mockCaptureUnexpectedError).not.toHaveBeenCalled()
    })

    it('reports a retry server failure while keeping the toast graceful', async () => {
      const { toast } = await import('sonner')
      const user = userEvent.setup()
      mockFetch
        .mockResolvedValueOnce(makeHistoryResponse('failed')) // initial load
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'Retry blocked' }), {
            status: 500,
          })
        )
      renderPage()

      await user.click(screen.getByRole('tab', { name: /History/i }))
      await waitFor(() =>
        expect(screen.getByText('broken-import.csv')).toBeInTheDocument()
      )

      await user.click(
        screen.getByRole('button', { name: /Re-upload broken-import\.csv/i })
      )

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Could not retry this import. Please try again.'
        )
      )
      expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          operation: 'ingestion.retry',
          path: '/api/v1/ingestion/batches/:batchId/retry',
          statusCode: 500,
        }
      )
    })
  })
})
