import { apiClient } from '@/api/client'
import { uploadFileApiV1IngestionUploadPost } from '@/api/generated'

export interface UploadGlFileResult {
  batchId: string
  sourceSystem: string
  rowCount: number
}

export async function uploadGlFile(
  file: File,
  propertyId: string
): Promise<UploadGlFileResult> {
  const response = await uploadFileApiV1IngestionUploadPost({
    client: apiClient,
    body: {
      file,
      property_id: propertyId,
    },
  })

  if (response.error || !response.data) {
    const rawDetail = (response.error as unknown as { detail?: unknown })
      ?.detail
    const detail =
      typeof rawDetail === 'string'
        ? rawDetail
        : Array.isArray(rawDetail)
          ? rawDetail[0]?.msg
          : undefined
    throw new Error(detail ?? 'Failed to upload file')
  }

  return {
    batchId: response.data.batch_id,
    sourceSystem: response.data.source_system,
    rowCount: response.data.row_count,
  }
}
