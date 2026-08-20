/**
 * Rent Roll Upload Component
 *
 * Orchestrates the rent roll upload flow:
 * 1. File selection (FileUploader)
 * 2. Preview (RentRollPreview)
 * 3. Import (creates Property + Units + Leases)
 */
import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUploader } from '@/components/ingestion/FileUploader'
import { RentRollPreview } from './RentRollPreview'
import {
  useRentRollPreview,
  useRentRollImport,
  type RentRollPreviewResponse,
  type RentRollPropertyMetadata,
  type RentRollImportRequest,
} from '@/api/hooks'
import { useUserRole } from '@/hooks/useUserRole'
import { Upload, Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react'

type UploadStep = 'select' | 'preview' | 'importing' | 'success' | 'error'

interface RentRollUploadProps {
  /** Called when import succeeds with created property ID */
  onSuccess?: (propertyId: string) => void
  /** Called when user cancels */
  onCancel?: () => void
}

export function RentRollUpload({ onSuccess, onCancel }: RentRollUploadProps) {
  const { isAdmin } = useUserRole()
  const [step, setStep] = useState<UploadStep>('select')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewData, setPreviewData] =
    useState<RentRollPreviewResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const previewMutation = useRentRollPreview({
    onSuccess: (data) => {
      setPreviewData(data)
      setStep('preview')
    },
    onError: (error) => {
      setErrorMessage(error.message)
      setStep('error')
    },
  })

  const importMutation = useRentRollImport({
    onSuccess: (data) => {
      if (data.success && data.property_id) {
        setStep('success')
        onSuccess?.(data.property_id)
      } else {
        setErrorMessage(data.errors?.[0] || 'Import failed')
        setStep('error')
      }
    },
    onError: (error) => {
      setErrorMessage(error.message)
      setStep('error')
    },
  })

  const handleFilesSelected = (files: File[]) => {
    const file = files[0]
    if (file) {
      setSelectedFile(file)
      setErrorMessage(null)
      previewMutation.mutate(file)
    }
  }

  const handleConfirmImport = (
    overrides: Partial<RentRollPropertyMetadata>
  ) => {
    if (!selectedFile) return

    setStep('importing')

    // Build request with only non-empty overrides
    const request: RentRollImportRequest = { file: selectedFile }
    if (overrides.name) request.property_name = overrides.name
    if (overrides.address_line1) request.address = overrides.address_line1
    if (overrides.city) request.city = overrides.city
    if (overrides.state) request.state = overrides.state
    if (overrides.postal_code) request.postal_code = overrides.postal_code

    importMutation.mutate(request)
  }

  const handleCancel = () => {
    setStep('select')
    setSelectedFile(null)
    setPreviewData(null)
    setErrorMessage(null)
    onCancel?.()
  }

  const handleReset = () => {
    setStep('select')
    setSelectedFile(null)
    setPreviewData(null)
    setErrorMessage(null)
  }

  // Admin-only feature: rent roll import creates Property + Units + Leases,
  // which requires owner/admin privileges (RLS enforces this server-side).
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-3 bg-muted rounded-full mb-4">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              Only an owner can do this
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Uploading a tenant list adds buildings, spaces, and tenants to
              your account. Only the account owner can do this. Ask whoever set
              up your account to upload the file for you.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Loading state during preview
  if (previewMutation.isPending) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4 motion-reduce:animate-none" />
            <p className="text-muted-foreground">Reading your file…</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Preview step
  if (step === 'preview' && previewData) {
    return (
      <RentRollPreview
        preview={previewData}
        onConfirm={handleConfirmImport}
        onCancel={handleCancel}
        isLoading={importMutation.isPending}
      />
    )
  }

  // Importing step
  if (step === 'importing') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4 motion-reduce:animate-none" />
            <p className="text-muted-foreground">
              Adding your building, spaces, and tenants…
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Success step
  if (step === 'success') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-3 bg-success/10 rounded-full mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-xl font-semibold mb-2">All done</h3>
            <p className="text-muted-foreground mb-6">
              We added your building, your spaces, and your tenants.
            </p>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-full min-h-[44px]"
            >
              Upload another file
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error step
  if (step === 'error') {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="p-3 bg-destructive/10 rounded-full mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              That file did not work
            </h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {errorMessage ||
                'Something went wrong while we read your file. Please try again.'}
            </p>
            <Button
              onClick={handleReset}
              variant="outline"
              className="rounded-full min-h-[44px]"
            >
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // File selection step (default)
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload a tenant list
        </CardTitle>
        <CardDescription>
          Have a file that lists who rents from you and the spaces they rent?
          Upload it here. We read it for you. A spreadsheet (CSV or Excel)
          works, or a file you saved from your property software.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FileUploader
          onFilesSelected={handleFilesSelected}
          maxFiles={1}
          isDisabled={previewMutation.isPending}
        />

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <h3 className="font-medium mb-2">Files we can read</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>A spreadsheet (CSV or Excel)</li>
            <li>A tenant list saved from Yardi or MRI property software</li>
            <li>
              Any spreadsheet that lists your tenants, their spaces, and what
              they pay
            </li>
          </ul>
        </div>

        {onCancel && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              onClick={onCancel}
              className="rounded-full min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
