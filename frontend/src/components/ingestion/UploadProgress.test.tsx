import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadProgress, UploadItem } from './UploadProgress'

describe('UploadProgress', () => {
  it('renders nothing when uploads array is empty', () => {
    const { container } = render(<UploadProgress uploads={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders upload item with file name and size', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024 * 1024 * 2.5, // 2.5 MB
        progress: 50,
        status: 'uploading',
        startTime: Date.now(),
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('test.csv')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()
  })

  it('displays uploading status with spinning icon', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 30,
        status: 'uploading',
        startTime: Date.now(),
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('Uploading...')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('displays processing status', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 100,
        status: 'processing',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('Processing...')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('displays complete status with success message', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('• Uploaded successfully')).toBeInTheDocument()
  })

  it('displays failed status with error message', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 45,
        status: 'failed',
        error: 'Network error occurred',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Network error occurred')).toBeInTheDocument()
  })

  it('shows cancel button during upload', () => {
    const mockCancel = vi.fn()
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 50,
        status: 'uploading',
        startTime: Date.now(),
      },
    ]

    render(<UploadProgress uploads={uploads} onCancel={mockCancel} />)

    const cancelButton = screen.getByLabelText('Cancel upload for test.csv')
    expect(cancelButton).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const mockCancel = vi.fn()
    const uploads: UploadItem[] = [
      {
        id: 'upload-1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 50,
        status: 'uploading',
        startTime: Date.now(),
      },
    ]

    render(<UploadProgress uploads={uploads} onCancel={mockCancel} />)

    const cancelButton = screen.getByLabelText('Cancel upload for test.csv')
    await user.click(cancelButton)

    expect(mockCancel).toHaveBeenCalledWith('upload-1')
  })

  it('does not show cancel button for completed uploads', () => {
    const mockCancel = vi.fn()
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} onCancel={mockCancel} />)

    expect(screen.queryByLabelText('Cancel upload')).not.toBeInTheDocument()
  })

  it('does not show cancel button for processing uploads', () => {
    const mockCancel = vi.fn()
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 100,
        status: 'processing',
      },
    ]

    render(<UploadProgress uploads={uploads} onCancel={mockCancel} />)

    expect(screen.queryByLabelText('Cancel upload')).not.toBeInTheDocument()
  })

  it('displays time remaining for uploads in progress', () => {
    // Start time 30 seconds ago, 50% complete = 30 seconds remaining
    const startTime = Date.now() - 30000
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024 * 1024 * 10,
        progress: 50,
        status: 'uploading',
        startTime,
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText(/remaining/)).toBeInTheDocument()
  })

  it('does not show time remaining for completed uploads', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 100,
        status: 'complete',
        startTime: Date.now() - 30000,
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  })

  it('displays multiple upload items simultaneously', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'file1.csv',
        fileSize: 1024,
        progress: 30,
        status: 'uploading',
        startTime: Date.now(),
      },
      {
        id: '2',
        fileName: 'file2.xlsx',
        fileSize: 2048,
        progress: 60,
        status: 'uploading',
        startTime: Date.now(),
      },
      {
        id: '3',
        fileName: 'file3.csv',
        fileSize: 512,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('file1.csv')).toBeInTheDocument()
    expect(screen.getByText('file2.xlsx')).toBeInTheDocument()
    expect(screen.getByText('file3.csv')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('formats file sizes correctly in bytes', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'tiny.csv',
        fileSize: 500,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('500 B')).toBeInTheDocument()
  })

  it('formats file sizes correctly in KB', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'small.csv',
        fileSize: 1024 * 15.5,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('15.5 KB')).toBeInTheDocument()
  })

  it('formats file sizes correctly in MB', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'large.csv',
        fileSize: 1024 * 1024 * 3.75,
        progress: 100,
        status: 'complete',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('3.8 MB')).toBeInTheDocument()
  })

  it('shows less than a second for very fast uploads', () => {
    // 99% complete, started 100ms ago
    const startTime = Date.now() - 100
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'fast.csv',
        fileSize: 1024,
        progress: 99,
        status: 'uploading',
        startTime,
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText('Less than a second remaining')).toBeInTheDocument()
  })

  it('shows time in seconds for short uploads', () => {
    // 50% complete, started 5 seconds ago = ~5 seconds remaining
    const startTime = Date.now() - 5000
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'medium.csv',
        fileSize: 1024 * 100,
        progress: 50,
        status: 'uploading',
        startTime,
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText(/\d+ seconds? remaining/)).toBeInTheDocument()
  })

  it('shows time in minutes for long uploads', () => {
    // 25% complete, started 2 minutes ago = ~6 minutes remaining
    const startTime = Date.now() - 120000
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'huge.csv',
        fileSize: 1024 * 1024 * 50,
        progress: 25,
        status: 'uploading',
        startTime,
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.getByText(/\d+ minutes? remaining/)).toBeInTheDocument()
  })

  it('does not show time remaining when progress is 0', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 0,
        status: 'uploading',
        startTime: Date.now(),
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  })

  it('does not show time remaining when startTime is missing', () => {
    const uploads: UploadItem[] = [
      {
        id: '1',
        fileName: 'test.csv',
        fileSize: 1024,
        progress: 50,
        status: 'uploading',
      },
    ]

    render(<UploadProgress uploads={uploads} />)

    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  })
})
