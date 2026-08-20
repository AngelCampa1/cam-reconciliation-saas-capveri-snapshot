import { describe, it, expect, vi, beforeEach } from 'vitest'

import { uploadGlFile } from './uploadGlFile'

vi.mock('@/api/generated', () => ({
  uploadFileApiV1IngestionUploadPost: vi.fn(),
}))

describe('uploadGlFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns normalized upload metadata on success', async () => {
    const generated = await import('@/api/generated')
    vi.mocked(generated.uploadFileApiV1IngestionUploadPost).mockResolvedValue({
      data: {
        batch_id: 'batch-1',
        source_system: 'yardi',
        row_count: 123,
      },
    } as never)

    const result = await uploadGlFile(new File(['x'], 'gl.csv'), 'prop-1')
    expect(result).toEqual({
      batchId: 'batch-1',
      sourceSystem: 'yardi',
      rowCount: 123,
    })
  })

  it('throws string detail when API returns string error', async () => {
    const generated = await import('@/api/generated')
    vi.mocked(generated.uploadFileApiV1IngestionUploadPost).mockResolvedValue({
      error: { detail: 'bad upload' },
      data: null,
    } as never)

    await expect(
      uploadGlFile(new File(['x'], 'gl.csv'), 'prop-1')
    ).rejects.toThrow('bad upload')
  })

  it('throws first array detail message when error detail is list', async () => {
    const generated = await import('@/api/generated')
    vi.mocked(generated.uploadFileApiV1IngestionUploadPost).mockResolvedValue({
      error: { detail: [{ msg: 'row mismatch' }] },
      data: null,
    } as never)

    await expect(
      uploadGlFile(new File(['x'], 'gl.csv'), 'prop-1')
    ).rejects.toThrow('row mismatch')
  })

  it('throws fallback message when detail is unavailable', async () => {
    const generated = await import('@/api/generated')
    vi.mocked(generated.uploadFileApiV1IngestionUploadPost).mockResolvedValue({
      error: {},
      data: null,
    } as never)

    await expect(
      uploadGlFile(new File(['x'], 'gl.csv'), 'prop-1')
    ).rejects.toThrow('Failed to upload file')
  })
})
