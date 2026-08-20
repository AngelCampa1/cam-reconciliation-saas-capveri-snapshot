# Story 19.3: Create Tenant Notification System

## Story Info
- **Epic**: Tenant Portal
- **Estimated Hours**: 2
- **Dependencies**: Story 19.1, Story 19.2
- **Status**: `pending`

## User Story
Implement email notifications when new reconciliation statements are available for tenants.

## Acceptance Criteria
- [ ] Email sent when reconciliation is finalized and visible to tenant
- [ ] Email includes summary (year, property, net amount)
- [ ] Link to tenant portal in email
- [ ] In-app notification badge
- [ ] Mark notifications as read
- [ ] Email preferences (can opt out)
- [ ] Email template matches brand
- [ ] Rate limiting to prevent spam

## Technical Specifications

Email notification system with in-app notifications, preferences, and rate limiting.

**Reference**: See `docs/architecture/tenant-portal-architecture.md` for full notification patterns.

### Notification Models

```python
# backend/app/models/tenant_notification.py
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum

class NotificationType(str, Enum):
    NEW_STATEMENT = "new_statement"
    DISPUTE_UPDATE = "dispute_update"
    STATEMENT_REMINDER = "statement_reminder"
    SYSTEM = "system"

class TenantNotification(Base):
    """In-app notifications for tenant users."""
    __tablename__ = "tenant_notifications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_user_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_users.id"), nullable=False)
    notification_type: Mapped[NotificationType] = mapped_column(SQLEnum(NotificationType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    related_entity_id: Mapped[UUID | None] = mapped_column(nullable=True)  # e.g., statement_id
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TenantEmailPreferences(Base):
    """Email notification preferences per tenant."""
    __tablename__ = "tenant_email_preferences"

    tenant_user_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_users.id"), primary_key=True)
    new_statement_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    dispute_update_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    marketing_emails: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Email Service (Resend Integration)

```python
# backend/app/services/email/resend_service.py
import resend
from datetime import datetime
from pydantic import BaseModel

class EmailService:
    """Email sending via Resend API."""

    def __init__(self, api_key: str, from_address: str):
        resend.api_key = api_key
        self.from_address = from_address

    async def send_new_statement_notification(
        self,
        to_email: str,
        tenant_name: str,
        property_name: str,
        period: str,
        amount: str,
        portal_url: str,
    ) -> None:
        """Send email when new reconciliation statement is available."""
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>New CAM Reconciliation Statement Available</h2>
            <p>Hello {tenant_name},</p>
            <p>A new reconciliation statement is available for your review:</p>
            <ul>
                <li><strong>Property:</strong> {property_name}</li>
                <li><strong>Period:</strong> {period}</li>
                <li><strong>Your Share:</strong> {amount}</li>
            </ul>
            <p>
                <a href="{portal_url}" style="background-color: #2563eb; color: white;
                   padding: 12px 24px; text-decoration: none; border-radius: 4px;
                   display: inline-block;">View Statement</a>
            </p>
            <p style="color: #666; font-size: 12px;">
                If you have questions about this statement, you can submit a dispute
                through the tenant portal.
            </p>
        </div>
        """

        resend.Emails.send({
            "from": self.from_address,
            "to": to_email,
            "subject": f"New CAM Statement Available - {property_name}",
            "html": html_content,
        })

    async def send_tenant_invitation(
        self,
        to_email: str,
        invitation_token: str,
        expires_at: datetime,
    ) -> None:
        """Send invitation email for tenant portal signup."""
        signup_url = f"https://app.capveri.com/tenant/signup?token={invitation_token}"

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You're Invited to CapVeri Tenant Portal</h2>
            <p>You've been invited to access your CAM reconciliation statements online.</p>
            <p>
                <a href="{signup_url}" style="background-color: #2563eb; color: white;
                   padding: 12px 24px; text-decoration: none; border-radius: 4px;
                   display: inline-block;">Create Your Account</a>
            </p>
            <p style="color: #666; font-size: 12px;">
                This invitation expires on {expires_at.strftime('%B %d, %Y')}.
            </p>
        </div>
        """

        resend.Emails.send({
            "from": self.from_address,
            "to": to_email,
            "subject": "You're Invited to CapVeri Tenant Portal",
            "html": html_content,
        })
```

### Notification Service with Rate Limiting

```python
# backend/app/services/tenant/notification_service.py
from datetime import datetime, timedelta
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

class TenantNotificationService:
    """Manages in-app and email notifications for tenants."""

    MAX_EMAILS_PER_HOUR = 10  # Rate limit per tenant

    def __init__(self, email_service: EmailService):
        self.email_service = email_service

    async def notify_new_statement(
        self,
        tenant_user_id: UUID,
        statement_id: UUID,
        property_name: str,
        period: str,
        amount: str,
        db: AsyncSession,
    ) -> None:
        """Create notification and optionally send email for new statement."""
        # Create in-app notification
        notification = TenantNotification(
            tenant_user_id=tenant_user_id,
            notification_type=NotificationType.NEW_STATEMENT,
            title=f"New Statement: {property_name}",
            message=f"Your {period} reconciliation statement is ready. Amount: {amount}",
            link_url=f"/tenant/statements/{statement_id}",
            related_entity_id=statement_id,
        )
        db.add(notification)

        # Check email preferences
        prefs = await self._get_email_preferences(tenant_user_id, db)
        if not prefs.new_statement_emails:
            await db.commit()
            return

        # Check rate limit
        if await self._is_rate_limited(tenant_user_id, db):
            await db.commit()
            return

        # Get tenant email
        tenant = await db.get(TenantUser, tenant_user_id)

        # Send email
        await self.email_service.send_new_statement_notification(
            to_email=tenant.contact_email,
            tenant_name=tenant.contact_name,
            property_name=property_name,
            period=period,
            amount=amount,
            portal_url=f"https://app.capveri.com/tenant/statements/{statement_id}",
        )

        await db.commit()

    async def _is_rate_limited(self, tenant_user_id: UUID, db: AsyncSession) -> bool:
        """Check if tenant has exceeded email rate limit."""
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        result = await db.execute(
            select(func.count()).select_from(EmailLog).where(
                EmailLog.tenant_user_id == tenant_user_id,
                EmailLog.sent_at > one_hour_ago,
            )
        )
        count = result.scalar() or 0
        return count >= self.MAX_EMAILS_PER_HOUR

    async def _get_email_preferences(
        self, tenant_user_id: UUID, db: AsyncSession
    ) -> TenantEmailPreferences:
        """Get or create default email preferences."""
        result = await db.execute(
            select(TenantEmailPreferences).where(
                TenantEmailPreferences.tenant_user_id == tenant_user_id
            )
        )
        prefs = result.scalar_one_or_none()
        if not prefs:
            prefs = TenantEmailPreferences(tenant_user_id=tenant_user_id)
            db.add(prefs)
        return prefs

    async def mark_as_read(
        self, notification_id: UUID, tenant_user_id: UUID, db: AsyncSession
    ) -> None:
        """Mark a notification as read."""
        result = await db.execute(
            select(TenantNotification).where(
                TenantNotification.id == notification_id,
                TenantNotification.tenant_user_id == tenant_user_id,
            )
        )
        notification = result.scalar_one_or_none()
        if notification:
            notification.read_at = datetime.utcnow()
            await db.commit()

    async def mark_all_as_read(self, tenant_user_id: UUID, db: AsyncSession) -> int:
        """Mark all notifications as read for a tenant."""
        result = await db.execute(
            update(TenantNotification)
            .where(
                TenantNotification.tenant_user_id == tenant_user_id,
                TenantNotification.read_at.is_(None),
            )
            .values(read_at=datetime.utcnow())
        )
        await db.commit()
        return result.rowcount
```

### Notification API Endpoints

```python
# backend/app/api/v1/tenant/notifications.py
from fastapi import APIRouter, Depends
from uuid import UUID

router = APIRouter(prefix="/tenant/notifications", tags=["tenant-notifications"])

@router.get("")
async def list_notifications(
    unread_only: bool = False,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> list[TenantNotificationDTO]:
    """List notifications for current tenant."""
    tenant = await get_tenant_user(current_user.id, db)

    query = select(TenantNotification).where(
        TenantNotification.tenant_user_id == tenant.id
    )
    if unread_only:
        query = query.where(TenantNotification.read_at.is_(None))

    query = query.order_by(TenantNotification.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return [TenantNotificationDTO.from_orm(n) for n in result.scalars()]


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a single notification as read."""
    tenant = await get_tenant_user(current_user.id, db)
    await notification_service.mark_as_read(notification_id, tenant.id, db)
    return {"status": "ok"}


@router.post("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark all notifications as read."""
    tenant = await get_tenant_user(current_user.id, db)
    count = await notification_service.mark_all_as_read(tenant.id, db)
    return {"marked_read": count}


@router.get("/preferences")
async def get_email_preferences(
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> TenantEmailPreferencesDTO:
    """Get current email notification preferences."""
    tenant = await get_tenant_user(current_user.id, db)
    prefs = await notification_service._get_email_preferences(tenant.id, db)
    return TenantEmailPreferencesDTO.from_orm(prefs)


@router.put("/preferences")
async def update_email_preferences(
    preferences: TenantEmailPreferencesUpdate,
    current_user: User = Depends(get_current_tenant_user),
    db: AsyncSession = Depends(get_db),
) -> TenantEmailPreferencesDTO:
    """Update email notification preferences."""
    tenant = await get_tenant_user(current_user.id, db)
    prefs = await notification_service._get_email_preferences(tenant.id, db)

    for field, value in preferences.dict(exclude_unset=True).items():
        setattr(prefs, field, value)

    await db.commit()
    return TenantEmailPreferencesDTO.from_orm(prefs)
```

### Frontend Notification Components

```typescript
// frontend/src/features/tenant-portal/components/NotificationList.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Check, CheckCheck } from 'lucide-react';

interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationList() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['tenant-notifications'],
    queryFn: () => api.get('/api/v1/tenant/notifications').then(res => res.data),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/tenant/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/api/v1/tenant/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-notifications'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  const unreadCount = notifications?.filter(n => !n.read_at).length || 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Notifications</h2>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications?.map((notification) => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg border ${
              notification.read_at ? 'bg-white' : 'bg-blue-50 border-blue-200'
            }`}
            onClick={() => {
              if (!notification.read_at) {
                markReadMutation.mutate(notification.id);
              }
              if (notification.link_url) {
                window.location.href = notification.link_url;
              }
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{notification.title}</p>
                <p className="text-sm text-gray-600">{notification.message}</p>
              </div>
              {!notification.read_at && (
                <span className="h-2 w-2 bg-blue-500 rounded-full" />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}

        {notifications?.length === 0 && (
          <p className="text-gray-500 text-center py-8">No notifications yet</p>
        )}
      </div>
    </div>
  );
}
```

### Email Preferences Component

```typescript
// frontend/src/features/tenant-portal/components/EmailPreferences.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface EmailPreferences {
  new_statement_emails: boolean;
  dispute_update_emails: boolean;
  reminder_emails: boolean;
  marketing_emails: boolean;
}

export function EmailPreferences() {
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery<EmailPreferences>({
    queryKey: ['tenant-email-preferences'],
    queryFn: () => api.get('/api/v1/tenant/notifications/preferences').then(res => res.data),
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<EmailPreferences>) =>
      api.put('/api/v1/tenant/notifications/preferences', updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-email-preferences'] }),
  });

  if (isLoading || !prefs) return <div>Loading...</div>;

  const togglePreference = (key: keyof EmailPreferences) => {
    updateMutation.mutate({ [key]: !prefs[key] });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Email Preferences</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="new_statement_emails">
            <span className="font-medium">New Statement Notifications</span>
            <p className="text-sm text-gray-500">
              Receive an email when a new CAM statement is available
            </p>
          </Label>
          <Switch
            id="new_statement_emails"
            checked={prefs.new_statement_emails}
            onCheckedChange={() => togglePreference('new_statement_emails')}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="dispute_update_emails">
            <span className="font-medium">Dispute Updates</span>
            <p className="text-sm text-gray-500">
              Receive an email when your dispute status changes
            </p>
          </Label>
          <Switch
            id="dispute_update_emails"
            checked={prefs.dispute_update_emails}
            onCheckedChange={() => togglePreference('dispute_update_emails')}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="reminder_emails">
            <span className="font-medium">Payment Reminders</span>
            <p className="text-sm text-gray-500">
              Receive reminder emails for pending statements
            </p>
          </Label>
          <Switch
            id="reminder_emails"
            checked={prefs.reminder_emails}
            onCheckedChange={() => togglePreference('reminder_emails')}
          />
        </div>
      </div>
    </div>
  );
}
```

## Test Cases

Test notification system including:
- In-app notification created when statement is finalized
- Email sent when preferences allow and not rate-limited
- Rate limiting blocks emails after 10/hour threshold
- Mark single notification as read
- Mark all notifications as read
- Email preferences respected (opt-out works)
- Email template renders correctly
- Resend API integration works
- Notification list pagination works

## Definition of Done
- [ ] Notification service sends emails
- [ ] In-app notifications created
- [ ] Read status tracks
- [ ] Preferences respected
- [ ] Rate limiting works
- [ ] Unit tests passing with 95%+ coverage
