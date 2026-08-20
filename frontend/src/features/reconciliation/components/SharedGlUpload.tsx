import { useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { uploadGlFile } from '@/features/reconciliation/utils/uploadGlFile'
import { trackEvent } from '@/lib/analytics'

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

interface SharedGlUploadProps {
  propertyId: string
  onUploaded: (batchId: string) => void
}

export function SharedGlUpload({
  propertyId,
  onUploaded,
}: SharedGlUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleUpload = async () => {
    setIsUploading(true)
    setError(null)
    try {
      const result = await uploadGlFile(file as File, propertyId)
      trackEvent('gl_upload_completed', {
        property_id: propertyId,
        batch_id: result.batchId,
        source: 'reconciliation_kickoff',
      })
      onUploaded(result.batchId)
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload GL'
      )
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="shared-gl-upload">
        Upload GL data
      </label>
      <input
        id="shared-gl-upload"
        type="file"
        accept=".csv,.xls,.xlsx"
        onChange={(event) => {
          const nextFile = event.target.files?.[0] ?? null
          if (!nextFile) {
            setFile(null)
            return
          }
          const acceptedByMime = ACCEPTED_TYPES.includes(nextFile.type)
          const acceptedByExt = /\.(csv|xls|xlsx)$/i.test(nextFile.name)
          if (acceptedByMime || acceptedByExt) {
            setFile(nextFile)
            setError(null)
          } else {
            setFile(null)
            setError(
              'Unsupported file type. Please upload a CSV or Excel file.'
            )
          }
        }}
      />
      {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
      <Button
        type="button"
        onClick={handleUpload}
        disabled={!file || isUploading}
        className="gap-2"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload GL
          </>
        )}
      </Button>
      {error && <p className="text-sm text-destructive-strong">{error}</p>}
    </div>
  )
}
