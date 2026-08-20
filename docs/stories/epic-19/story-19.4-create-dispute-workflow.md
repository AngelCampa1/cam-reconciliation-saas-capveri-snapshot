# Story 19.4: Create Dispute Workflow

## Story Info
- **Epic**: Tenant Portal
- **Estimated Hours**: 3
- **Dependencies**: Story 19.2, Story 19.3
- **Status**: `pending`

## User Story
Allow tenants to flag questions or disputes about their reconciliation statements.

## Acceptance Criteria
- [ ] Tenant can submit dispute from statement detail page
- [ ] Dispute form with category dropdown and description
- [ ] Attach supporting documents (optional)
- [ ] Landlord receives notification of new dispute
- [ ] Dispute status tracking (Open, Under Review, Resolved, Closed)
- [ ] Threaded comments for communication
- [ ] Rate limiting (max 3 disputes per day per tenant)
- [ ] Resolution summary visible to tenant

## Technical Specifications

Dispute workflow with categorization, threaded communication, and status tracking.

**Reference**: See `docs/architecture/tenant-portal-architecture.md` for full dispute workflow patterns.

### Dispute State Machine

```
OPEN → UNDER_REVIEW → RESOLVED → CLOSED
         ↓               ↓
      REJECTED ──────────┘
```

### Dispute Models

```python
# backend/app/models/dispute.py
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum

class DisputeStatus(str, Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    CLOSED = "closed"

class DisputeCategory(str, Enum):
    CALCULATION_ERROR = "calculation_error"
    MISSING_CREDIT = "missing_credit"
    INCORRECT_AREA = "incorrect_area"
    BASE_YEAR_ISSUE = "base_year_issue"
    BILLING_QUESTION = "billing_question"
    OTHER = "other"

class Dispute(Base):
    """Tenant dispute against a reconciliation statement."""
    __tablename__ = "disputes"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_user_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_users.id"), nullable=False)
    statement_id: Mapped[UUID] = mapped_column(ForeignKey("reconciliation_snapshots.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)

    category: Mapped[DisputeCategory] = mapped_column(SQLEnum(DisputeCategory), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[DisputeStatus] = mapped_column(SQLEnum(DisputeStatus), default=DisputeStatus.OPEN)

    # Resolution tracking
    assigned_to: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant_user: Mapped["TenantUser"] = relationship()
    statement: Mapped["ReconciliationSnapshot"] = relationship()
    comments: Mapped[list["DisputeComment"]] = relationship(back_populates="dispute", order_by="DisputeComment.created_at")
    attachments: Mapped[list["DisputeAttachment"]] = relationship(back_populates="dispute")


class DisputeComment(Base):
    """Threaded comments on a dispute."""
    __tablename__ = "dispute_comments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    dispute_id: Mapped[UUID] = mapped_column(ForeignKey("disputes.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(default=False)  # Hidden from tenant if True
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    dispute: Mapped["Dispute"] = relationship(back_populates="comments")
    author: Mapped["User"] = relationship()


class DisputeAttachment(Base):
    """File attachments on disputes."""
    __tablename__ = "dispute_attachments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    dispute_id: Mapped[UUID] = mapped_column(ForeignKey("disputes.id"), nullable=False)
    uploaded_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    dispute: Mapped["Dispute"] = relationship(back_populates="attachments")
```

### Dispute Service with Rate Limiting

```python
# backend/app/services/tenant/dispute_service.py
from datetime import datetime, timedelta
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

class DisputeService:
    """Manages dispute creation and lifecycle."""

    MAX_DISPUTES_PER_DAY = 3  # Rate limit per tenant

    async def create_dispute(
        self,
        tenant_user_id: UUID,
        statement_id: UUID,
        category: DisputeCategory,
        description: str,
        db: AsyncSession,
    ) -> Dispute:
        """Create a new dispute with rate limiting."""
        # Get tenant and verify access to statement
        tenant = await db.get(TenantUser, tenant_user_id)
        if not tenant:
            raise PermissionError("Tenant not found")

        # Check rate limit
        if await self._is_rate_limited(tenant_user_id, db):
            raise RateLimitError("Maximum 3 disputes per day exceeded")

        # Verify tenant has access to this statement
        statement = await db.get(ReconciliationSnapshot, statement_id)
        if not statement:
            raise ValueError("Statement not found")

        # Create dispute
        dispute = Dispute(
            tenant_user_id=tenant_user_id,
            statement_id=statement_id,
            organization_id=tenant.organization_id,
            category=category,
            description=description,
            status=DisputeStatus.OPEN,
        )
        db.add(dispute)

        # Create initial comment from description
        initial_comment = DisputeComment(
            dispute_id=dispute.id,
            author_id=tenant.user_id,
            content=description,
            is_internal=False,
        )
        db.add(initial_comment)

        await db.commit()

        # Notify landlord of new dispute
        await self.notification_service.notify_new_dispute(
            organization_id=tenant.organization_id,
            dispute_id=dispute.id,
            tenant_name=tenant.contact_name,
            category=category.value,
            db=db,
        )

        return dispute

    async def _is_rate_limited(self, tenant_user_id: UUID, db: AsyncSession) -> bool:
        """Check if tenant has exceeded daily dispute limit."""
        one_day_ago = datetime.utcnow() - timedelta(days=1)
        result = await db.execute(
            select(func.count()).select_from(Dispute).where(
                Dispute.tenant_user_id == tenant_user_id,
                Dispute.created_at > one_day_ago,
            )
        )
        count = result.scalar() or 0
        return count >= self.MAX_DISPUTES_PER_DAY

    async def add_comment(
        self,
        dispute_id: UUID,
        author_id: UUID,
        content: str,
        is_internal: bool,
        db: AsyncSession,
    ) -> DisputeComment:
        """Add a comment to a dispute."""
        dispute = await db.get(Dispute, dispute_id)
        if not dispute:
            raise ValueError("Dispute not found")

        comment = DisputeComment(
            dispute_id=dispute_id,
            author_id=author_id,
            content=content,
            is_internal=is_internal,
        )
        db.add(comment)
        await db.commit()

        # Notify other party of new comment (unless internal)
        if not is_internal:
            await self._notify_comment(dispute, comment, db)

        return comment

    async def update_status(
        self,
        dispute_id: UUID,
        new_status: DisputeStatus,
        resolution_summary: str | None,
        resolved_by: UUID | None,
        db: AsyncSession,
    ) -> Dispute:
        """Update dispute status with optional resolution."""
        dispute = await db.get(Dispute, dispute_id)
        if not dispute:
            raise ValueError("Dispute not found")

        # Validate state transition
        valid_transitions = {
            DisputeStatus.OPEN: [DisputeStatus.UNDER_REVIEW, DisputeStatus.REJECTED],
            DisputeStatus.UNDER_REVIEW: [DisputeStatus.RESOLVED, DisputeStatus.REJECTED],
            DisputeStatus.RESOLVED: [DisputeStatus.CLOSED],
            DisputeStatus.REJECTED: [DisputeStatus.CLOSED],
        }

        if new_status not in valid_transitions.get(dispute.status, []):
            raise ValueError(f"Cannot transition from {dispute.status} to {new_status}")

        dispute.status = new_status

        if new_status in [DisputeStatus.RESOLVED, DisputeStatus.REJECTED]:
            dispute.resolution_summary = resolution_summary
            dispute.resolved_at = datetime.utcnow()
            dispute.resolved_by = resolved_by

        await db.commit()

        # Notify tenant of status change
        await self.notification_service.notify_dispute_update(
            tenant_user_id=dispute.tenant_user_id,
            dispute_id=dispute.id,
            new_status=new_status.value,
            resolution_summary=resolution_summary,
            db=db,
        )

        return dispute
```

### Dispute API Endpoints

```python
# backend/app/api/v1/tenant/disputes.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from uuid import UUID

router = APIRouter(prefix="/tenant/disputes", tags=["tenant-disputes"])

@router.post("")
async def create_dispute(
    request: CreateDisputeRequest,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeDTO:
    """Create a new dispute for a reconciliation statement."""
    tenant = await get_tenant_user(current_user.id, db)
    try:
        dispute = await dispute_service.create_dispute(
            tenant_user_id=tenant.id,
            statement_id=request.statement_id,
            category=request.category,
            description=request.description,
            db=db,
        )
        return DisputeDTO.from_orm(dispute)
    except RateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))


@router.get("")
async def list_disputes(
    status: DisputeStatus | None = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> list[DisputeSummaryDTO]:
    """List tenant's disputes with optional status filter."""
    tenant = await get_tenant_user(current_user.id, db)

    query = select(Dispute).where(Dispute.tenant_user_id == tenant.id)
    if status:
        query = query.where(Dispute.status == status)

    query = query.order_by(Dispute.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [DisputeSummaryDTO.from_orm(d) for d in result.scalars()]


@router.get("/{dispute_id}")
async def get_dispute(
    dispute_id: UUID,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeDetailDTO:
    """Get dispute details including comments."""
    tenant = await get_tenant_user(current_user.id, db)

    result = await db.execute(
        select(Dispute)
        .options(
            selectinload(Dispute.comments.and_(DisputeComment.is_internal == False)),
            selectinload(Dispute.attachments),
        )
        .where(Dispute.id == dispute_id, Dispute.tenant_user_id == tenant.id)
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    return DisputeDetailDTO.from_orm(dispute)


@router.post("/{dispute_id}/comments")
async def add_comment(
    dispute_id: UUID,
    request: AddCommentRequest,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeCommentDTO:
    """Add a comment to a dispute."""
    tenant = await get_tenant_user(current_user.id, db)

    # Verify tenant owns this dispute
    dispute = await db.execute(
        select(Dispute).where(
            Dispute.id == dispute_id,
            Dispute.tenant_user_id == tenant.id,
        )
    )
    if not dispute.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Dispute not found")

    comment = await dispute_service.add_comment(
        dispute_id=dispute_id,
        author_id=current_user.id,
        content=request.content,
        is_internal=False,  # Tenant comments are never internal
        db=db,
    )
    return DisputeCommentDTO.from_orm(comment)


@router.post("/{dispute_id}/attachments")
async def upload_attachment(
    dispute_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeAttachmentDTO:
    """Upload a supporting document to a dispute."""
    tenant = await get_tenant_user(current_user.id, db)

    # Validate file size (max 10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Validate file type
    ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"]
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="File type not allowed")

    # Upload to storage
    storage_path = f"disputes/{dispute_id}/{uuid4()}/{file.filename}"
    await supabase.storage.from_("dispute-attachments").upload(storage_path, content)

    attachment = DisputeAttachment(
        dispute_id=dispute_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        storage_path=storage_path,
        file_size=len(content),
        mime_type=file.content_type,
    )
    db.add(attachment)
    await db.commit()

    return DisputeAttachmentDTO.from_orm(attachment)
```

### Landlord Admin Endpoints

```python
# backend/app/api/v1/admin/disputes.py
from fastapi import APIRouter, Depends
from uuid import UUID

router = APIRouter(prefix="/admin/disputes", tags=["admin-disputes"])

@router.get("")
async def list_organization_disputes(
    status: DisputeStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DisputeSummaryDTO]:
    """List all disputes for the organization."""
    query = select(Dispute).where(Dispute.organization_id == current_user.organization_id)
    if status:
        query = query.where(Dispute.status == status)

    query = query.order_by(Dispute.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [DisputeSummaryDTO.from_orm(d) for d in result.scalars()]


@router.put("/{dispute_id}/status")
async def update_dispute_status(
    dispute_id: UUID,
    request: UpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeDTO:
    """Update dispute status (admin only)."""
    dispute = await dispute_service.update_status(
        dispute_id=dispute_id,
        new_status=request.status,
        resolution_summary=request.resolution_summary,
        resolved_by=current_user.id,
        db=db,
    )
    return DisputeDTO.from_orm(dispute)


@router.post("/{dispute_id}/comments")
async def add_admin_comment(
    dispute_id: UUID,
    request: AddCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DisputeCommentDTO:
    """Add a comment to a dispute (can be internal)."""
    comment = await dispute_service.add_comment(
        dispute_id=dispute_id,
        author_id=current_user.id,
        content=request.content,
        is_internal=request.is_internal,
        db=db,
    )
    return DisputeCommentDTO.from_orm(comment)
```

### Frontend Dispute Form

```typescript
// frontend/src/features/tenant-portal/components/DisputeForm.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const DISPUTE_CATEGORIES = [
  { value: 'calculation_error', label: 'Calculation Error' },
  { value: 'missing_credit', label: 'Missing Credit' },
  { value: 'incorrect_area', label: 'Incorrect Square Footage' },
  { value: 'base_year_issue', label: 'Base Year Issue' },
  { value: 'billing_question', label: 'Billing Question' },
  { value: 'other', label: 'Other' },
];

interface DisputeFormProps {
  statementId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function DisputeForm({ statementId, onSuccess, onCancel }: DisputeFormProps) {
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { statement_id: string; category: string; description: string }) =>
      api.post('/api/v1/tenant/disputes', data),
    onSuccess: () => {
      toast({ title: 'Dispute submitted', description: 'We will review your dispute shortly.' });
      queryClient.invalidateQueries({ queryKey: ['tenant-disputes'] });
      onSuccess();
    },
    onError: (error: any) => {
      if (error.response?.status === 429) {
        toast({
          title: 'Rate limit exceeded',
          description: 'Maximum 3 disputes per day. Please try again tomorrow.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Error', description: 'Failed to submit dispute', variant: 'destructive' });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !description.trim()) return;

    createMutation.mutate({
      statement_id: statementId,
      category,
      description: description.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {DISPUTE_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe the issue in detail..."
          rows={5}
          required
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={createMutation.isPending || !category || !description.trim()}>
          {createMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
        </Button>
      </div>
    </form>
  );
}
```

### Dispute Detail View

```typescript
// frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  closed: 'bg-gray-100 text-gray-800',
};

export function DisputeDetailPage() {
  const { disputeId } = useParams<{ disputeId: string }>();
  const [newComment, setNewComment] = useState('');
  const queryClient = useQueryClient();

  const { data: dispute, isLoading } = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => api.get(`/api/v1/tenant/disputes/${disputeId}`).then(res => res.data),
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/api/v1/tenant/disputes/${disputeId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] });
      setNewComment('');
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (!dispute) return <div>Dispute not found</div>;

  const canComment = ['open', 'under_review'].includes(dispute.status);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Dispute #{dispute.id.slice(0, 8)}</h1>
          <p className="text-gray-500">{dispute.category.replace('_', ' ')}</p>
        </div>
        <Badge className={STATUS_COLORS[dispute.status]}>
          {dispute.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Resolution Summary (if resolved) */}
      {dispute.resolution_summary && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-medium text-green-800">Resolution</h3>
          <p className="mt-1 text-green-700">{dispute.resolution_summary}</p>
        </div>
      )}

      {/* Comment Thread */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Discussion</h2>
        {dispute.comments.map((comment: any) => (
          <div key={comment.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <span className="font-medium">{comment.author_name}</span>
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="mt-2 text-gray-700">{comment.content}</p>
          </div>
        ))}
      </div>

      {/* Add Comment Form */}
      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
          <Button
            onClick={() => addCommentMutation.mutate(newComment)}
            disabled={!newComment.trim() || addCommentMutation.isPending}
          >
            {addCommentMutation.isPending ? 'Sending...' : 'Send Comment'}
          </Button>
        </div>
      )}

      {/* Attachments */}
      {dispute.attachments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Attachments</h2>
          {dispute.attachments.map((attachment: any) => (
            <a
              key={attachment.id}
              href={attachment.download_url}
              className="flex items-center gap-2 text-blue-600 hover:underline"
              target="_blank"
              rel="noopener"
            >
              {attachment.filename} ({(attachment.file_size / 1024).toFixed(1)} KB)
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Test Cases

Test dispute workflow including:
- Create dispute with category and description
- Rate limiting blocks after 3 disputes/day
- Landlord receives notification of new dispute
- Add comment to dispute thread
- Tenant cannot see internal comments
- Upload attachment (PDF, JPG, PNG only, max 10MB)
- Status transitions follow state machine
- Tenant receives notification of status change
- Resolution summary visible when resolved
- Closed disputes cannot receive new comments

## Definition of Done
- [ ] Dispute form works
- [ ] Categories display
- [ ] Landlord notifications sent
- [ ] Status tracking works
- [ ] Threaded comments work
- [ ] Unit tests passing with 95%+ coverage
