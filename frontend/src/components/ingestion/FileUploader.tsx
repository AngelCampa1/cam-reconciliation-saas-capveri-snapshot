import { useState, useCallback } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { formatFileSize } from '@/lib/format-bytes'
import { Upload, FileSpreadsheet, FileText, X, AlertCircle } from 'lucide-react'

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void
  isDisabled?: boolean
  maxFiles?: number
  maxSize?: number // in bytes
  accept?: Record<string, string[]> // Custom accepted MIME types
}

const ACCEPTED_TYPES = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function FileUploader({
  onFilesSelected,
  isDisabled = false,
  maxFiles = 5,
  maxSize = MAX_FILE_SIZE,
  accept,
}: FileUploaderProps) {
  // Use custom accept types or default to CSV/Excel
  const acceptedTypes = accept ?? ACCEPTED_TYPES
  const isPdfMode = accept && 'application/pdf' in accept
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setErrors([])

      // Handle rejections
      const newErrors: string[] = []
      rejectedFiles.forEach((rejection) => {
        rejection.errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            newErrors.push(
              `${rejection.file.name}: File exceeds ${maxSize / 1024 / 1024}MB limit`
            )
          } else if (error.code === 'file-invalid-type') {
            newErrors.push(
              `${rejection.file.name}: Invalid file type. ${isPdfMode ? 'Use PDF files only' : 'Use CSV, XLS, or XLSX'}`
            )
          } else {
            newErrors.push(`${rejection.file.name}: ${error.message}`)
          }
        })
      })

      if (newErrors.length > 0) {
        // Surface the rejection (the dropzone turns red via `errors.length > 0`)
        // but keep any previously-selected valid files — discarding a 10-file
        // batch because the 11th was the wrong type would be hostile. Rejected
        // files never enter `files`, so the submit button still reflects only
        // valid selections.
        setErrors(newErrors)
      }

      // Add any accepted files from this drop (preserving prior valid files).
      if (acceptedFiles.length > 0) {
        const newFiles =
          maxFiles === 1
            ? acceptedFiles.slice(0, 1)
            : [...files, ...acceptedFiles].slice(0, maxFiles)
        setFiles(newFiles)
        onFilesSelected(newFiles)
      }
    },
    [files, maxFiles, maxSize, onFilesSelected, isPdfMode]
  )

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
    onFilesSelected(newFiles)
    // Clear any stale rejection errors (and the red border) once the user
    // edits their selection.
    setErrors([])
  }

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: acceptedTypes,
      maxFiles,
      maxSize,
      disabled: isDisabled,
      multiple: maxFiles > 1,
    })

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps({ role: 'button' })}
        data-testid="file-upload-zone"
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragActive && !isDragReject && 'border-primary bg-primary/5',
          (isDragReject || errors.length > 0) &&
            'border-destructive bg-destructive/5',
          isDisabled && 'opacity-50 cursor-not-allowed',
          !isDragActive && 'hover:border-primary/50 hover:bg-muted/50'
        )}
        aria-label="File upload area, drag and drop files or click to browse"
        aria-describedby="file-upload-instructions"
        aria-disabled={isDisabled}
      >
        <input {...getInputProps()} data-testid="file-input" />
        <Upload
          className={cn(
            'mx-auto h-12 w-12 mb-4',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )}
          aria-hidden="true"
        />
        <p className="font-medium mb-1">
          {isDragActive
            ? isDragReject
              ? 'Invalid file type'
              : 'Drop files here'
            : 'Drag and drop files here'}
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          or click here to choose a file from your computer
        </p>
        <p
          id="file-upload-instructions"
          className="text-xs text-muted-foreground"
        >
          {isPdfMode
            ? 'Use a file ending in .pdf'
            : 'Use a spreadsheet ending in .csv, .xls, or .xlsx'}{' '}
          • Max {maxSize / 1024 / 1024}MB per file
        </p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Selected files */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Selected Files</p>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 shadow-sm transition-all duration-fast hover:shadow-sm"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {isPdfMode ? (
                  <FileText
                    className="h-8 w-8 text-primary shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <FileSpreadsheet
                    className="h-8 w-8 text-primary shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                disabled={isDisabled}
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
