# Story 10.9: Create Lease Document Upload

## Story Info
- **Epic**: Property & Lease Management UI
- **Estimated Hours**: 3
- **Dependencies**: Story 10.7 (Lease form)
- **Status**: `pending`

## User Story
As a CAM analyst, I want to upload the lease PDF so that it can be used for reference and AI extraction.

## Acceptance Criteria
- File upload component on lease detail page
- Accept PDF files only
- Show upload progress
- Preview uploaded document (thumbnail or link)
- Replace existing document option
- Delete document option
- Max file size: 25MB
- Success/error notifications

## Technical Specifications
Implement LeaseDocumentUpload component at `frontend/src/components/leases/LeaseDocumentUpload.tsx`:
- React Dropzone for drag-and-drop
- React Query mutations for upload/delete
- Progress bar during upload
- File type validation (PDF only)
- File size validation (25MB max)
- Current document display with view link
- Replace and delete options

Upload handling:
- Drag-and-drop support
- Click to browse file picker
- Progress bar with percentage
- onUploadProgress event tracking
- Error handling with user-friendly messages

Current document display:
- File icon
- Filename and metadata
- View link to open PDF
- Delete button with confirmation

## Test Cases
- Drag-and-drop upload works
- Click to browse works
- Progress bar shows during upload
- Current document displays with view link
- Replace document works
- Delete document works
- File size validation works
- Only PDF accepted
- Unit tests for component

## Definition of Done
- [ ] Drag-and-drop upload works
- [ ] Click to browse works
- [ ] Progress bar shows during upload
- [ ] Current document displays with view link
- [ ] Replace document works
- [ ] Delete document works
- [ ] File size validation works
- [ ] Only PDF accepted
- [ ] Unit tests for component
