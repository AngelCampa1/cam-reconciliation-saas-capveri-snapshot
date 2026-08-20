# Story T1.4: Tenant Audit API Endpoints

## Story Info
- **Epic**: T1 — Backend Payment & Data Model
- **Estimated Hours**: 6
- **Dependencies**: T1.1 (Tenant Audit Data Model), T1.2 (Stripe One-Time Payment), T1.3 (Stripe Webhook Handler)
- **Status**: `pending`

## User Story
As a commercial tenant, I want API endpoints to create an audit, check its status, and download the completed report so that I can use the tenant audit product through the marketing site without needing a platform account.

## Acceptance Criteria
- POST `/api/v1/tenant-audits/` accepts multipart form data with email, tier, reconciliation PDF, lease PDF, and optional supporting files
- Files are validated (PDF/image only, max 10MB per file, max 5 files total)
- Files are uploaded to S3 with tenant-audit-scoped keys
- GET `/api/v1/tenant-audits/{access_token}` returns audit status and metadata
- GET `/api/v1/tenant-audits/{access_token}/report` returns the PDF report (only when status is `completed`)
- All endpoints are unauthenticated (access token is the credential)
- Rate limiting: 5/hour per IP for creation, 60/min per IP for status checks
- Invalid access tokens return 404 with no information leakage
- Report download returns 404 if audit is not yet completed

## Technical Specifications

### Router Setup

```python
# backend/app/api/v1/tenant_audits.py
import logging
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse

from app.core.rate_limiting import (
    MovingWindowRateLimiter,
    MemoryStorage,
    moving_window,
    storage,
)
from app.models.tenant_audit import (
    TenantAuditStatus,
    TenantAuditTier,
    TIER_PRICES_CENTS,
)
from app.schemas.tenant_audit import (
    PaymentSessionResponse,
    TenantAuditCreatedResponse,
    TenantAuditResponse,
)
from app.services.tenant_audit.payment import TenantAuditPaymentService
from app.services.tenant_audit.repository import TenantAuditRepository
from app.services.tenant_audit.service import TenantAuditService

from limits import parse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/tenant-audits",
    tags=["tenant-audits"],
)

# Rate limit definitions
CREATE_RATE_LIMIT = parse("5 per 1 hour")
STATUS_RATE_LIMIT = parse("60 per 1 minute")
PAY_RATE_LIMIT = parse("10 per 1 hour")


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(
    request: Request,
    limit: object,
    scope: str,
) -> None:
    """Check rate limit and raise 429 if exceeded."""
    client_ip = _get_client_ip(request)
    key = f"tenant_audit:{scope}:{client_ip}"
    if not moving_window.hit(limit, key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Please try again later.",
        )
```

### Create Audit Endpoint

```python
# POST /api/v1/tenant-audits/

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_SUPPORTING_FILES = 3
MAX_TOTAL_FILES = 5  # 1 reconciliation + 1 lease + up to 3 supporting


@router.post(
    "/",
    response_model=TenantAuditCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_tenant_audit(
    request: Request,
    email: Annotated[str, Form(description="Contact email for audit results")],
    tier: Annotated[
        TenantAuditTier, Form(description="Pricing tier")
    ] = TenantAuditTier.STANDARD,
    property_name: Annotated[
        str | None, Form(description="Optional property label", max_length=255)
    ] = None,
    reconciliation_file: UploadFile = File(
        description="CAM reconciliation statement (PDF or image)"
    ),
    lease_file: UploadFile = File(
        description="Lease document (PDF or image)"
    ),
    supporting_files: list[UploadFile] | None = File(
        None, description="Additional supporting documents (max 3)"
    ),
    service: TenantAuditService = Depends(get_tenant_audit_service),
):
    """
    Create a new tenant audit by uploading reconciliation and lease files.

    No authentication required. The response includes an `access_token`
    that serves as the credential for all subsequent operations.
    """
    # Rate limit
    _check_rate_limit(request, CREATE_RATE_LIMIT, "create")

    # Validate files
    all_files = [reconciliation_file, lease_file]
    if supporting_files:
        if len(supporting_files) > MAX_SUPPORTING_FILES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {MAX_SUPPORTING_FILES} supporting files allowed.",
            )
        all_files.extend(supporting_files)

    for upload_file in all_files:
        # Validate MIME type
        if upload_file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Invalid file type for '{upload_file.filename}': "
                    f"{upload_file.content_type}. "
                    f"Allowed types: PDF, JPEG, PNG, TIFF."
                ),
            )

        # Validate file size (read and check)
        contents = await upload_file.read()
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"File '{upload_file.filename}' exceeds maximum size of "
                    f"{MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
                ),
            )
        # Reset file position for subsequent read
        await upload_file.seek(0)

    # Validate email format (Pydantic handles via EmailStr in service)
    try:
        audit = await service.create_audit(
            email=email,
            tier=tier,
            property_name=property_name,
            reconciliation_file=reconciliation_file,
            lease_file=lease_file,
            supporting_files=supporting_files or [],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return TenantAuditCreatedResponse(
        access_token=audit.access_token,
        status=audit.status,
        tier=audit.tier,
        amount_cents=audit.amount_cents,
        message="Audit created. Proceed to payment.",
    )
```

### Get Audit Status Endpoint

```python
# GET /api/v1/tenant-audits/{access_token}

@router.get(
    "/{access_token}",
    response_model=TenantAuditResponse,
)
async def get_tenant_audit_status(
    access_token: UUID,
    request: Request,
    repository: TenantAuditRepository = Depends(get_repository),
):
    """
    Get the current status of a tenant audit.

    The access_token is the only credential required. No authentication needed.
    """
    _check_rate_limit(request, STATUS_RATE_LIMIT, "status")

    audit = await repository.get_by_access_token(access_token)
    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return TenantAuditResponse(
        access_token=audit.access_token,
        email=audit.email,
        property_name=audit.property_name,
        tier=audit.tier,
        status=audit.status,
        amount_cents=audit.amount_cents,
        created_at=audit.created_at,
        updated_at=audit.updated_at,
        paid_at=audit.paid_at,
        completed_at=audit.completed_at,
        has_report=audit.report_file_key is not None,
    )
```

### Download Report Endpoint

```python
# GET /api/v1/tenant-audits/{access_token}/report

@router.get(
    "/{access_token}/report",
)
async def download_tenant_audit_report(
    access_token: UUID,
    request: Request,
    repository: TenantAuditRepository = Depends(get_repository),
    storage_service: StorageService = Depends(get_storage_service),
):
    """
    Download the completed audit report as PDF.

    Only available when the audit status is 'completed' and a report
    has been generated.
    """
    _check_rate_limit(request, STATUS_RATE_LIMIT, "status")

    audit = await repository.get_by_access_token(access_token)
    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    if audit.status != TenantAuditStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not yet available.",
        )

    if not audit.report_file_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not yet generated.",
        )

    # Stream the PDF from S3
    file_stream = await storage_service.get_file_stream(audit.report_file_key)
    filename = f"cam-audit-report-{audit.access_token}.pdf"

    return StreamingResponse(
        content=file_stream,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
```

### Audit Creation Service

```python
# backend/app/services/tenant_audit/service.py
import logging
from datetime import datetime
from uuid import uuid4, UUID

from fastapi import UploadFile
from pydantic import EmailStr

from app.models.tenant_audit import (
    TenantAudit,
    TenantAuditStatus,
    TenantAuditTier,
    TIER_PRICES_CENTS,
)
from .repository import TenantAuditRepository
from .storage import TenantAuditStorageService

logger = logging.getLogger(__name__)


class TenantAuditService:
    """Orchestrates tenant audit creation and file upload."""

    def __init__(
        self,
        repository: TenantAuditRepository,
        storage_service: TenantAuditStorageService,
    ) -> None:
        self.repository = repository
        self.storage_service = storage_service

    async def create_audit(
        self,
        email: str,
        tier: TenantAuditTier,
        property_name: str | None,
        reconciliation_file: UploadFile,
        lease_file: UploadFile,
        supporting_files: list[UploadFile],
    ) -> TenantAudit:
        """
        Create a new tenant audit with uploaded files.

        1. Generate IDs and access token.
        2. Upload files to S3 with scoped keys.
        3. Create audit record in database.
        4. Log creation event.
        """
        audit_id = uuid4()
        access_token = uuid4()
        now = datetime.utcnow()

        # Upload files to S3
        reconciliation_key = await self.storage_service.upload_file(
            file=reconciliation_file,
            audit_id=audit_id,
            file_type="reconciliation",
        )

        lease_key = await self.storage_service.upload_file(
            file=lease_file,
            audit_id=audit_id,
            file_type="lease",
        )

        supporting_keys: list[str] = []
        for i, sf in enumerate(supporting_files):
            key = await self.storage_service.upload_file(
                file=sf,
                audit_id=audit_id,
                file_type=f"supporting_{i}",
            )
            supporting_keys.append(key)

        # Create audit record
        audit = TenantAudit(
            id=audit_id,
            access_token=access_token,
            email=email,
            property_name=property_name,
            reconciliation_file_key=reconciliation_key,
            lease_file_key=lease_key,
            supporting_file_keys=supporting_keys,
            tier=tier,
            amount_cents=TIER_PRICES_CENTS[tier],
            status=TenantAuditStatus.CREATED,
            created_at=now,
            updated_at=now,
        )

        audit = await self.repository.create(audit)

        # Log creation event
        await self.repository.log_event(
            audit_id=audit.id,
            event_type="created",
            event_data={
                "email": email,
                "tier": tier.value,
                "amount_cents": TIER_PRICES_CENTS[tier],
                "file_count": 2 + len(supporting_keys),
            },
        )

        logger.info(
            "Tenant audit created: id=%s, access_token=%s, tier=%s, email=%s",
            audit.id,
            audit.access_token,
            tier.value,
            email,
        )

        return audit
```

### File Storage Service

```python
# backend/app/services/tenant_audit/storage.py
from uuid import UUID

from fastapi import UploadFile


class TenantAuditStorageService:
    """Upload and retrieve files for tenant audits from S3."""

    def __init__(self, s3_client: object, bucket: str) -> None:
        self.s3_client = s3_client
        self.bucket = bucket

    async def upload_file(
        self,
        file: UploadFile,
        audit_id: UUID,
        file_type: str,
    ) -> str:
        """
        Upload a file to S3 with a tenant-audit-scoped key.

        Key format: tenant-audits/{audit_id}/{file_type}/{original_filename}

        Returns the S3 key.
        """
        key = f"tenant-audits/{audit_id}/{file_type}/{file.filename}"
        contents = await file.read()

        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=contents,
            ContentType=file.content_type or "application/octet-stream",
        )

        await file.seek(0)  # Reset for potential re-read
        return key

    async def get_file_stream(self, key: str):
        """Get a streaming response for an S3 object."""
        response = self.s3_client.get_object(
            Bucket=self.bucket,
            Key=key,
        )
        return response["Body"]
```

### Dependency Injection

```python
# backend/app/api/v1/dependencies/tenant_audit.py
from functools import lru_cache

from app.services.tenant_audit.payment import TenantAuditPaymentService
from app.services.tenant_audit.repository import TenantAuditRepository
from app.services.tenant_audit.service import TenantAuditService
from app.services.tenant_audit.storage import TenantAuditStorageService
from app.services.tenant_audit.webhook_handler import TenantAuditWebhookHandler


def get_supabase_client():
    """Get the Supabase service_role client."""
    raise NotImplementedError(
        "Wire up the actual Supabase service_role client. "
        "See backend/app/core/supabase.py"
    )


def get_s3_client():
    """Get the S3 client."""
    raise NotImplementedError(
        "Wire up the actual S3 client. "
        "See backend/app/core/s3.py"
    )


def get_repository() -> TenantAuditRepository:
    """Get the tenant audit repository."""
    return TenantAuditRepository(get_supabase_client())


def get_storage_service() -> TenantAuditStorageService:
    """Get the storage service for file uploads."""
    return TenantAuditStorageService(
        s3_client=get_s3_client(),
        bucket="capveri-tenant-audits",
    )


def get_payment_service() -> TenantAuditPaymentService:
    """Get the payment service."""
    return TenantAuditPaymentService(get_repository())


def get_tenant_audit_service() -> TenantAuditService:
    """Get the tenant audit orchestration service."""
    return TenantAuditService(
        repository=get_repository(),
        storage_service=get_storage_service(),
    )


def get_webhook_handler() -> TenantAuditWebhookHandler:
    """Get the webhook handler."""
    return TenantAuditWebhookHandler(
        repository=get_repository(),
        payment_service=get_payment_service(),
    )
```

### Router Registration

```python
# Add to backend/app/api/v1/__init__.py or main router
from app.api.v1.tenant_audits import router as tenant_audits_router
from app.api.v1.tenant_audit_webhooks import router as tenant_audit_webhooks_router

app.include_router(tenant_audits_router, prefix="/api/v1")
app.include_router(tenant_audit_webhooks_router, prefix="/api/v1")
```

## Test Cases

### Create Endpoint
- Successful creation with valid email, PDF reconciliation, and PDF lease returns 201
- Response includes `access_token`, `status=created`, `tier`, `amount_cents`
- Files are uploaded to S3 with correct key format: `tenant-audits/{id}/{type}/{filename}`
- Supporting files (up to 3) are accepted and stored
- More than 3 supporting files returns 400
- Non-PDF/image files return 400 with descriptive error
- File exceeding 10MB returns 400
- Missing reconciliation file returns 422
- Missing lease file returns 422
- Invalid email format returns 422
- Rate limit: 6th request within 1 hour returns 429
- `property_name` exceeding 255 characters returns 422

### Status Endpoint
- Valid access token returns audit status with all public fields
- `has_report` is `True` when `report_file_key` is present
- `has_report` is `False` when `report_file_key` is `None`
- Nonexistent access token returns 404 with generic "Audit not found" message
- Rate limit: 61st request within 1 minute returns 429
- Response does not leak internal IDs, file keys, or Stripe details

### Report Download Endpoint
- Completed audit with report returns PDF stream with correct Content-Disposition
- Audit in `processing` status returns 404 "Report not yet available"
- Audit in `paid` status returns 404
- Completed audit without `report_file_key` returns 404
- Nonexistent access token returns 404

### Rate Limiting
- Different IPs have independent rate limit counters
- X-Forwarded-For header is respected for IP extraction
- Rate limit resets after the time window expires

### Service Layer
- `TenantAuditService.create_audit` generates unique IDs and access token
- Files are uploaded before the database record is created
- Event log records `created` event with file count and tier
- `TIER_PRICES_CENTS` is used as the single source of truth for pricing

## Definition of Done
- [ ] POST `/api/v1/tenant-audits/` accepts multipart form data and creates audit
- [ ] File validation: type (PDF/image), size (10MB max), count (5 max)
- [ ] Files uploaded to S3 with scoped keys
- [ ] GET `/api/v1/tenant-audits/{access_token}` returns status
- [ ] GET `/api/v1/tenant-audits/{access_token}/report` streams PDF
- [ ] Report only available when status is `completed`
- [ ] Rate limiting: 5/hr for create, 60/min for status, 10/hr for pay
- [ ] Invalid access tokens return 404 with no information leakage
- [ ] Dependency injection wired for repository, storage, payment, webhook handler
- [ ] Router registered on the FastAPI app
- [ ] No authentication required on any endpoint
- [ ] Event log entries created for audit creation
- [ ] Unit tests cover all endpoints, validation, and error cases
- [ ] Integration test verifies create -> status -> pay -> status flow
- [ ] Coverage maintained at >= 95%
