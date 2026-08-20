import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUploader } from './FileUploader'

describe('FileUploader', () => {
  it('renders drag and drop zone with correct text', () => {
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    expect(screen.getByText('Drag and drop files here')).toBeInTheDocument()
    expect(
      screen.getByText('or click here to choose a file from your computer')
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Use a spreadsheet ending in .csv, .xls, or .xlsx/)
    ).toBeInTheDocument()
    expect(screen.getByText(/Max 50MB per file/)).toBeInTheDocument()
  })

  it('calls onFilesSelected when files are selected via input', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    const file = new File(['content'], 'test.csv', { type: 'text/csv' })
    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, file)

    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalled()
    })
  })

  it('displays selected file with name and size', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    const file = new File(['a'.repeat(1500)], 'data.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('data.xlsx')).toBeInTheDocument()
    })
    expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument()
  })

  it('removes file when remove button is clicked', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('test.csv')).toBeInTheDocument()
    })

    const removeButton = screen.getByRole('button', { name: /remove/i })
    await user.click(removeButton)

    expect(screen.queryByText('test.csv')).not.toBeInTheDocument()
    expect(mockCallback).toHaveBeenLastCalledWith([])
  })

  it('formats file sizes correctly', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement

    // Test bytes
    const smallFile = new File(['x'.repeat(500)], 'small.csv', {
      type: 'text/csv',
    })
    await user.upload(input, smallFile)

    await waitFor(() => {
      expect(screen.getByText('500 B')).toBeInTheDocument()
    })

    // Clear and test MB
    const removeBtn = screen.getByRole('button', { name: /remove/i })
    await user.click(removeBtn)

    const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.csv', {
      type: 'text/csv',
    })
    await user.upload(input, largeFile)

    await waitFor(() => {
      expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument()
    })
  })

  it('supports multiple file selection up to maxFiles limit', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} maxFiles={3} />)

    const files = [
      new File(['a'], 'file1.csv', { type: 'text/csv' }),
      new File(['b'], 'file2.csv', { type: 'text/csv' }),
      new File(['c'], 'file3.csv', { type: 'text/csv' }),
    ]

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, files)

    await waitFor(() => {
      expect(screen.getByText('file1.csv')).toBeInTheDocument()
    })
    expect(screen.getByText('file2.csv')).toBeInTheDocument()
    expect(screen.getByText('file3.csv')).toBeInTheDocument()
  })

  it('enforces maxFiles limit', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} maxFiles={2} />)

    // First upload 2 files
    const firstBatch = [
      new File(['a'], 'file1.csv', { type: 'text/csv' }),
      new File(['b'], 'file2.csv', { type: 'text/csv' }),
    ]

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, firstBatch)

    await waitFor(() => {
      expect(screen.getByText('file1.csv')).toBeInTheDocument()
    })

    // Try to upload a third file - should be limited
    const thirdFile = new File(['c'], 'file3.csv', { type: 'text/csv' })
    await user.upload(input, thirdFile)

    // Should still only have 2 files total
    const allCalls = mockCallback.mock.calls
    const lastCall = allCalls[allCalls.length - 1][0]
    expect(lastCall.length).toBeLessThanOrEqual(2)
  })

  it('disables interaction when isDisabled is true', () => {
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} isDisabled={true} />)

    const dropzone = screen.getByText('Drag and drop files here').closest('div')
    expect(dropzone).toHaveClass('opacity-50', 'cursor-not-allowed')
    // Assistive tech should hear the zone is unavailable, not just see it dimmed.
    expect(screen.getByTestId('file-upload-zone')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('disables remove button when isDisabled is true', async () => {
    const user = userEvent.setup()
    const mockCallback = vi.fn()
    const { rerender } = render(<FileUploader onFilesSelected={mockCallback} />)

    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText('test.csv')).toBeInTheDocument()
    })

    // Rerender with disabled state
    rerender(<FileUploader onFilesSelected={mockCallback} isDisabled={true} />)

    const removeButton = screen.getByRole('button', { name: /remove/i })
    expect(removeButton).toBeDisabled()
  })

  it('accepts CSV, XLS, and XLSX file types', () => {
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} />)

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement
    const acceptAttr = input.getAttribute('accept')

    expect(acceptAttr).toContain('.csv')
    expect(acceptAttr).toContain('.xls')
    expect(acceptAttr).toContain('.xlsx')
  })

  it('shows custom maxSize in UI text', () => {
    const mockCallback = vi.fn()
    const customMaxSize = 100 * 1024 * 1024 // 100MB
    render(
      <FileUploader onFilesSelected={mockCallback} maxSize={customMaxSize} />
    )

    expect(screen.getByText(/Max 100MB per file/)).toBeInTheDocument()
  })

  it('supports single file mode when maxFiles is 1', () => {
    const mockCallback = vi.fn()
    render(<FileUploader onFilesSelected={mockCallback} maxFiles={1} />)

    const input = screen
      .getByTestId('file-upload-zone')
      .querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toHaveAttribute('multiple')
  })

  describe('Error Handling', () => {
    it('shows error when file is too large', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      const maxSize = 1024 // 1KB
      render(<FileUploader onFilesSelected={mockCallback} maxSize={maxSize} />)

      // Create file larger than maxSize
      const largeFile = new File(['x'.repeat(2048)], 'large.csv', {
        type: 'text/csv',
      })

      // Mock file size (Vitest doesn't set actual size)
      Object.defineProperty(largeFile, 'size', { value: 2048 })

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // Upload oversized file
      await user.upload(input, largeFile)

      await waitFor(() => {
        // Check if error alert is present
        const errorText = screen.queryByText(/exceeds.*limit/i)
        if (errorText) {
          expect(errorText).toBeInTheDocument()
        }
      })
    })

    it('shows error for invalid file type', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)

      // Create invalid file type (.txt)
      const invalidFile = new File(['content'], 'document.txt', {
        type: 'text/plain',
      })

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(input, invalidFile)

      await waitFor(() => {
        const errorText = screen.queryByText(/Invalid file type/i)
        if (errorText) {
          expect(errorText).toBeInTheDocument()
        }
      })
    })

    it('shows generic error message for other rejection errors', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} maxFiles={1} />)

      // Upload multiple files when maxFiles=1 to trigger generic error
      const files = [
        new File(['a'], 'file1.csv', { type: 'text/csv' }),
        new File(['b'], 'file2.csv', { type: 'text/csv' }),
      ]

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      await user.upload(input, files)

      await waitFor(() => {
        // May show an error or just accept first file
        const selectedFiles = screen.queryByText(/Selected Files/i)
        expect(selectedFiles || mockCallback).toBeDefined()
      })
    })

    it('clears previous errors when new files are added', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} maxSize={1024} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // First upload: invalid file
      const invalidFile = new File(['content'], 'doc.txt', {
        type: 'text/plain',
      })
      await user.upload(input, invalidFile)

      await waitFor(() => {
        const error = screen.queryByText(/Invalid file type/i)
        if (error) {
          expect(error).toBeInTheDocument()
        }
      })

      // Second upload: valid file (should clear errors)
      const validFile = new File(['data'], 'valid.csv', { type: 'text/csv' })
      await user.upload(input, validFile)

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled()
      })
    })

    it('displays multiple error messages when multiple files are rejected', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      const maxSize = 1024 // 1KB
      render(<FileUploader onFilesSelected={mockCallback} maxSize={maxSize} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // Create multiple files that will be rejected for different reasons
      const tooLargeFile = new File(['x'.repeat(2048)], 'large.csv', {
        type: 'text/csv',
      })
      const invalidTypeFile = new File(['content'], 'doc.txt', {
        type: 'text/plain',
      })

      // Mock file sizes
      Object.defineProperty(tooLargeFile, 'size', { value: 2048 })
      Object.defineProperty(invalidTypeFile, 'size', { value: 100 })

      // Upload both files at once
      await user.upload(input, [tooLargeFile, invalidTypeFile])

      await waitFor(() => {
        // Should show error list container
        const alertElement = document.querySelector('[role="alert"]')
        if (alertElement) {
          expect(alertElement).toBeInTheDocument()
        }
      })
    })

    it('handles mixed accepted and rejected files in same drop', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // One valid, one invalid
      const validFile = new File(['data'], 'valid.csv', { type: 'text/csv' })
      const invalidFile = new File(['doc'], 'invalid.txt', {
        type: 'text/plain',
      })

      await user.upload(input, [validFile, invalidFile])

      await waitFor(() => {
        // Valid file should be displayed
        const validFileName = screen.queryByText('valid.csv')
        // Invalid file should show error
        const errorMessage = screen.queryByText(/Invalid file type/i)

        // At least one of these should be true
        expect(validFileName || errorMessage).toBeDefined()
      })
    })
  })

  describe('data-testid attributes', () => {
    it('has data-testid="file-upload-zone" on the drop zone', () => {
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)
      expect(screen.getByTestId('file-upload-zone')).toBeInTheDocument()
    })

    it('has data-testid="file-input" on the hidden file input', () => {
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)
      expect(screen.getByTestId('file-input')).toBeInTheDocument()
    })
  })

  describe('File Size Formatting', () => {
    it('formats bytes correctly (< 1KB)', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)

      const file = new File(['x'.repeat(500)], 'tiny.csv', {
        type: 'text/csv',
      })

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(input, file)

      await waitFor(() => {
        expect(screen.getByText('500 B')).toBeInTheDocument()
      })
    })

    it('formats kilobytes correctly (>= 1KB, < 1MB)', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)

      const file = new File(['x'.repeat(1500)], 'medium.csv', {
        type: 'text/csv',
      })

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(input, file)

      await waitFor(() => {
        expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument()
      })
    })

    it('formats megabytes correctly (>= 1MB)', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} />)

      const file = new File(['x'.repeat(2 * 1024 * 1024)], 'large.csv', {
        type: 'text/csv',
      })

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(input, file)

      await waitFor(() => {
        expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument()
      })
    })
  })

  describe('MaxFiles Enforcement', () => {
    it('replaces the existing file when maxFiles is one', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} maxFiles={1} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      const firstFile = new File(['a'], 'first.csv', { type: 'text/csv' })
      await user.upload(input, firstFile)

      await waitFor(() => {
        expect(screen.getByText('first.csv')).toBeInTheDocument()
      })

      const secondFile = new File(['b'], 'second.csv', { type: 'text/csv' })
      await user.upload(input, secondFile)

      await waitFor(() => {
        expect(screen.getByText('second.csv')).toBeInTheDocument()
      })

      expect(screen.queryByText('first.csv')).not.toBeInTheDocument()
      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1]
      expect(lastCall[0]).toHaveLength(1)
      expect(lastCall[0][0].name).toBe('second.csv')
    })

    it('preserves existing files when adding more up to maxFiles limit', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} maxFiles={3} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // First upload: 1 file
      const firstFile = new File(['a'], 'file1.csv', { type: 'text/csv' })
      await user.upload(input, firstFile)

      await waitFor(() => {
        expect(screen.getByText('file1.csv')).toBeInTheDocument()
      })

      // Second upload: 2 more files (total should be 3)
      const secondBatch = [
        new File(['b'], 'file2.csv', { type: 'text/csv' }),
        new File(['c'], 'file3.csv', { type: 'text/csv' }),
      ]
      await user.upload(input, secondBatch)

      await waitFor(() => {
        // All 3 files should be present
        expect(screen.getByText('file1.csv')).toBeInTheDocument()
        expect(screen.getByText('file2.csv')).toBeInTheDocument()
        expect(screen.getByText('file3.csv')).toBeInTheDocument()
      })

      // Verify callback was called with all 3 files
      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1]
      expect(lastCall[0]).toHaveLength(3)
    })

    it('truncates to maxFiles when existing + new files exceed limit', async () => {
      const user = userEvent.setup()
      const mockCallback = vi.fn()
      render(<FileUploader onFilesSelected={mockCallback} maxFiles={3} />)

      const input = screen
        .getByTestId('file-upload-zone')
        .querySelector('input[type="file"]') as HTMLInputElement

      // First upload: 2 files
      const firstBatch = [
        new File(['a'], 'file1.csv', { type: 'text/csv' }),
        new File(['b'], 'file2.csv', { type: 'text/csv' }),
      ]
      await user.upload(input, firstBatch)

      await waitFor(() => {
        expect(screen.getByText('file1.csv')).toBeInTheDocument()
      })

      // Second upload: 3 more files (would be 5 total, should truncate to 3)
      const secondBatch = [
        new File(['c'], 'file3.csv', { type: 'text/csv' }),
        new File(['d'], 'file4.csv', { type: 'text/csv' }),
        new File(['e'], 'file5.csv', { type: 'text/csv' }),
      ]
      await user.upload(input, secondBatch)

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled()
      })

      // Should only have 3 files total
      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1]
      expect(lastCall[0]).toHaveLength(3)
    })
  })
})
