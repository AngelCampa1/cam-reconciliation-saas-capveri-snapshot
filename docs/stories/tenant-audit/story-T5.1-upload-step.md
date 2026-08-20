# Story T5.1: Upload Step

## Story Info
- **Epic**: T5 — Audit Wizard
- **Estimated Hours**: 6
- **Dependencies**: T1.4 (API endpoints), T4.1 (marketing-tenant scaffold)
- **Status**: `pending`

## User Story
As a commercial tenant, I want to upload my lease and CAM reconciliation statement PDFs so that the system can analyze them for overcharges.

## Acceptance Criteria
- Two distinct drop zones: one for lease PDF, one for CAM reconciliation statement PDF
- Each drop zone accepts PDF files only (`.pdf` MIME type)
- Maximum file size is 25 MB per file
- Drag-and-drop supported via react-dropzone
- Click-to-browse fallback for each drop zone
- After upload, each zone shows the file name and formatted file size
- Upload button replaces file (re-upload) if user drops a new file
- "Continue" button is disabled until both files are uploaded
- Files are uploaded to the backend via `POST /api/v1/tenant-audits/` (multipart/form-data)
- On first visit (no token), the POST creates a new audit and redirects to `/audit/{token}`
- On return visit (token exists, status=created, no files), the upload step is shown
- Upload errors display inline error messages below the drop zone
- Loading spinner shown during upload
- Responsive layout: drop zones stack vertically on mobile

## Technical Specifications

### FileDropZone Component

```typescript
// marketing-tenant/src/components/audit/FileDropZone.tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

interface FileDropZoneProps {
  label: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  isUploading?: boolean;
  error?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropZone({
  label,
  description,
  file,
  onFileSelect,
  onFileRemove,
  isUploading = false,
  error,
}: FileDropZoneProps) {
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      setRejectionError(null);

      if (rejections.length > 0) {
        const rejection = rejections[0];
        if (rejection.errors.some((e) => e.code === "file-too-large")) {
          setRejectionError("File exceeds 25 MB limit");
        } else if (rejection.errors.some((e) => e.code === "file-invalid-type")) {
          setRejectionError("Only PDF files are accepted");
        } else {
          setRejectionError("Invalid file");
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: isUploading,
  });

  const displayError = error ?? rejectionError;

  if (file && !isUploading) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFileRemove}
            className="rounded-full p-1 hover:bg-muted"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          isUploading && "pointer-events-none opacity-50",
          displayError && "border-destructive",
        )}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          PDF only, max 25 MB
        </p>
      </div>
      {displayError && (
        <p className="mt-1.5 text-sm text-destructive" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}
```

### UploadStep Component

```typescript
// marketing-tenant/src/components/audit/UploadStep.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropZone } from "./FileDropZone";
import { Button } from "@/components/ui/button";
import { useCreateAudit } from "@/hooks/use-tenant-audit";

interface UploadStepProps {
  token?: string;
}

export function UploadStep({ token }: UploadStepProps) {
  const router = useRouter();
  const [leaseFile, setLeaseFile] = useState<File | null>(null);
  const [camFile, setCamFile] = useState<File | null>(null);

  const createAudit = useCreateAudit();

  const handleContinue = async () => {
    if (!leaseFile || !camFile) return;

    const formData = new FormData();
    formData.append("lease_pdf", leaseFile);
    formData.append("cam_statement_pdf", camFile);

    createAudit.mutate(formData, {
      onSuccess: (data) => {
        router.push(`/audit/${data.access_token}`);
      },
    });
  };

  const bothFilesSelected = leaseFile !== null && camFile !== null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Upload Your Documents
        </h2>
        <p className="mt-2 text-muted-foreground">
          We need your lease and CAM reconciliation statement to analyze for
          overcharges.
        </p>
      </div>

      <div className="space-y-4">
        <FileDropZone
          label="Lease Agreement"
          description="Your current lease or most recent amendment"
          file={leaseFile}
          onFileSelect={setLeaseFile}
          onFileRemove={() => setLeaseFile(null)}
          isUploading={createAudit.isPending}
          error={
            createAudit.isError && createAudit.error?.message.includes("lease")
              ? createAudit.error.message
              : null
          }
        />

        <FileDropZone
          label="CAM Reconciliation Statement"
          description="The annual reconciliation statement from your landlord"
          file={camFile}
          onFileSelect={setCamFile}
          onFileRemove={() => setCamFile(null)}
          isUploading={createAudit.isPending}
          error={
            createAudit.isError && createAudit.error?.message.includes("cam")
              ? createAudit.error.message
              : null
          }
        />
      </div>

      {createAudit.isError &&
        !createAudit.error?.message.includes("lease") &&
        !createAudit.error?.message.includes("cam") && (
          <p className="text-center text-sm text-destructive" role="alert">
            {createAudit.error?.message ?? "Upload failed. Please try again."}
          </p>
        )}

      <Button
        onClick={handleContinue}
        disabled={!bothFilesSelected || createAudit.isPending}
        className="w-full"
        size="lg"
      >
        {createAudit.isPending ? "Uploading..." : "Continue"}
      </Button>
    </div>
  );
}
```

### API Hook

```typescript
// marketing-tenant/src/hooks/use-tenant-audit.ts
import { useMutation } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

interface CreateAuditResponse {
  id: string;
  access_token: string;
  status: string;
}

export function useCreateAudit() {
  return useMutation<CreateAuditResponse, Error, FormData>({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`${API_BASE}/api/v1/tenant-audits/`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.detail ?? `Upload failed (${response.status})`,
        );
      }

      return response.json();
    },
  });
}
```

## Test Cases
- Both drop zones render with correct labels ("Lease Agreement", "CAM Reconciliation Statement")
- Dropping a valid PDF file shows file name and size
- Dropping a non-PDF file shows "Only PDF files are accepted" error
- Dropping a file over 25 MB shows "File exceeds 25 MB limit" error
- Removing a selected file returns the drop zone to its empty state
- "Continue" button is disabled when fewer than two files are selected
- "Continue" button is enabled when both files are selected
- Successful upload navigates to `/audit/{token}`
- Upload error displays inline error message
- Drop zones show loading state during upload
- Drop zones are disabled during upload to prevent double-submission
- Drag-over state applies visual highlight to the active drop zone
- Mobile layout stacks drop zones vertically

## Definition of Done
- [ ] `FileDropZone` component renders with drag-and-drop via react-dropzone
- [ ] PDF-only validation rejects non-PDF files with error message
- [ ] 25 MB size limit enforced with error message
- [ ] File name and size displayed after successful selection
- [ ] File removal resets drop zone to empty state
- [ ] `UploadStep` orchestrates two `FileDropZone` instances
- [ ] `POST /api/v1/tenant-audits/` called with multipart/form-data on continue
- [ ] Successful creation redirects to `/audit/{token}`
- [ ] Error states displayed inline
- [ ] Loading states shown during upload
- [ ] Unit tests for `FileDropZone` (valid file, invalid type, oversized, remove)
- [ ] Unit tests for `UploadStep` (disabled button, upload flow, error display)
- [ ] Responsive layout verified on mobile viewport
