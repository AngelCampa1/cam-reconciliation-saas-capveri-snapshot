# Tenant Portal Architecture

## Overview

This document defines the architecture for the tenant-facing portal, including authentication, dashboard, notifications, and dispute workflow.

## Authentication Flow

### User Roles

```sql
-- Migration: Add tenant role support
ALTER TYPE user_role ADD VALUE 'tenant';

-- Tenant-to-lease linking table
CREATE TABLE tenant_lease_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID NOT NULL REFERENCES auth.users(id),
    CONSTRAINT unique_tenant_lease UNIQUE (user_id, lease_id)
);

-- RLS: Tenants can only see their linked leases
CREATE POLICY "Tenant lease access" ON leases
FOR SELECT
USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    OR
    id IN (SELECT lease_id FROM tenant_lease_access WHERE user_id = auth.uid())
);
```

### Invitation System

```python
# backend/app/services/tenant/invitations.py
from datetime import datetime, timedelta
from uuid import UUID
import secrets

class TenantInvitationService:
    """Manage tenant invitation tokens."""

    TOKEN_EXPIRY_DAYS = 7

    async def create_invitation(
        self,
        email: str,
        lease_id: UUID,
        invited_by: UUID,
        db: AsyncSession,
    ) -> TenantInvitation:
        """Create invitation token for new tenant user."""
        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(days=self.TOKEN_EXPIRY_DAYS)

        invitation = TenantInvitation(
            email=email,
            lease_id=lease_id,
            token=token,
            expires_at=expires_at,
            invited_by=invited_by,
            status='pending',
        )
        db.add(invitation)
        await db.commit()

        # Send invitation email
        await self.email_service.send_tenant_invitation(
            to_email=email,
            invitation_url=f"{settings.FRONTEND_URL}/tenant/accept-invite?token={token}",
            property_name=await self._get_property_name(lease_id, db),
            expires_at=expires_at,
        )

        return invitation

    async def accept_invitation(
        self,
        token: str,
        password: str,
        db: AsyncSession,
    ) -> User:
        """Accept invitation and create tenant user account."""
        invitation = await db.execute(
            select(TenantInvitation)
            .where(TenantInvitation.token == token)
            .where(TenantInvitation.status == 'pending')
            .where(TenantInvitation.expires_at > datetime.utcnow())
        )
        invitation = invitation.scalar_one_or_none()

        if not invitation:
            raise InvalidInvitationError("Invalid or expired invitation")

        # Create Supabase user with tenant role
        user = await supabase.auth.admin.create_user({
            "email": invitation.email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"role": "tenant"},
        })

        # Create user record with tenant role
        user_record = User(
            id=user.id,
            email=invitation.email,
            role='tenant',
            organization_id=None,  # Tenants don't belong to organizations
        )
        db.add(user_record)

        # Link tenant to lease
        access = TenantLeaseAccess(
            user_id=user.id,
            lease_id=invitation.lease_id,
            granted_by=invitation.invited_by,
        )
        db.add(access)

        # Mark invitation as accepted
        invitation.status = 'accepted'
        invitation.accepted_at = datetime.utcnow()

        await db.commit()
        return user_record
```

### RLS Policies

```sql
-- Tenants can only see reconciliation snapshots for their leases
CREATE POLICY "Tenant reconciliation access" ON reconciliation_snapshots
FOR SELECT
USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
        SELECT 1 FROM tenant_lease_access tla
        JOIN leases l ON l.id = tla.lease_id
        WHERE tla.user_id = auth.uid()
        AND l.property_id = reconciliation_snapshots.property_id
    )
);

-- Tenants can only see their own notifications
CREATE POLICY "Tenant notification access" ON notifications
FOR SELECT
USING (user_id = auth.uid());

-- Tenants can only see disputes they created
CREATE POLICY "Tenant dispute access" ON disputes
FOR SELECT
USING (
    created_by = auth.uid()
    OR
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);
```

## Tenant Dashboard

### Dashboard API

```python
# backend/app/api/v1/tenant.py
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/tenant", tags=["tenant"])

@router.get("/dashboard", response_model=TenantDashboard)
async def get_tenant_dashboard(
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tenant dashboard data."""
    # Get all leases for this tenant
    leases = await db.execute(
        select(Lease)
        .join(TenantLeaseAccess)
        .where(TenantLeaseAccess.user_id == current_user.id)
        .options(joinedload(Lease.unit), joinedload(Lease.unit.property))
    )
    leases = leases.scalars().all()

    # Get recent reconciliation statements
    statements = await db.execute(
        select(ReconciliationSnapshot)
        .where(ReconciliationSnapshot.property_id.in_(
            [l.unit.property_id for l in leases]
        ))
        .where(ReconciliationSnapshot.is_finalized == True)
        .order_by(ReconciliationSnapshot.created_at.desc())
        .limit(10)
    )

    # Get unread notification count
    unread_count = await db.execute(
        select(func.count(Notification.id))
        .where(Notification.user_id == current_user.id)
        .where(Notification.read_at.is_(None))
    )

    return TenantDashboard(
        leases=[LeaseOverview.from_orm(l) for l in leases],
        recent_statements=[StatementSummary.from_orm(s) for s in statements],
        unread_notifications=unread_count.scalar(),
    )
```

### Frontend Dashboard Components

```typescript
// frontend/src/features/tenant/pages/TenantDashboard.tsx
export function TenantDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['tenant-dashboard'],
    queryFn: () => api.getTenantDashboard(),
  });

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with notification badge */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">My Properties</h1>
        <NotificationBell count={dashboard.unread_notifications} />
      </div>

      {/* Lease cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {dashboard.leases.map((lease) => (
          <LeaseCard key={lease.id} lease={lease} />
        ))}
      </div>

      {/* Recent statements */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Statements</CardTitle>
        </CardHeader>
        <CardContent>
          <StatementList statements={dashboard.recent_statements} />
        </CardContent>
      </Card>
    </div>
  );
}

// frontend/src/features/tenant/components/LeaseCard.tsx
function LeaseCard({ lease }: { lease: LeaseOverview }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>{lease.property_name}</CardTitle>
            <CardDescription>Unit {lease.unit_number}</CardDescription>
          </div>
          <Badge variant={lease.status === 'active' ? 'default' : 'secondary'}>
            {lease.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Lease Term:</span>
          <span>{formatDateRange(lease.start_date, lease.end_date)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pro-Rata Share:</span>
          <span>{(lease.pro_rata_share * 100).toFixed(2)}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Square Feet:</span>
          <span>{lease.square_feet.toLocaleString()} SF</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full" asChild>
          <Link to={`/tenant/lease/${lease.id}`}>View Details</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## Notification System

### Email via Resend

```python
# backend/app/services/notifications/email.py
import resend
from app.core.config import settings

resend.api_key = settings.RESEND_API_KEY

class EmailNotificationService:
    """Send email notifications via Resend."""

    async def send_reconciliation_ready(
        self,
        to_email: str,
        tenant_name: str,
        property_name: str,
        year: int,
        net_amount: Decimal,
        portal_url: str,
    ):
        """Notify tenant of new reconciliation statement."""
        await resend.Emails.send({
            "from": "CapVeri <angel.campa@capveri.com>",
            "to": to_email,
            "subject": f"Your {year} CAM Reconciliation is Ready - {property_name}",
            "html": render_template("reconciliation_ready.html", {
                "tenant_name": tenant_name,
                "property_name": property_name,
                "year": year,
                "net_amount": net_amount,
                "portal_url": portal_url,
            }),
        })

    async def send_dispute_update(
        self,
        to_email: str,
        dispute_id: UUID,
        new_status: str,
        resolution_summary: str | None,
    ):
        """Notify tenant of dispute status change."""
        await resend.Emails.send({
            "from": "CapVeri <angel.campa@capveri.com>",
            "to": to_email,
            "subject": f"Dispute Update - {new_status}",
            "html": render_template("dispute_update.html", {
                "dispute_id": dispute_id,
                "new_status": new_status,
                "resolution_summary": resolution_summary,
            }),
        })
```

### In-App Notifications

```python
# backend/app/models/notification.py
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str]  # 'reconciliation_ready', 'dispute_update', 'system'
    title: Mapped[str]
    message: Mapped[str]
    link: Mapped[str | None]  # URL to navigate to
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

# backend/app/services/notifications/in_app.py
class InAppNotificationService:
    """Manage in-app notifications."""

    async def create_notification(
        self,
        user_id: UUID,
        type: str,
        title: str,
        message: str,
        link: str | None = None,
        db: AsyncSession,
    ) -> Notification:
        """Create in-app notification."""
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link=link,
        )
        db.add(notification)
        await db.commit()
        return notification

    async def mark_as_read(
        self,
        notification_ids: list[UUID],
        user_id: UUID,
        db: AsyncSession,
    ):
        """Mark notifications as read."""
        await db.execute(
            update(Notification)
            .where(Notification.id.in_(notification_ids))
            .where(Notification.user_id == user_id)
            .values(read_at=datetime.utcnow())
        )
        await db.commit()
```

### Rate Limiting

```python
# backend/app/services/notifications/rate_limiter.py
from redis import Redis

class NotificationRateLimiter:
    """Prevent notification spam."""

    MAX_EMAILS_PER_HOUR = 10
    MAX_DISPUTES_PER_DAY = 3

    def __init__(self, redis: Redis):
        self.redis = redis

    def can_send_email(self, user_id: UUID) -> bool:
        """Check if user can receive email notification."""
        key = f"email_rate:{user_id}"
        count = self.redis.get(key)
        return count is None or int(count) < self.MAX_EMAILS_PER_HOUR

    def record_email_sent(self, user_id: UUID):
        """Record email sent for rate limiting."""
        key = f"email_rate:{user_id}"
        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 3600)  # 1 hour
        pipe.execute()

    def can_create_dispute(self, user_id: UUID) -> bool:
        """Check if user can create new dispute."""
        key = f"dispute_rate:{user_id}"
        count = self.redis.get(key)
        return count is None or int(count) < self.MAX_DISPUTES_PER_DAY

    def record_dispute_created(self, user_id: UUID):
        """Record dispute created for rate limiting."""
        key = f"dispute_rate:{user_id}"
        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 86400)  # 24 hours
        pipe.execute()
```

## Dispute Workflow

### Dispute State Machine

```
                ┌──────────┐
                │   OPEN   │ ◄── Tenant submits
                └────┬─────┘
                     │
                     │ Landlord acknowledges
                     ▼
            ┌────────────────┐
            │  UNDER_REVIEW  │
            └────────┬───────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌────────────────┐      ┌────────────────┐
│    RESOLVED    │      │    REJECTED    │
│ (credit issued)│      │ (with reason)  │
└────────────────┘      └────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
               ┌──────────┐
               │  CLOSED  │
               └──────────┘
```

### Dispute Model

```python
# backend/app/models/dispute.py
from enum import Enum

class DisputeStatus(str, Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    REJECTED = "rejected"
    CLOSED = "closed"

class DisputeCategory(str, Enum):
    CALCULATION_ERROR = "calculation_error"
    MISSING_EXCLUSION = "missing_exclusion"
    INCORRECT_SQUARE_FOOTAGE = "incorrect_square_footage"
    BASE_YEAR_DISPUTE = "base_year_dispute"
    CAP_CALCULATION = "cap_calculation"
    OTHER = "other"

class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    reconciliation_id: Mapped[UUID] = mapped_column(ForeignKey("reconciliation_snapshots.id"))
    lease_id: Mapped[UUID] = mapped_column(ForeignKey("leases.id"))
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))

    category: Mapped[DisputeCategory]
    description: Mapped[str]
    status: Mapped[DisputeStatus] = mapped_column(default=DisputeStatus.OPEN)

    # Resolution tracking
    assigned_to: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    resolution_summary: Mapped[str | None]
    credit_amount: Mapped[Decimal | None]

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(onupdate=datetime.utcnow)
    closed_at: Mapped[datetime | None]

class DisputeComment(Base):
    __tablename__ = "dispute_comments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dispute_id: Mapped[UUID] = mapped_column(ForeignKey("disputes.id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str]
    is_internal: Mapped[bool] = mapped_column(default=False)  # Hidden from tenant
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

class DisputeAttachment(Base):
    __tablename__ = "dispute_attachments"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    dispute_id: Mapped[UUID] = mapped_column(ForeignKey("disputes.id"))
    uploaded_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str]
    storage_path: Mapped[str]
    file_size: Mapped[int]
    mime_type: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

### Dispute API

```python
# backend/app/api/v1/disputes.py
@router.post("/", response_model=DisputeResponse)
async def create_dispute(
    request: CreateDisputeRequest,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
    rate_limiter: NotificationRateLimiter = Depends(get_rate_limiter),
):
    """Create a new dispute (tenant only)."""
    # Check rate limit
    if not rate_limiter.can_create_dispute(current_user.id):
        raise HTTPException(
            status_code=429,
            detail="Maximum 3 disputes per day. Please try again tomorrow."
        )

    # Verify tenant has access to this lease
    has_access = await db.execute(
        select(TenantLeaseAccess)
        .where(TenantLeaseAccess.user_id == current_user.id)
        .where(TenantLeaseAccess.lease_id == request.lease_id)
    )
    if not has_access.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    # Create dispute
    dispute = Dispute(
        reconciliation_id=request.reconciliation_id,
        lease_id=request.lease_id,
        created_by=current_user.id,
        category=request.category,
        description=request.description,
    )
    db.add(dispute)
    await db.flush()

    # Handle file uploads
    if request.attachments:
        for file in request.attachments:
            attachment = await self._save_attachment(dispute.id, file, current_user.id)
            db.add(attachment)

    await db.commit()

    # Record rate limit
    rate_limiter.record_dispute_created(current_user.id)

    # Notify landlord
    await notification_service.notify_new_dispute(dispute)

    return DisputeResponse.from_orm(dispute)

@router.post("/{dispute_id}/comments", response_model=CommentResponse)
async def add_comment(
    dispute_id: UUID,
    request: AddCommentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add comment to dispute thread."""
    dispute = await db.get(Dispute, dispute_id)
    if not dispute:
        raise HTTPException(status_code=404)

    # Tenants can only comment on their own disputes
    if current_user.role == 'tenant' and dispute.created_by != current_user.id:
        raise HTTPException(status_code=403)

    comment = DisputeComment(
        dispute_id=dispute_id,
        user_id=current_user.id,
        content=request.content,
        is_internal=request.is_internal and current_user.role == 'admin',
    )
    db.add(comment)
    await db.commit()

    # Notify other party
    await notification_service.notify_dispute_comment(dispute, comment)

    return CommentResponse.from_orm(comment)
```

### Frontend Dispute Components

```typescript
// frontend/src/features/tenant/components/DisputeForm.tsx
const DISPUTE_CATEGORIES = [
  { value: 'calculation_error', label: 'Calculation Error' },
  { value: 'missing_exclusion', label: 'Missing Exclusion' },
  { value: 'incorrect_square_footage', label: 'Incorrect Square Footage' },
  { value: 'base_year_dispute', label: 'Base Year Issue' },
  { value: 'cap_calculation', label: 'Cap Calculation' },
  { value: 'other', label: 'Other' },
] as const;

export function DisputeForm({
  reconciliationId,
  leaseId,
  onSuccess,
}: DisputeFormProps) {
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const createMutation = useMutation({
    mutationFn: (data: CreateDisputeRequest) => api.createDispute(data),
    onSuccess: () => {
      toast.success('Dispute submitted successfully');
      onSuccess();
    },
    onError: (error: any) => {
      if (error.response?.status === 429) {
        toast.error('Rate limit exceeded. Max 3 disputes per day.');
      } else {
        toast.error('Failed to submit dispute');
      }
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Select category..." />
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
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail..."
          rows={4}
        />
      </div>

      <div>
        <Label>Supporting Documents (Optional)</Label>
        <FileUpload
          accept=".pdf,.jpg,.png"
          maxFiles={3}
          maxSize={5 * 1024 * 1024} // 5MB
          onFilesChange={setFiles}
        />
      </div>

      <Button
        type="submit"
        disabled={!category || !description || createMutation.isPending}
      >
        {createMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
      </Button>
    </form>
  );
}
```

## File Structure

```
backend/app/
├── api/v1/
│   ├── tenant.py           # Tenant dashboard API
│   └── disputes.py         # Dispute API
├── models/
│   ├── tenant_invitation.py
│   ├── tenant_lease_access.py
│   ├── notification.py
│   ├── dispute.py
│   └── dispute_comment.py
├── services/
│   ├── tenant/
│   │   └── invitations.py  # Invitation service
│   └── notifications/
│       ├── email.py        # Resend integration
│       ├── in_app.py       # In-app notifications
│       └── rate_limiter.py # Rate limiting

frontend/src/features/tenant/
├── pages/
│   ├── TenantDashboard.tsx
│   ├── LeaseDetail.tsx
│   ├── StatementDetail.tsx
│   └── DisputeDetail.tsx
├── components/
│   ├── LeaseCard.tsx
│   ├── StatementList.tsx
│   ├── NotificationBell.tsx
│   ├── DisputeForm.tsx
│   └── DisputeThread.tsx
└── hooks/
    ├── useTenantDashboard.ts
    └── useDisputes.ts
```

## Dependencies

Add to `backend/requirements.txt`:
```
resend>=0.7.0
```

Ensure `RESEND_API_KEY` is set in environment.
