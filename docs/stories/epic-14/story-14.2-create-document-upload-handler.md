# Story 14.2: Create Document Upload Handler

## Story Info
- **Epic**: OCR Pipeline
- **Estimated Hours**: 2
- **Dependencies**: Story 14.1, Epic 3 (Database Schema)
- **Status**: `completed`

## User Story
Handle PDF lease document uploads, validate file type/size, and store in S3 for document reader processing.

## Acceptance Criteria
- [x] Accept PDF files up to 50MB
- [x] Validate file is valid PDF (magic bytes check)
- [x] Generate unique S3 key with organization/property path
- [x] Upload to S3 with server-side encryption
- [x] Create document record in database with status "pending"
- [x] Return document ID for status tracking
- [x] Reject non-PDF files with appropriate error

## Technical Specifications

Document upload endpoint with S3 storage and database tracking.

### Implementation Files Created

**Pydantic Models (`backend/app/models/document.py`)**:
- `Document` - Full database model
- `DocumentCreate` - DTO for creating records
- `DocumentUpdate` - DTO for status updates
- `DocumentResponse` - API response model
- `DocumentUploadResponse` - Upload success response

**Enums (`backend/app/models/enums.py`)**:
- `DocumentStatus` - pending, processing, completed, failed
- `DocumentType` - lease, amendment, rent_roll, gl_export, other

**S3 Client (`backend/app/services/extraction/s3_client.py`)**:
- `S3Client` class with upload, delete, URL generation
- PDF magic bytes validation
- Organization-scoped key generation
- Server-side AES-256 encryption
- Singleton pattern with `get_s3_client()`

**Database Migration (`supabase/migrations/20240101000016_create_documents.sql`)**:
- Documents table with RLS policies
- Indexes for common queries
- Status and document_type constraints

**API Endpoints (`backend/app/api/v1/documents.py`)**:
- `POST /documents/upload` - Upload PDF with validation
- `GET /documents` - List with filtering
- `GET /documents/{id}` - Get single document
- `DELETE /documents/{id}` - Delete pending/failed only

```python
# backend/app/api/v1/documents.py
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    property_id: UUID,
    ctx: OrgContext,
    file: UploadFile = File(...),
    document_type: DocumentType = DocumentType.LEASE,
    s3_client: S3Client = Depends(get_s3_client),
) -> DocumentUploadResponse:
    # Validate content type
    if file.content_type != "application/pdf":
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()

    # Validate file size (50MB max)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File exceeds maximum size")

    # Validate PDF magic bytes
    if not s3_client.validate_pdf(content):
        raise HTTPException(400, "Invalid PDF file")

    # Generate S3 key and upload with encryption
    s3_key = s3_client.generate_s3_key(
        ctx.organization_id, property_id, file.filename
    )
    s3_client.upload_document(key=s3_key, content=content)

    # Create database record
    result = ctx.table("documents").insert({...}).execute()

    return DocumentUploadResponse(document_id=result.data[0]["id"])
```

## Test Cases
- [x] Valid PDF uploads successfully
- [x] Invalid file type rejected with 400
- [x] Oversized file rejected with 400
- [x] S3 key generated correctly
- [x] Database record created with pending status

## Test Files Created
- `backend/tests/test_s3_client.py` - 26 tests for S3 operations
- `backend/tests/test_document_model.py` - 12 tests for Pydantic models
- `backend/tests/test_documents_api.py` - 13 tests for API endpoints

## Definition of Done
- [x] Upload endpoint created
- [x] File validation works
- [x] S3 upload with encryption
- [x] Database record created
- [x] Unit tests passing (51 tests pass)
- [x] Coverage: document.py 100%, s3_client.py 88%
