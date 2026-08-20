/**
 * Lease Document Upload Component
 *
 * Handles uploading, viewing, and deleting lease PDF documents:
 * - Drag-and-drop or click to browse
 * - PDF only validation (25MB max)
 * - Upload progress tracking
 * - Current document display with view/delete
 * - Supabase Storage integration
 */
import { useState, useCallback, useEffect } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import {
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  LEASE_DOCUMENT_BUCKET,
  createLeaseDocumentSignedUrl,
  getLeaseDocumentPath,
} from '@/lib/lease-documents'
import { useUpdateLease } from '@/api/hooks'
import type { ApiError } from '@/api/client'
import { getErrorMessage } from '@/api/errors'

interface LeaseDocumentUploadProps {
  leaseId: string
  currentDocumentUrl?: string | null
  onUploadComplete?: (url: string) => void
  onDeleteComplete?: () => void
}

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
}

export function LeaseDocumentUpload({
  leaseId,
  currentDocumentUrl,
  onUploadComplete,
  onDeleteComplete,
}: LeaseDocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [signedDocumentUrl, setSignedDocumentUrl] = useState<string | null>(
    null
  )

  const updateLeaseMutation = useUpdateLease(leaseId, {
    onSuccess: () => {
      toast.success('Document uploaded successfully')
      if (onUploadComplete) {
        // onUploadComplete will be called with the URL after mutation succeeds
      }
    },
    onError: (err: ApiError) => {
      toast.error('Failed to update lease', {
        description: getErrorMessage(err),
      })
      setError(err.message)
      setIsUploading(false)
    },
  })

  const uploadToSupabase = useCallback(
    async (file: File): Promise<string> => {
      // Generate unique filename with timestamp
      const timestamp = Date.now()
      const filename = `${leaseId}/${timestamp}-${file.name}`

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(LEASE_DOCUMENT_BUCKET)
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        throw new Error(`Upload failed: ${error.message}`)
      }

      if (!data) {
        throw new Error('Upload failed: No data returned')
      }

      return data.path
    },
    [leaseId]
  )

  const deleteFromSupabase = async (url: string) => {
    const path = getLeaseDocumentPath(url)
    if (!path) throw new Error('Invalid document path')

    const { error } = await supabase.storage
      .from(LEASE_DOCUMENT_BUCKET)
      .remove([path])

    if (error) {
      throw new Error(`Delete failed: ${error.message}`)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function refreshSignedUrl() {
      if (!currentDocumentUrl) {
        setSignedDocumentUrl(null)
        return
      }

      try {
        const signedUrl = await createLeaseDocumentSignedUrl(currentDocumentUrl)
        if (!cancelled) {
          setSignedDocumentUrl(signedUrl)
        }
      } catch {
        if (!cancelled) {
          setSignedDocumentUrl(null)
        }
      }
    }

    void refreshSignedUrl()

    return () => {
      cancelled = true
    }
  }, [currentDocumentUrl])

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null)

      // Handle rejections
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        if (rejection?.errors) {
          const error = rejection.errors[0]
          if (error?.code === 'file-too-large') {
            setError('File exceeds 25MB limit')
          } else if (error?.code === 'file-invalid-type') {
            setError('Only PDF files are accepted')
          } else if (error?.message) {
            setError(error.message)
          }
        }
        return
      }

      if (acceptedFiles.length === 0) {
        return
      }

      const file = acceptedFiles[0]
      if (!file) {
        return
      }

      try {
        setIsUploading(true)
        setUploadProgress(0)

        // Simulate progress (Supabase doesn't provide upload progress)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90))
        }, 200)

        // Upload to Supabase
        const documentUrl = await uploadToSupabase(file)

        clearInterval(progressInterval)
        setUploadProgress(100)

        // Update lease with document URL
        await updateLeaseMutation.mutateAsync({
          document_url: documentUrl,
        })

        if (onUploadComplete) {
          onUploadComplete(documentUrl)
        }

        setIsUploading(false)
        setUploadProgress(0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        setIsUploading(false)
        setUploadProgress(0)
        toast.error('Failed to upload document')
      }
    },
    [updateLeaseMutation, onUploadComplete, uploadToSupabase]
  )

  const handleDelete = async () => {
    if (!currentDocumentUrl) return

    try {
      // Delete from Supabase Storage
      await deleteFromSupabase(currentDocumentUrl)

      // Update lease to remove document URL
      await updateLeaseMutation.mutateAsync({
        document_url: null,
      })

      toast.success('Document deleted successfully')

      if (onDeleteComplete) {
        onDeleteComplete()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setError(message)
      toast.error('Failed to delete the document', {
        description: getErrorMessage(err),
      })
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
    multiple: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Lease Document</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                data-testid="error-dismiss"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Current Document Display */}
        {currentDocumentUrl && !isUploading && (
          <div className="flex items-center justify-between rounded-lg border p-4 shadow-sm transition-all duration-fast hover:shadow-elevation-1">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Lease Document (PDF)</p>
                <p className="text-sm text-muted-foreground">
                  Uploaded and ready to view
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (signedDocumentUrl)
                    window.open(
                      signedDocumentUrl,
                      '_blank',
                      'noopener,noreferrer'
                    )
                }}
                disabled={!signedDocumentUrl}
                data-testid="view-document-button"
              >
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                data-testid="delete-document-button"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} data-testid="upload-progress" />
          </div>
        )}

        {/* Drop Zone: always mounted (disabled only while a file uploads) so a
            file-type error stays beside a live drop zone (the user can retry
            without reloading) and an existing document can be replaced. */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
            isDragActive && 'border-primary bg-primary/5',
            isUploading && 'opacity-50 cursor-not-allowed',
            !isDragActive &&
              !isUploading &&
              'hover:border-primary/50 hover:bg-muted/50'
          )}
          data-testid="dropzone"
        >
          <input
            {...getInputProps({ 'aria-label': 'Upload lease document' })}
            data-testid="file-input"
          />
          <div className="flex flex-col items-center gap-2">
            {isUploading ? (
              <Loader2 className="h-12 w-12 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="h-12 w-12 text-muted-foreground" />
            )}
            <div className="text-sm">
              {isDragActive ? (
                <p className="text-primary font-medium">Drop PDF file here</p>
              ) : (
                <>
                  <p className="font-medium">
                    {currentDocumentUrl
                      ? 'Replace document'
                      : 'Upload lease document'}
                  </p>
                  <p className="text-muted-foreground">
                    Drag and drop or click to browse
                  </p>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PDF only, max 25MB</p>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lease document? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteDialogOpen(false)
                handleDelete()
              }}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
