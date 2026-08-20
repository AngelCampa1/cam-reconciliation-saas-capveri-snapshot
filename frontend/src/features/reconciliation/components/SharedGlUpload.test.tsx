import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SharedGlUpload } from './SharedGlUpload'
import { uploadGlFile } from '@/features/reconciliation/utils/uploadGlFile'

vi.mock('@/features/reconciliation/utils/uploadGlFile', () => ({
  uploadGlFile: vi.fn(),
}))

describe('SharedGlUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads selected file and calls onUploaded', async () => {
    const user = userEvent.setup()
    const onUploaded = vi.fn()
    vi.mocked(uploadGlFile).mockResolvedValue({
      batchId: 'batch-1',
      sourceSystem: 'generic',
      rowCount: 10,
    })

    render(<SharedGlUpload propertyId="prop-1" onUploaded={onUploaded} />)

    const file = new File(['a,b\n1,2'], 'gl.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/upload gl data/i)
    await user.upload(input, file)
    await user.click(screen.getByRole('button', { name: /upload gl/i }))

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith('batch-1')
    })
  })

  it('shows error when upload fails', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadGlFile).mockRejectedValue(new Error('Upload failed'))

    render(<SharedGlUpload propertyId="prop-1" onUploaded={vi.fn()} />)

    const file = new File(['a,b\n1,2'], 'gl.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/upload gl data/i)
    await user.upload(input, file)
    await user.click(screen.getByRole('button', { name: /upload gl/i }))

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
    })
    // The upload-error message uses the AA-contrast "strong" red, not the
    // bright text-destructive that fails WCAG AA on white at body size
    // (matches the F-287/F-381/F-382/F-383/F-384 contrast standard).
    expect(screen.getByText(/upload failed/i)).toHaveClass(
      'text-destructive-strong'
    )
  })

  it('keeps upload disabled when no valid file is selected', async () => {
    const user = userEvent.setup()

    render(<SharedGlUpload propertyId="prop-1" onUploaded={vi.fn()} />)

    const uploadButton = screen.getByRole('button', { name: /upload gl/i })
    expect(uploadButton).toBeDisabled()

    const invalidFile = new File(['content'], 'gl.txt', { type: 'text/plain' })
    const input = screen.getByLabelText(/upload gl data/i)
    await user.upload(input, invalidFile)
    fireEvent.change(input, { target: { files: [] } })
    fireEvent.change(input, { target: {} })

    expect(screen.queryByText('gl.txt')).not.toBeInTheDocument()
    expect(uploadButton).toBeDisabled()
  })

  it('falls back to default error message for non-Error rejection', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadGlFile).mockRejectedValue('unexpected')

    render(<SharedGlUpload propertyId="prop-1" onUploaded={vi.fn()} />)

    const file = new File(['a,b\n1,2'], 'gl.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/upload gl data/i)
    await user.upload(input, file)
    await user.click(screen.getByRole('button', { name: /upload gl/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to upload GL')).toBeInTheDocument()
    })
  })
})
