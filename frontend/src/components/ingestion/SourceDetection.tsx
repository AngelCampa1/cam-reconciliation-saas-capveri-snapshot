import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  SOURCE_LABELS,
  SOURCE_DESCRIPTIONS,
  type SourceSystem,
} from '@/lib/source-system'
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronRight,
} from 'lucide-react'

export type { SourceSystem }
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface DetectionResult {
  detectedSource: SourceSystem
  confidence: ConfidenceLevel
  hints: string[]
}

interface SourceDetectionProps {
  detection: DetectionResult
  fileName: string
  onConfirm: (selectedSource: SourceSystem) => void
  onCancel?: () => void
}

export function SourceDetection({
  detection,
  fileName,
  onConfirm,
  onCancel,
}: SourceDetectionProps) {
  const [selectedSource, setSelectedSource] = useState<SourceSystem>(
    detection.detectedSource
  )
  const [isManualOverride, setIsManualOverride] = useState(false)

  const handleSourceChange = (value: SourceSystem) => {
    setSelectedSource(value)
    setIsManualOverride(value !== detection.detectedSource)
  }

  const handleConfirm = () => {
    onConfirm(selectedSource)
  }

  const confidenceConfig = {
    high: {
      badge: 'High Confidence',
      badgeClass: 'bg-success/10 text-success',
      icon: (
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
      ),
      alertVariant: undefined,
      alertIcon: null,
      alertMessage: null,
    },
    medium: {
      badge: 'Medium Confidence',
      badgeClass: 'bg-warning/10 text-warning-foreground',
      icon: <Info className="h-4 w-4 text-warning" aria-hidden="true" />,
      alertVariant: 'default' as const,
      alertIcon: <Info className="h-4 w-4" aria-hidden="true" />,
      alertMessage:
        'Check that the detected source system is correct before you continue.',
    },
    low: {
      badge: 'Low Confidence',
      badgeClass: 'bg-destructive/10 text-destructive',
      icon: (
        <AlertTriangle
          className="h-4 w-4 text-destructive"
          aria-hidden="true"
        />
      ),
      alertVariant: 'destructive' as const,
      alertIcon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
      alertMessage:
        'CapVeri could not identify the source format. Select the correct source system below.',
    },
  }

  const config = confidenceConfig[detection.confidence]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <FileSpreadsheet
          className="h-6 w-6 text-primary flex-shrink-0 mt-1"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg">Source System Detection</h3>
          <p
            className="text-sm text-muted-foreground truncate"
            title={fileName}
          >
            {fileName}
          </p>
        </div>
      </div>

      {/* Detection Result */}
      <div className="border rounded-lg p-4 bg-card shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {config.icon}
            <div>
              <p className="font-medium">
                {SOURCE_LABELS[detection.detectedSource]}
              </p>
              <p className="text-xs text-muted-foreground">
                {SOURCE_DESCRIPTIONS[detection.detectedSource]}
              </p>
            </div>
          </div>
          <span
            className={cn(
              'px-2 py-1 text-xs font-medium rounded-full',
              config.badgeClass
            )}
          >
            {config.badge}
          </span>
        </div>

        {/* Detection Hints */}
        {detection.hints.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Detection Reasoning:
            </p>
            <ul className="space-y-1">
              {detection.hints.map((hint, index) => (
                <li
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <ChevronRight
                    className="h-3 w-3 mt-0.5 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Confidence Alert */}
      {config.alertMessage && (
        <Alert variant={config.alertVariant}>
          {config.alertIcon}
          <AlertDescription>{config.alertMessage}</AlertDescription>
        </Alert>
      )}

      {/* Manual Override */}
      <div className="space-y-2">
        <label
          htmlFor="source-select"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {isManualOverride
            ? 'Selected Source System'
            : 'Confirm or Change Source System'}
        </label>
        <Select value={selectedSource} onValueChange={handleSourceChange}>
          <SelectTrigger id="source-select">
            <SelectValue placeholder="Select source system" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yardi">
              <div>
                <p className="font-medium">{SOURCE_LABELS.yardi}</p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_DESCRIPTIONS.yardi}
                </p>
              </div>
            </SelectItem>
            <SelectItem value="mri">
              <div>
                <p className="font-medium">{SOURCE_LABELS.mri}</p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_DESCRIPTIONS.mri}
                </p>
              </div>
            </SelectItem>
            <SelectItem value="generic">
              <div>
                <p className="font-medium">{SOURCE_LABELS.generic}</p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_DESCRIPTIONS.generic}
                </p>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        {isManualOverride && (
          <p className="text-xs text-muted-foreground">
            You have manually overridden the detected source system.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleConfirm} className="flex-1">
          Continue with {SOURCE_LABELS[selectedSource]}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
