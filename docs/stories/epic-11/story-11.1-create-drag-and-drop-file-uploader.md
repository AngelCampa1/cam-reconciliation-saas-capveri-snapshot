# Story 11.1: Create Drag-and-Drop File Uploader

## Story Info
- **Epic**: Data Ingestion UI
- **Estimated Hours**: 3
- **Dependencies**: None
- **Status**: `pending`

## User Story
As a CAM analyst, I want to drag and drop files for import so that I can quickly upload GL data and rent rolls.

## Acceptance Criteria
- Drag-and-drop zone with visual feedback
- Click to browse also works
- Accept CSV, XLSX, XLS formats
- Show file info after selection (name, size, type)
- Remove file option before upload
- Multiple file selection support
- Max file size: 50MB with clear error
- Disabled state during processing

## Technical Specifications

```tsx
// frontend/src/components/ingestion/FileUploader.tsx
import { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
} from 'lucide-react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  isDisabled?: boolean;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

const ACCEPTED_TYPES = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function FileUploader({
  onFilesSelected,
  isDisabled = false,
  maxFiles = 5,
  maxSize = MAX_FILE_SIZE,
}: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setErrors([]);

      // Handle rejections
      const newErrors: string[] = [];
      rejectedFiles.forEach((rejection) => {
        rejection.errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            newErrors.push(
              `${rejection.file.name}: File exceeds ${maxSize / 1024 / 1024}MB limit`
            );
          } else if (error.code === 'file-invalid-type') {
            newErrors.push(
              `${rejection.file.name}: Invalid file type. Use CSV, XLS, or XLSX`
            );
          } else {
            newErrors.push(`${rejection.file.name}: ${error.message}`);
          }
        });
      });

      if (newErrors.length > 0) {
        setErrors(newErrors);
      }

      // Add accepted files
      const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles);
      setFiles(newFiles);
      onFilesSelected(newFiles);
    },
    [files, maxFiles, maxSize, onFilesSelected]
  );

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles,
    maxSize,
    disabled: isDisabled,
    multiple: maxFiles > 1,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
          isDragActive && !isDragReject && 'border-primary bg-primary/5',
          isDragReject && 'border-destructive bg-destructive/5',
          isDisabled && 'opacity-50 cursor-not-allowed',
          !isDragActive && 'hover:border-primary/50 hover:bg-muted/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload
          className={cn(
            'mx-auto h-12 w-12 mb-4',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )}
        />
        <p className="font-medium mb-1">
          {isDragActive
            ? isDragReject
              ? 'Invalid file type'
              : 'Drop files here'
            : 'Drag and drop files here'}
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          Accepts CSV, XLS, XLSX • Max {maxSize / 1024 / 1024}MB per file
        </p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
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
              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{file.name}</p>
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
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Test Cases
- Drag-and-drop works with visual feedback
- Click to browse works
- File type validation works
- File size validation works
- Selected files display correctly
- Remove file works
- Multiple files support works
- Disabled state works
- Unit tests for file handling

## Definition of Done
- [ ] Drag-and-drop works with visual feedback
- [ ] Click to browse works
- [ ] File type validation works
- [ ] File size validation works
- [ ] Selected files display correctly
- [ ] Remove file works
- [ ] Multiple files support works
- [ ] Disabled state works
- [ ] Unit tests for file handling
