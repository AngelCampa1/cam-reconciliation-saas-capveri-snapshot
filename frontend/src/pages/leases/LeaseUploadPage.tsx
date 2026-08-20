/**
 * Lease Upload Page
 *
 * Page for uploading lease PDF documents for AI extraction.
 * Features:
 * - Property selection (required)
 * - Optional lease association
 * - Multiple PDF upload (batch)
 * - Upload progress tracking
 * - Navigation to extractions on success
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileUploader } from '@/components/ingestion/FileUploader'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { PageHeader, PageContainer } from '@/components/layout'
import {
  BeginnerFileGuide,
  FieldHelpLabel,
  FriendlyError,
  GuideCallout,
  HelpTerm,
} from '@/features/help/components'
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
  Loader2,
  Link2,
  RefreshCw,
} from 'lucide-react'
import {
  listPropertiesApiV1PropertiesGet,
  listLeasesApiV1LeasesGet,
  uploadDocumentApiV1DocumentsUploadPost,
} from '@/api/generated/sdk.gen'
import type { Property, Lease } from '@/api/generated/types.gen'
import { apiClient } from '@/api/client'
import {
  getCountBucket,
  getFileSizeBucket,
  getFileType,
  trackEvent,
} from '@/lib/analytics'

/**
 * Format error messages for user-friendly display
 */
function formatErrorMessage(error: string): string {
  if (
    error.includes('50MB') ||
    error.includes('large') ||
    error.includes('size')
  ) {
    return 'File exceeds 50MB limit. Please compress or split your PDF.'
  }
  if (
    error.includes('PDF') ||
    error.includes('format') ||
    error.includes('accepted')
  ) {
    return 'Only PDF files are supported. Please convert your document to PDF.'
  }
  if (
    error.includes('Network') ||
    error.includes('fetch') ||
    error.includes('connection') ||
    error.includes('timeout')
  ) {
    return 'Connection failed. Check your internet and retry.'
  }
  return error || 'Upload failed. Please try again.'
}

function getSelectedFileTrackingProperties(files: File[]) {
  const largestFile = files.reduce(
    (largest, file) => Math.max(largest, file.size),
    0
  )
  return {
    file_count_bucket: getCountBucket(files.length),
    largest_file_size_bucket: getFileSizeBucket(largestFile),
    file_type: getFileType(files[0]?.type || files[0]?.name),
  }
}

function getLeaseUploadFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('50mb') || message.includes('large')) {
    return 'too_large'
  }
  if (message.includes('pdf') || message.includes('format')) {
    return 'invalid_type'
  }
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('connection') ||
    message.includes('timeout')
  ) {
    return 'network'
  }
  return 'unknown'
}

export function LeaseUploadPage() {
  const navigate = useNavigate()

  // File state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  // Property state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')
  const [properties, setProperties] = useState<Property[]>([])
  const [propertiesLoading, setPropertiesLoading] = useState(true)
  const [propertiesError, setPropertiesError] = useState<string>('')

  // Lease state (optional)
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>('')
  const [leases, setLeases] = useState<Lease[]>([])
  const [leasesLoading, setLeasesLoading] = useState(false)
  const [leasesError, setLeasesError] = useState<string>('')
  const [leasesReloadKey, setLeasesReloadKey] = useState(0)

  // Upload state
  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'uploading' | 'success' | 'error'
  >('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Fetch properties on mount
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setPropertiesLoading(true)
        setPropertiesError('')
        const response = await listPropertiesApiV1PropertiesGet({
          client: apiClient,
          query: { limit: 100 },
        })
        if (response.data) {
          setProperties(response.data.data || [])
        }
      } catch (error) {
        setPropertiesError(
          error instanceof Error ? error.message : 'Failed to load properties'
        )
      } finally {
        setPropertiesLoading(false)
      }
    }
    fetchProperties()
  }, [])

  // Fetch leases when property changes
  useEffect(() => {
    if (!selectedPropertyId) {
      setLeases([])
      setSelectedLeaseId('')
      return
    }

    const fetchLeases = async () => {
      try {
        setLeasesLoading(true)
        setLeasesError('')
        const response = await listLeasesApiV1LeasesGet({
          client: apiClient,
          query: { property_id: selectedPropertyId, limit: 100 },
        })
        if (response.data) {
          setLeases(response.data.data || [])
        }
      } catch (error) {
        // Lease selection is optional, so a failure must not block upload.
        // Surface it (with a retry) instead of silently swallowing it so
        // the user knows their existing leases could not be loaded.
        setLeases([])
        setLeasesError(
          error instanceof Error ? error.message : 'Failed to load leases'
        )
      } finally {
        setLeasesLoading(false)
      }
    }
    fetchLeases()
  }, [selectedPropertyId, leasesReloadKey])

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files)
    setUploadStatus('idle')
    setErrorMessage('')
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return
    if (!selectedPropertyId) {
      trackEvent('lease_document_upload_failed', {
        ...getSelectedFileTrackingProperties(selectedFiles),
        failure_stage: 'property_required',
        failure_reason: 'missing_property',
      })
      setErrorMessage('Please select a property first')
      setUploadStatus('error')
      return
    }

    setUploadStatus('uploading')
    setErrorMessage('')
    trackEvent('lease_document_upload_started', {
      property_id: selectedPropertyId,
      has_linked_lease: Boolean(selectedLeaseId),
      ...getSelectedFileTrackingProperties(selectedFiles),
    })

    try {
      // Upload each file (batch)
      let uploadedCount = 0
      for (const file of selectedFiles) {
        const response = await uploadDocumentApiV1DocumentsUploadPost({
          client: apiClient,
          body: { file },
          query: {
            property_id: selectedPropertyId,
            document_type: 'lease',
            ...(selectedLeaseId ? { lease_id: selectedLeaseId } : {}),
          },
        })

        if (response.error) {
          throw new Error(response.error.detail?.toString() || 'Upload failed')
        }
        uploadedCount += 1
      }

      setUploadStatus('success')
      trackEvent('lease_document_upload_completed', {
        property_id: selectedPropertyId,
        has_linked_lease: Boolean(selectedLeaseId),
        uploaded_count_bucket: getCountBucket(uploadedCount),
        ...getSelectedFileTrackingProperties(selectedFiles),
      })
      setTimeout(() => {
        navigate('/extractions')
      }, 1500)
    } catch (error) {
      setUploadStatus('error')
      trackEvent('lease_document_upload_failed', {
        property_id: selectedPropertyId,
        has_linked_lease: Boolean(selectedLeaseId),
        failure_stage: 'upload',
        failure_reason: getLeaseUploadFailureReason(error),
        ...getSelectedFileTrackingProperties(selectedFiles),
      })
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  const handleClear = () => {
    setSelectedFiles([])
    setUploadStatus('idle')
    setErrorMessage('')
  }

  const canUpload =
    selectedFiles.length > 0 &&
    selectedPropertyId &&
    uploadStatus !== 'uploading' &&
    uploadStatus !== 'success'

  const isDisabled = uploadStatus === 'uploading' || uploadStatus === 'success'

  return (
    <PageContainer>
      <PageHeader
        title="Upload Lease PDFs"
        description="Upload lease PDFs to extract key terms for review"
      />

      <div className="grid gap-6 max-w-4xl">
        {/* Upload Section */}
        <Card className="shadow-sm">
          <CardHeader variant="gradient">
            <CardTitle as="h2" className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Upload Lease Documents
            </CardTitle>
            <CardDescription>
              PDF files up to 50MB each. You can upload up to 10 at once.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Property Selector (Required) */}
            <div className="space-y-2">
              <Label
                htmlFor="property-select"
                className="flex items-center gap-2"
              >
                <Building2 className="h-4 w-4" />
                <FieldHelpLabel fieldId="glProperty">
                  Select Property
                </FieldHelpLabel>
                <span className="text-destructive-strong" aria-hidden="true">
                  *
                </span>
              </Label>
              {propertiesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading properties...
                </div>
              ) : propertiesError ? (
                <FriendlyError
                  title="Properties could not load"
                  message={propertiesError}
                  recovery="Refresh the page. If this continues, open Help and search for property setup."
                />
              ) : properties.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No properties found. Please create a property first before
                    uploading lease documents.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedPropertyId}
                  onValueChange={(value) => {
                    setSelectedPropertyId(value)
                    setSelectedLeaseId('')
                  }}
                  disabled={isDisabled}
                >
                  <SelectTrigger
                    id="property-select"
                    aria-required="true"
                    className="w-full"
                  >
                    <SelectValue placeholder="Choose a property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                        {property.address_line1 && (
                          <span className="text-muted-foreground ml-2">
                            ({property.address_line1}, {property.city})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Lease Selector (Optional) - Shows after property selection */}
            {selectedPropertyId && (
              <div className="space-y-2">
                <Label
                  htmlFor="lease-select"
                  className="flex items-center gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Link to Lease
                  <span className="text-muted-foreground text-xs ml-1">
                    (optional)
                  </span>
                </Label>
                {leasesLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading leases...
                  </div>
                ) : leasesError ? (
                  <div
                    className="flex flex-col gap-2 rounded-md border border-border-subtle bg-muted/40 p-3 text-sm"
                    role="alert"
                    data-testid="lease-upload-leases-error"
                  >
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        Couldn&apos;t load existing leases for this property.
                        You can still upload documents without linking a lease.
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit gap-2"
                      onClick={() => {
                        setLeasesReloadKey((key) => key + 1)
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                ) : leases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No leases found for this property. Documents will be
                    uploaded without lease association.
                  </p>
                ) : (
                  <Select
                    value={selectedLeaseId}
                    onValueChange={setSelectedLeaseId}
                    disabled={isDisabled}
                  >
                    <SelectTrigger id="lease-select" className="w-full">
                      <SelectValue placeholder="Select a lease (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leases.map((lease) => (
                        <SelectItem key={lease.id} value={lease.id}>
                          {lease.tenant_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* File Uploader with PDF accept */}
            <div className="space-y-3">
              <BeginnerFileGuide type="pdf" />
              <GuideCallout title="What happens after upload?">
                <p>
                  CapVeri reads the PDF and pulls out key terms like{' '}
                  <HelpTerm term="base-year">base year</HelpTerm>, tenant share,{' '}
                  <HelpTerm term="cap">caps</HelpTerm>, and fees. You review
                  each value before it is saved.
                </p>
              </GuideCallout>
            </div>
            {!selectedPropertyId && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="property-required-hint"
              >
                First choose a property above. Then you can add your PDF here.
              </p>
            )}
            <FileUploader
              onFilesSelected={handleFilesSelected}
              isDisabled={isDisabled || !selectedPropertyId}
              maxFiles={10}
              maxSize={50 * 1024 * 1024}
              accept={{ 'application/pdf': ['.pdf'] }}
            />

            {/* Selected Files Count */}
            {selectedFiles.length > 0 && uploadStatus !== 'success' && (
              <p className="text-sm text-muted-foreground">
                {selectedFiles.length} file
                {selectedFiles.length !== 1 ? 's' : ''} selected
              </p>
            )}

            {/* Upload Status - Success */}
            {uploadStatus === 'success' && (
              <Alert className="border-success/20 bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success-strong" />
                <AlertDescription className="text-success-strong">
                  Lease PDFs uploaded successfully! Redirecting to
                  extractions...
                </AlertDescription>
              </Alert>
            )}

            {/* Upload Status - Uploading */}
            {uploadStatus === 'uploading' && (
              <Alert className="border-primary/20 bg-primary/5">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <AlertDescription className="text-primary">
                  Uploading {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? 's' : ''}...
                </AlertDescription>
              </Alert>
            )}

            {/* Upload Status - Error */}
            {uploadStatus === 'error' && (
              <FriendlyError
                title="Upload did not finish"
                message={formatErrorMessage(errorMessage)}
                recovery="Make sure the property is selected and each document is a PDF under 50MB."
              />
            )}

            {/* Action Buttons */}
            {selectedFiles.length > 0 && uploadStatus !== 'success' && (
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  onClick={handleUpload}
                  disabled={!canUpload}
                  className="flex-1 sm:flex-none min-h-[44px]"
                >
                  {uploadStatus === 'uploading' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    `Upload ${selectedFiles.length} PDF${selectedFiles.length !== 1 ? 's' : ''}`
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isDisabled}
                  className="flex-1 sm:flex-none min-h-[44px]"
                >
                  Clear
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle as="h2">Supported Format</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-medium mb-1">PDF Documents</h3>
                <p className="text-muted-foreground">
                  Upload lease agreements, amendments, and related documents as
                  PDFs. Key financial terms (base year, pro-rata share, caps,
                  admin fees) are read from the PDF. You review each one before
                  saving.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1">What Happens Next</h3>
                <p className="text-muted-foreground">
                  After upload, CapVeri reads the document and extracts the
                  terms. You review and confirm each value before it is saved to
                  the lease.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-1">File Requirements</h3>
                <ul className="text-muted-foreground list-disc list-inside space-y-1">
                  <li>PDF format only</li>
                  <li>Maximum 50MB per file</li>
                  <li>Up to 10 files at a time</li>
                  <li>
                    Text-based PDFs work best (scanned documents are supported)
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
