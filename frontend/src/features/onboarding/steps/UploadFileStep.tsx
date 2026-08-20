/**
 * Upload File Step Component
 *
 * Fourth step of onboarding - upload a GL file.
 * Uses real ingestion API to parse and store GL data.
 */
import { useState, useCallback, useEffect } from 'react'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useOnboarding } from '../OnboardingContext'
import { cn } from '@/lib/utils'
import { getSourceLabel } from '@/lib/source-system'
import { ExportGuide } from '@/components/onboarding/ExportGuide'
import { SecurityTrustPanel } from '../components/SecurityTrustPanel'
import { BeginnerFileGuide, GuideCallout } from '@/features/help/components'
import { logger } from '@/lib/logger'
import { pluralizeWithCount } from '@/lib/pluralize'
import { trackEvent } from '@/lib/analytics'
import { apiClient, getSession } from '@/api/client'
import { uploadFileApiV1IngestionUploadPost } from '@/api/generated'
import { resolveApiUrl } from '@/api/url'

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export function UploadFileStep() {
  const { nextStep, setStepData, state } = useOnboarding()
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isUploaded, setIsUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    sourceSystem: string
    rowCount: number
  } | null>(null)

  useEffect(() => {
    trackEvent('onboard_step_viewed', {
      step: 3,
      step_label: 'Expense Report',
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && ACCEPTED_TYPES.includes(droppedFile.type)) {
      setFile(droppedFile)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    const propertyId = state.data.propertyId
    if (!propertyId) {
      setError(
        'No property selected. Please go back and create a property first.'
      )
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const response = await uploadFileApiV1IngestionUploadPost({
        client: apiClient,
        body: {
          file,
          property_id: propertyId,
        },
      })

      if (response.error) {
        const errorDetail =
          response.error.detail ||
          (Array.isArray(response.error) ? response.error[0]?.msg : null) ||
          'Failed to upload file'
        setError(String(errorDetail))
        return
      }

      if (response.data) {
        setStepData('importBatchId', response.data.batch_id)
        setUploadResult({
          sourceSystem: response.data.source_system,
          rowCount: response.data.row_count,
        })
        setIsUploaded(true)

        trackEvent('onboard_step_completed', {
          step: 3,
          step_label: 'Expense Report',
          source_system: response.data.source_system,
          row_count: response.data.row_count,
        })
        trackEvent('gl_upload_completed', {
          property_id: propertyId,
          batch_id: response.data.batch_id,
          source_system: response.data.source_system,
          row_count: response.data.row_count,
          source: 'onboarding',
        })

        logger.info('GL file uploaded during onboarding', {
          batchId: response.data.batch_id,
          sourceSystem: response.data.source_system,
          rowCount: response.data.row_count,
        })

        // Detect GL data year from uploaded data, fallback to previous year.
        setStepData('glDataYear', new Date().getFullYear() - 1)
        try {
          const dateRangeSession = await getSession()
          const dateRangeResponse = await fetch(
            resolveApiUrl(`/api/v1/ingestion/gl-date-range/${propertyId}`),
            {
              headers: dateRangeSession?.access_token
                ? { Authorization: `Bearer ${dateRangeSession.access_token}` }
                : {},
            }
          )
          if (dateRangeResponse.ok) {
            const dateRangeData = await dateRangeResponse.json()
            setStepData('glDataYear', dateRangeData.year)
          }
        } catch {
          // Fallback to previous year
        }
      }
    } catch (err) {
      logger.error('File upload failed during onboarding', {
        fileName: file.name,
        fileSize: file.size,
        error: err,
      })
      setError('Failed to upload file. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSkip = () => {
    trackEvent('onboard_step_completed', {
      step: 3,
      step_label: 'Expense Report',
      method: 'skipped',
    })
    nextStep()
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Add your expense report
        </h2>
        <p className="text-muted-foreground">
          This is the list of what you spent last year. Your accountant may call
          it a GL export. We take CSV and Excel files.
        </p>
      </div>

      <SecurityTrustPanel />

      {/* Export guide */}
      {!isUploaded && <ExportGuide type="gl" />}
      {!isUploaded && (
        <div className="mb-4 space-y-3">
          <BeginnerFileGuide type="spreadsheet" />
          <GuideCallout title="What file do I need?">
            <p>
              Save your expense report from your accounting program. It should
              have dates, account names, and dollar amounts. A CSV or Excel file
              works best. After you pick it, we read it and show you what we
              found.
            </p>
          </GuideCallout>
        </div>
      )}

      {/* Upload area */}
      {isUploaded && uploadResult ? (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-success/20 bg-success/10 p-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" />
            <h3 className="mb-2 text-lg font-medium text-success">
              Your file is in
            </h3>
            <p className="text-sm text-success-strong mb-2">
              From:{' '}
              <span className="font-semibold">
                {getSourceLabel(uploadResult.sourceSystem)}
              </span>
            </p>
            <p className="text-sm text-success-strong">
              We read {pluralizeWithCount(uploadResult.rowCount, 'line')}.
            </p>
          </div>
          <Button onClick={() => nextStep()} className="w-full min-h-[44px]">
            Next
          </Button>
        </div>
      ) : file ? (
        <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 p-8">
          <div className="text-center">
            <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h3 className="mb-1 font-medium">{file.name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
            <div className="flex justify-center gap-3">
              <Button
                className="min-h-[44px]"
                variant="outline"
                onClick={() => setFile(null)}
                disabled={isUploading}
              >
                Pick a different file
              </Button>
              <Button
                className="min-h-[44px]"
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding your file…
                  </>
                ) : (
                  'Use this file'
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-200',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-upload"
            className="sr-only"
            accept=".csv,.xls,.xlsx"
            onChange={handleFileChange}
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-medium">
              Drop your file here, or click to pick one
            </h3>
            <p className="text-sm text-muted-foreground">
              CSV and Excel files up to 50MB
            </p>
          </label>
        </div>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* No property warning */}
      {!state.data.propertyId && !isUploaded && (
        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have not added a building yet. Go back and add your building
            first.
          </AlertDescription>
        </Alert>
      )}

      {/* Skip button */}
      {!isUploaded && (
        <div className="mt-6 text-center">
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      )}
    </div>
  )
}
