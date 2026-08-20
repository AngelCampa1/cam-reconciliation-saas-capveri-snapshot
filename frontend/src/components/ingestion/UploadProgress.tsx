import { useMemo } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/format-bytes'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  FileSpreadsheet,
  Clock,
} from 'lucide-react'

export type UploadStatus = 'uploading' | 'processing' | 'complete' | 'failed'

export interface UploadItem {
  id: string
  fileName: string
  fileSize: number
  progress: number // 0-100
  status: UploadStatus
  error?: string
  startTime?: number // timestamp
}

interface UploadProgressProps {
  uploads: UploadItem[]
  onCancel?: (id: string) => void
}

export function UploadProgress({ uploads, onCancel }: UploadProgressProps) {
  if (uploads.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {uploads.map((upload) => (
        <UploadProgressItem
          key={upload.id}
          upload={upload}
          {...(onCancel && { onCancel })}
        />
      ))}
    </div>
  )
}

interface UploadProgressItemProps {
  upload: UploadItem
  onCancel?: (id: string) => void
}

function UploadProgressItem({ upload, onCancel }: UploadProgressItemProps) {
  const { fileName, fileSize, progress, status, error, startTime } = upload

  const statusConfig = useMemo(() => {
    const configs: Record<
      UploadStatus,
      {
        icon: React.ReactNode
        text: string
        variant: 'default' | 'success' | 'destructive' | 'info'
        showCancel: boolean
      }
    > = {
      uploading: {
        icon: (
          <Loader2
            className="h-4 w-4 animate-spin text-primary"
            aria-hidden="true"
          />
        ),
        text: 'Uploading...',
        variant: 'info',
        showCancel: true,
      },
      processing: {
        icon: (
          <Loader2
            className="h-4 w-4 animate-spin text-primary"
            aria-hidden="true"
          />
        ),
        text: 'Processing...',
        variant: 'info',
        showCancel: false,
      },
      complete: {
        icon: (
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
        ),
        text: 'Complete',
        variant: 'success',
        showCancel: false,
      },
      failed: {
        icon: (
          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        ),
        text: 'Failed',
        variant: 'destructive',
        showCancel: false,
      },
    }
    return configs[status]
  }, [status])

  const timeRemaining = useMemo(() => {
    if (
      status !== 'uploading' ||
      progress === 0 ||
      progress === 100 ||
      !startTime
    ) {
      return null
    }

    // eslint-disable-next-line react-hooks/purity
    const elapsed = Date.now() - startTime
    const rate = progress / elapsed // percent per ms
    const remaining = (100 - progress) / rate // ms remaining

    if (remaining < 1000) {
      return 'Less than a second'
    } else if (remaining < 60000) {
      const seconds = Math.ceil(remaining / 1000)
      return `${seconds} second${seconds > 1 ? 's' : ''}`
    } else {
      const minutes = Math.ceil(remaining / 60000)
      return `${minutes} minute${minutes > 1 ? 's' : ''}`
    }
  }, [status, progress, startTime])

  const formattedSize = formatFileSize(fileSize)

  const handleCancel = () => {
    if (onCancel && statusConfig.showCancel) {
      onCancel(upload.id)
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      {/* Header with file info and status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <FileSpreadsheet
            className="h-5 w-5 text-primary flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" title={fileName}>
              {fileName}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {formattedSize}
              </span>
              {status === 'complete' && (
                <span className="text-xs text-success-strong">
                  • Uploaded successfully
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status indicator and cancel button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusConfig.icon}
          {statusConfig.showCancel && onCancel && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              aria-label={`Cancel upload for ${fileName}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={progress} variant={statusConfig.variant} />

        {/* Status text and details */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(status === 'failed' && 'text-destructive-strong')}
            >
              {statusConfig.text}
            </span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>

          {/* Time remaining for uploads */}
          {timeRemaining && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>{timeRemaining} remaining</span>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && status === 'failed' && (
          <p className="text-xs text-destructive-strong mt-1">{error}</p>
        )}
      </div>
    </div>
  )
}
