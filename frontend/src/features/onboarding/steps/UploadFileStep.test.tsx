/**
 * Tests for UploadFileStep component.
 *
 * Validates file upload functionality and drag-and-drop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadFileStep } from './UploadFileStep'

// Mock hooks
vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

vi.mock('@/api/generated', () => ({
  uploadFileApiV1IngestionUploadPost: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: {},
  getSession: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
}))

const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding
const mockUploadFile = vi.mocked(
  (await import('@/api/generated')).uploadFileApiV1IngestionUploadPost
)

describe('UploadFileStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadFile.mockResolvedValue({
      data: {
        batch_id: 'batch-123',
        source_system: 'generic',
        row_count: 50,
      },
      error: undefined,
    } as any)

    vi.stubGlobal('fetch', vi.fn())

    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      setStepData: mockSetStepData,
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      state: { data: {}, currentStep: 4, totalSteps: 5 },
      isFirstStep: false,
      isLastStep: false,
      progress: 60,
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders empty upload area initially', () => {
    render(<UploadFileStep />)

    expect(
      screen.getByText(/your financial data is protected/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/drop your file here, or click to pick one/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /skip for now/i })
    ).toBeInTheDocument()
  })

  it('handles file selection via input', async () => {
    const user = userEvent.setup()
    render(<UploadFileStep />)

    const file = new File(['test content'], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/drop your file here/i, {
      selector: 'input',
    })

    await user.upload(input, file)

    expect(screen.getByText('test.csv')).toBeInTheDocument()
  })

  it('shows file info when file is selected', async () => {
    const user = userEvent.setup()
    render(<UploadFileStep />)

    const file = new File(['test content'], 'sample.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const input = screen.getByLabelText(/drop your file here/i, {
      selector: 'input',
    })

    await user.upload(input, file)

    expect(screen.getByText('sample.xlsx')).toBeInTheDocument()
    expect(screen.getByText(/KB/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /pick a different file/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /use this file/i })
    ).toBeInTheDocument()
  })

  it('clears file when use a different file button is clicked', async () => {
    const user = userEvent.setup()
    render(<UploadFileStep />)

    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/drop your file here/i, {
      selector: 'input',
    })

    await user.upload(input, file)
    expect(screen.getByText('test.csv')).toBeInTheDocument()

    const changeButton = screen.getByRole('button', {
      name: /pick a different file/i,
    })
    await user.click(changeButton)

    expect(
      screen.getByText(/drop your file here, or click to pick one/i)
    ).toBeInTheDocument()
  })

  it('shows use this file button when file is selected', async () => {
    const user = userEvent.setup()
    render(<UploadFileStep />)

    const file = new File(['test'], 'data.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/drop your file here/i, {
      selector: 'input',
    })

    await user.upload(input, file)

    const uploadButton = screen.getByRole('button', { name: /use this file/i })
    expect(uploadButton).toBeInTheDocument()
    expect(uploadButton).toBeEnabled()
  })

  it('calls nextStep when skip button is clicked', async () => {
    const user = userEvent.setup()
    render(<UploadFileStep />)

    const skipButton = screen.getByRole('button', { name: /skip for now/i })
    await user.click(skipButton)

    expect(mockNextStep).toHaveBeenCalledTimes(1)
  })

  it('shows skip button in initial state', () => {
    render(<UploadFileStep />)

    const skipButton = screen.getByRole('button', { name: /skip for now/i })
    expect(skipButton).toBeInTheDocument()
  })

  describe('File Validation', () => {
    it('accepts CSV and Excel file types', async () => {
      const user = userEvent.setup()
      render(<UploadFileStep />)

      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      const xlsxFile = new File(['data'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, csvFile)
      expect(screen.getByText('test.csv')).toBeInTheDocument()

      await user.click(
        screen.getByRole('button', { name: /pick a different file/i })
      )

      // Wait for UI to reset to initial state
      await waitFor(() => {
        expect(
          screen.getByText(/drop your file here, or click to pick one/i)
        ).toBeInTheDocument()
      })

      const inputAfterClear = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(inputAfterClear, xlsxFile)
      expect(screen.getByText('test.xlsx')).toBeInTheDocument()
    })

    it('displays file size in human-readable format', async () => {
      const user = userEvent.setup()
      render(<UploadFileStep />)

      const largeFile = new File(['x'.repeat(1024 * 50)], 'large.csv', {
        type: 'text/csv',
      })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, largeFile)

      expect(screen.getByText(/50/i)).toBeInTheDocument() // ~50 KB
      expect(screen.getByText(/KB/i)).toBeInTheDocument()
    })
  })

  describe('Upload Flow', () => {
    it('enables upload button when file is selected', async () => {
      const user = userEvent.setup()
      render(<UploadFileStep />)

      const file = new File(['test'], 'data.csv', { type: 'text/csv' })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, file)

      const uploadButton = screen.getByRole('button', {
        name: /use this file/i,
      })
      expect(uploadButton).toBeEnabled()
    })

    it('keeps skip button visible when file is selected', async () => {
      const user = userEvent.setup()
      render(<UploadFileStep />)

      const file = new File(['test'], 'data.csv', { type: 'text/csv' })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, file)

      // Skip button should still be visible even after file selection
      expect(
        screen.getByRole('button', { name: /skip for now/i })
      ).toBeInTheDocument()
    })

    it('shows use a different file button when file is selected', async () => {
      const user = userEvent.setup()
      render(<UploadFileStep />)

      expect(
        screen.queryByRole('button', { name: /pick a different file/i })
      ).not.toBeInTheDocument()

      const file = new File(['test'], 'data.csv', { type: 'text/csv' })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, file)

      expect(
        screen.getByRole('button', { name: /pick a different file/i })
      ).toBeInTheDocument()
    })

    it('does not trigger reconciliation after successful GL upload', async () => {
      const user = userEvent.setup()
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ year: 2024 }),
      } as Response)

      mockUseOnboarding.mockReturnValue({
        nextStep: mockNextStep,
        setStepData: mockSetStepData,
        prevStep: vi.fn(),
        currentStep: 4,
        totalSteps: 5,
        goToStep: vi.fn(),
        completeOnboarding: vi.fn(),
        state: {
          data: { propertyId: 'prop-123' },
          currentStep: 4,
          totalSteps: 5,
        },
        isFirstStep: false,
        isLastStep: false,
        progress: 60,
      } as any)

      render(<UploadFileStep />)

      const file = new File(['col1,col2\n1,2'], 'gl.csv', { type: 'text/csv' })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, file)
      await user.click(screen.getByRole('button', { name: /use this file/i }))

      await waitFor(() => {
        expect(mockSetStepData).toHaveBeenCalledWith(
          'importBatchId',
          'batch-123'
        )
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('shows a friendly source label, not the raw enum, after upload', async () => {
      const user = userEvent.setup()
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ year: 2024 }),
      } as Response)

      mockUseOnboarding.mockReturnValue({
        nextStep: mockNextStep,
        setStepData: mockSetStepData,
        prevStep: vi.fn(),
        currentStep: 4,
        totalSteps: 5,
        goToStep: vi.fn(),
        completeOnboarding: vi.fn(),
        state: {
          data: { propertyId: 'prop-123' },
          currentStep: 4,
          totalSteps: 5,
        },
        isFirstStep: false,
        isLastStep: false,
        progress: 60,
      } as any)

      render(<UploadFileStep />)

      const file = new File(['col1,col2\n1,2'], 'gl.csv', { type: 'text/csv' })
      const input = screen.getByLabelText(/drop your file here/i, {
        selector: 'input',
      })

      await user.upload(input, file)
      await user.click(screen.getByRole('button', { name: /use this file/i }))

      await waitFor(() => {
        expect(screen.getByText('Generic Format')).toBeInTheDocument()
      })
      // The raw enum value must not leak to the user.
      expect(screen.queryByText('generic')).not.toBeInTheDocument()
    })
  })
})

describe('UploadFileStep - Drag and Drop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      setStepData: mockSetStepData,
      prevStep: vi.fn(),
      currentStep: 4,
      totalSteps: 5,
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      state: { data: {}, currentStep: 4, totalSteps: 5 },
      isFirstStep: false,
      isLastStep: false,
      progress: 60,
    } as any)
  })

  it('sets isDragging true on dragover', () => {
    const { container } = render(<UploadFileStep />)

    const dropZone = container.querySelector('[class*="border-dashed"]')
    expect(dropZone).toBeInTheDocument()

    // Initially not dragging (border-muted-foreground/25)
    expect(dropZone).toHaveClass('border-muted-foreground/25')

    // Trigger dragover
    fireEvent.dragOver(dropZone!, {
      dataTransfer: { files: [] },
    })

    // Should now show dragging state (border-primary)
    expect(dropZone).toHaveClass('border-primary')
  })

  it('sets isDragging false on dragleave', () => {
    const { container } = render(<UploadFileStep />)

    const dropZone = container.querySelector('[class*="border-dashed"]')
    expect(dropZone).toBeInTheDocument()

    // First trigger dragover to set isDragging true
    fireEvent.dragOver(dropZone!, {
      dataTransfer: { files: [] },
    })
    expect(dropZone).toHaveClass('border-primary')

    // Then trigger dragleave to set isDragging false
    fireEvent.dragLeave(dropZone!, {
      dataTransfer: { files: [] },
    })

    // Should return to non-dragging state
    expect(dropZone).toHaveClass('border-muted-foreground/25')
  })

  it('accepts dropped CSV file', () => {
    const { container } = render(<UploadFileStep />)

    const dropZone = container.querySelector('[class*="border-dashed"]')
    const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })

    // Trigger drop event
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [csvFile] },
    })

    // Should display file info
    expect(screen.getByText('test.csv')).toBeInTheDocument()
  })

  it('accepts dropped Excel file', () => {
    const { container } = render(<UploadFileStep />)

    const dropZone = container.querySelector('[class*="border-dashed"]')
    const xlsxFile = new File(['data'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    // Trigger drop event
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [xlsxFile] },
    })

    // Should display file info
    expect(screen.getByText('test.xlsx')).toBeInTheDocument()
  })

  it('rejects dropped file with invalid type', () => {
    const { container } = render(<UploadFileStep />)

    const dropZone = container.querySelector('[class*="border-dashed"]')
    const invalidFile = new File(['data'], 'test.pdf', {
      type: 'application/pdf',
    })

    // Trigger drop event with invalid file type
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [invalidFile] },
    })

    // Should NOT display file info (file was rejected)
    expect(screen.queryByText('test.pdf')).not.toBeInTheDocument()
    // Should still show upload prompt
    expect(
      screen.getByText(/drop your file here, or click to pick one/i)
    ).toBeInTheDocument()
  })
})
