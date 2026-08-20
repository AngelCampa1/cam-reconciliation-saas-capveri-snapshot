/**
 * LeaseUploadPage Component Tests
 *
 * Tests for the lease PDF upload page including:
 * - Initial render and empty state
 * - Property selection (required)
 * - Lease selection (optional, filtered by property)
 * - File selection workflow (PDF only, batch)
 * - Upload states and navigation
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { LeaseUploadPage } from './LeaseUploadPage'

const { mockTrackEvent } = vi.hoisted(() => ({
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

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

// Mock the API functions
vi.mock('@/api/generated/sdk.gen', () => ({
  listPropertiesApiV1PropertiesGet: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'property-1',
          name: 'Downtown Tower',
          address_line1: '100 Main Street',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
        },
        {
          id: 'property-2',
          name: 'Suburban Office',
          address_line1: '5000 Tech Center Drive',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
        },
      ],
    },
  }),
  listLeasesApiV1LeasesGet: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'lease-1',
          tenant_name: 'Acme Corp',
          property_id: 'property-1',
        },
        {
          id: 'lease-2',
          tenant_name: 'TechStart Inc',
          property_id: 'property-1',
        },
      ],
    },
  }),
  uploadDocumentApiV1DocumentsUploadPost: vi.fn().mockResolvedValue({
    data: { id: 'doc-123', status: 'pending', message: 'Document uploaded' },
  }),
}))

// Mock FileUploader component with PDF support
vi.mock('@/components/ingestion/FileUploader', () => ({
  FileUploader: ({
    onFilesSelected,
    isDisabled,
    accept,
  }: {
    onFilesSelected: (files: File[]) => void
    isDisabled?: boolean
    accept?: Record<string, string[]>
  }) => (
    <div
      data-testid="file-uploader"
      data-disabled={String(isDisabled)}
      data-accept={JSON.stringify(accept)}
    >
      <button
        onClick={() => {
          const mockFile = new File(['pdf-content'], 'lease-doc.pdf', {
            type: 'application/pdf',
          })
          onFilesSelected([mockFile])
        }}
        disabled={isDisabled}
        data-testid="mock-file-select"
      >
        Select PDF
      </button>
      <button
        onClick={() => {
          const mockFiles = [
            new File(['pdf1'], 'lease1.pdf', { type: 'application/pdf' }),
            new File(['pdf2'], 'lease2.pdf', { type: 'application/pdf' }),
            new File(['pdf3'], 'lease3.pdf', { type: 'application/pdf' }),
          ]
          onFilesSelected(mockFiles)
        }}
        disabled={isDisabled}
        data-testid="mock-multi-file-select"
      >
        Select Multiple PDFs
      </button>
    </div>
  ),
}))

function renderWithRouter(component: React.ReactElement) {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

describe('LeaseUploadPage', () => {
  const mockNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockTrackEvent.mockClear()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
  })

  describe('Initial Render', () => {
    it('renders page header and description', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(screen.getByText('Upload Lease PDFs')).toBeInTheDocument()
      expect(
        screen.getByText(/Upload lease PDFs to extract key terms for review/i)
      ).toBeInTheDocument()
    })

    it('renders upload card with title', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(screen.getByText('Upload Lease Documents')).toBeInTheDocument()
      expect(screen.getByText(/PDF files up to 50MB each/i)).toBeInTheDocument()
    })

    it('renders property selector', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByText('Select Property')).toBeInTheDocument()
      })
    })

    it('guides the user to pick a property before uploading and disables the dropzone', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(screen.getByTestId('property-required-hint')).toBeInTheDocument()
      expect(screen.getByTestId('file-uploader')).toHaveAttribute(
        'data-disabled',
        'true'
      )
    })

    it('renders file uploader component with PDF accept type', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      const fileUploader = screen.getByTestId('file-uploader')
      expect(fileUploader).toBeInTheDocument()
      expect(fileUploader.getAttribute('data-accept')).toContain(
        'application/pdf'
      )
    })

    it('file uploader is disabled until property is selected', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByTestId('file-uploader')).toHaveAttribute(
          'data-disabled',
          'true'
        )
      })
    })

    it('does not show action buttons initially', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(
        screen.queryByRole('button', { name: /Upload/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Clear/i })
      ).not.toBeInTheDocument()
    })

    it('does not show success or error alerts initially', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(
        screen.queryByText(/uploaded successfully/i)
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/Upload failed/i)).not.toBeInTheDocument()
    })
  })

  describe('Property Selection', () => {
    it('loads properties on mount', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      // Click to open dropdown
      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      expect(await screen.findByText('Downtown Tower')).toBeInTheDocument()
      expect(await screen.findByText('Suburban Office')).toBeInTheDocument()
    })

    it('enables file uploader after property selection', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      // Select a property
      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await waitFor(() => {
        expect(screen.getByTestId('file-uploader')).toHaveAttribute(
          'data-disabled',
          'false'
        )
      })
    })

    it('shows lease selector after property selection', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      // Select a property
      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      // Lease selector should appear (optional)
      await waitFor(() => {
        expect(screen.getByText(/Link to Lease/i)).toBeInTheDocument()
      })
    })
  })

  describe('Lease Selection (Optional)', () => {
    const selectProperty = async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })
    }

    it('filters leases by selected property', async () => {
      await selectProperty()

      // Wait for leases to load
      await waitFor(() => {
        expect(screen.getByText(/Link to Lease/i)).toBeInTheDocument()
      })

      // Find and click the lease selector
      const leaseSelectors = screen.getAllByRole('combobox')
      const leaseSelector = leaseSelectors[1] // Second combobox is lease selector

      await act(async () => {
        fireEvent.click(leaseSelector)
      })

      // Should show leases for property-1
      expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
      expect(await screen.findByText('TechStart Inc')).toBeInTheDocument()
    })

    it('allows proceeding without lease selection', async () => {
      await selectProperty()

      // Select a file without selecting lease
      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      // Should still show upload button
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Upload/i })
        ).toBeInTheDocument()
      })
    })

    it('surfaces a retryable error (not the empty state) when leases fail to load', async () => {
      const { listLeasesApiV1LeasesGet } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(listLeasesApiV1LeasesGet).mockRejectedValueOnce(
        new Error('Network connection timeout')
      )

      await selectProperty()

      // Error branch is shown, distinct from the "No leases found" empty state.
      const errorBox = await screen.findByTestId('lease-upload-leases-error')
      expect(errorBox).toBeInTheDocument()
      expect(
        screen.queryByText(/No leases found for this property/i)
      ).not.toBeInTheDocument()

      // Retry re-fetches; second call resolves and shows the lease selector.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
      })

      await waitFor(() => {
        expect(
          screen.queryByTestId('lease-upload-leases-error')
        ).not.toBeInTheDocument()
      })
      expect(screen.getByText(/Link to Lease/i)).toBeInTheDocument()
    })

    it('keeps upload non-blocking even when leases fail to load', async () => {
      const { listLeasesApiV1LeasesGet } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(listLeasesApiV1LeasesGet).mockRejectedValueOnce(
        new Error('Network connection timeout')
      )

      await selectProperty()

      await screen.findByTestId('lease-upload-leases-error')

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Upload/i })
        ).toBeInTheDocument()
      })
    })
  })

  describe('File Upload Workflow', () => {
    const selectPropertyAndFile = async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })
    }

    it('shows action buttons after file selection', async () => {
      await selectPropertyAndFile()

      expect(
        screen.getByRole('button', { name: /Upload/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument()
    })

    it('enables upload button when property and files are selected', async () => {
      await selectPropertyAndFile()

      const uploadButton = screen.getByRole('button', { name: /Upload/i })
      expect(uploadButton).not.toBeDisabled()
    })

    it('accepts multiple PDF files (batch upload)', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      // Select multiple files
      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-multi-file-select'))
      })

      // Should show file count or list
      await waitFor(() => {
        expect(screen.getByText(/3 files? selected/i)).toBeInTheDocument()
      })
    })

    it('clears files when clear button is clicked', async () => {
      await selectPropertyAndFile()

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Clear/i }))
      })

      expect(
        screen.queryByRole('button', { name: /Upload/i })
      ).not.toBeInTheDocument()
    })
  })

  describe('Upload States', () => {
    it('shows uploading state with spinner', async () => {
      // Make upload take longer to see loading state
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      let resolveUpload: (value: unknown) => void
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve
          })
      )

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      // Start upload (don't await completion)
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      // Check for loading state - should show "Uploading" in button or alert
      await waitFor(() => {
        // The button text changes to "Uploading..." during upload
        expect(
          screen.getByRole('button', { name: /Uploading/i })
        ).toBeInTheDocument()
      })

      // Complete the upload to avoid hanging promises
      await act(async () => {
        resolveUpload!({ data: { id: 'doc-123', status: 'pending' } })
      })
    })

    it('shows success state and navigates to /extractions', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      await waitFor(
        () => {
          expect(screen.getByText(/uploaded successfully/i)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_document_upload_started',
        expect.objectContaining({
          property_id: 'property-1',
          file_type: 'pdf',
          file_count_bucket: '1-10',
          largest_file_size_bucket: '<1mb',
          has_linked_lease: false,
        })
      )
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_document_upload_completed',
        expect.objectContaining({
          property_id: 'property-1',
          uploaded_count_bucket: '1-10',
        })
      )

      await waitFor(
        () => {
          expect(mockNavigate).toHaveBeenCalledWith('/extractions')
        },
        { timeout: 4000 }
      )
    })

    it('disables controls during upload', async () => {
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: { id: 'doc-123', status: 'pending' },
                }),
              200
            )
          )
      )

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      // Controls should be disabled during upload
      await waitFor(() => {
        expect(screen.getByTestId('file-uploader')).toHaveAttribute(
          'data-disabled',
          'true'
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('shows error for file too large (>50MB)', async () => {
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockResolvedValueOnce({
        error: {
          detail: 'File exceeds maximum size of 50MB',
        },
      })

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      await waitFor(() => {
        expect(screen.getByText(/File exceeds 50MB limit/i)).toBeInTheDocument()
      })
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'lease_document_upload_failed',
        expect.objectContaining({
          property_id: 'property-1',
          failure_stage: 'upload',
          failure_reason: 'too_large',
          file_type: 'pdf',
        })
      )
    })

    it('shows error for invalid file type', async () => {
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockResolvedValueOnce({
        error: {
          detail: 'Only PDF files are accepted',
        },
      })

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      await waitFor(() => {
        expect(
          screen.getByText(/Only PDF files are supported/i)
        ).toBeInTheDocument()
      })
    })

    it('shows error for network failures', async () => {
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockRejectedValueOnce(
        new Error('Network connection timeout')
      )

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      await waitFor(() => {
        expect(screen.getByText(/Connection failed/i)).toBeInTheDocument()
      })
    })

    it('shows generic error fallback', async () => {
      const { uploadDocumentApiV1DocumentsUploadPost } =
        await import('@/api/generated/sdk.gen')
      vi.mocked(uploadDocumentApiV1DocumentsUploadPost).mockRejectedValueOnce(
        new Error('')
      )

      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('combobox'))
      })

      await act(async () => {
        const option = await screen.findByText('Downtown Tower')
        fireEvent.click(option)
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('mock-file-select'))
      })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Upload/i }))
      })

      await waitFor(() => {
        expect(
          screen.getByText(/Upload failed. Please try again/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Help Section', () => {
    it('renders help section with supported format info', async () => {
      await act(async () => {
        renderWithRouter(<LeaseUploadPage />)
      })

      expect(screen.getByText(/Supported Format/i)).toBeInTheDocument()
      expect(screen.getByText(/PDF Documents/i)).toBeInTheDocument()
      expect(screen.getByText(/PDF format only/i)).toBeInTheDocument()
    })
  })
})
