# Story 19.1: Create Tenant User Role and Auth Flow

## Story Info
- **Epic**: Tenant Portal
- **Estimated Hours**: 3
- **Dependencies**: None
- **Status**: `pending`

## User Story
Implement separate authentication flow for tenant users with restricted permissions.

## Acceptance Criteria
- [ ] New `tenant` role in user roles enum
- [ ] Tenant users linked to specific lease(s)
- [ ] Tenant login page separate from admin login
- [ ] Tenant signup via invitation link only (no self-registration)
- [ ] Invitation email with secure token
- [ ] Token expiration (7 days default)
- [ ] Tenant can reset password
- [ ] RLS policy enforces tenant can only see their lease data
- [ ] Tenant JWT has `role: tenant` claim

## Technical Specifications

Separate tenant authentication flow with RLS policies, invitation tokens, and secure password handling.

**Reference**: See `docs/architecture/tenant-portal-architecture.md` for full authentication patterns.

### User Role Extension

```python
# backend/app/models/enums.py
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"
    TENANT = "tenant"  # New role for tenant portal users
```

### Tenant User Model

```python
# backend/app/models/tenant_user.py
from sqlalchemy import ForeignKey, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from datetime import datetime
from uuid import UUID

class TenantUser(Base):
    """Tenant portal user linked to specific leases."""
    __tablename__ = "tenant_users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="tenant_profile")
    lease_links: Mapped[list["TenantLeaseLink"]] = relationship(back_populates="tenant_user")


class TenantLeaseLink(Base):
    """Links tenant users to their leases (supports multi-lease tenants)."""
    __tablename__ = "tenant_lease_links"

    tenant_user_id: Mapped[UUID] = mapped_column(ForeignKey("tenant_users.id"), primary_key=True)
    lease_id: Mapped[UUID] = mapped_column(ForeignKey("leases.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

### Invitation Token System

```python
# backend/app/models/tenant_invitation.py
from sqlalchemy import String, DateTime, Boolean, ForeignKey
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import secrets

class TenantInvitation(Base):
    """Secure invitation tokens for tenant signup."""
    __tablename__ = "tenant_invitations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    lease_id: Mapped[UUID] = mapped_column(ForeignKey("leases.id"), nullable=False)
    invited_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# backend/app/services/tenant/invitation_service.py
class TenantInvitationService:
    TOKEN_EXPIRY_DAYS = 7

    async def create_invitation(
        self,
        email: str,
        lease_id: UUID,
        invited_by: UUID,
        organization_id: UUID,
        db: AsyncSession,
    ) -> TenantInvitation:
        """Create invitation and send email."""
        # Check for existing unused invitation
        existing = await db.execute(
            select(TenantInvitation).where(
                TenantInvitation.email == email,
                TenantInvitation.lease_id == lease_id,
                TenantInvitation.used_at.is_(None),
                TenantInvitation.is_revoked == False,
                TenantInvitation.expires_at > datetime.utcnow(),
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Active invitation already exists for this email and lease")

        invitation = TenantInvitation(
            email=email,
            token=secrets.token_urlsafe(32),
            lease_id=lease_id,
            invited_by=invited_by,
            organization_id=organization_id,
            expires_at=datetime.utcnow() + timedelta(days=self.TOKEN_EXPIRY_DAYS),
        )
        db.add(invitation)
        await db.commit()

        # Send invitation email
        await self.email_service.send_tenant_invitation(
            to_email=email,
            invitation_token=invitation.token,
            expires_at=invitation.expires_at,
        )

        return invitation

    async def validate_token(self, token: str, db: AsyncSession) -> TenantInvitation:
        """Validate invitation token."""
        result = await db.execute(
            select(TenantInvitation).where(TenantInvitation.token == token)
        )
        invitation = result.scalar_one_or_none()

        if not invitation:
            raise InvalidTokenError("Invalid invitation token")
        if invitation.is_revoked:
            raise InvalidTokenError("Invitation has been revoked")
        if invitation.used_at:
            raise InvalidTokenError("Invitation has already been used")
        if invitation.expires_at < datetime.utcnow():
            raise InvalidTokenError("Invitation has expired")

        return invitation
```

### RLS Policies (SQL Migration)

```sql
-- supabase/migrations/YYYYMMDD_tenant_rls_policies.sql

-- Tenant users can only see their own profile
CREATE POLICY "tenant_user_self_access" ON tenant_users
FOR SELECT USING (
    user_id = auth.uid() OR
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

-- Tenants can only see leases they're linked to
CREATE POLICY "tenant_lease_access" ON leases
FOR SELECT USING (
    -- Organization admins can see all
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR
    -- Tenants can only see their linked leases
    id IN (
        SELECT tll.lease_id FROM tenant_lease_links tll
        JOIN tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = auth.uid()
    )
);

-- Tenants can only see reconciliation data for their leases
CREATE POLICY "tenant_reconciliation_access" ON reconciliation_snapshots
FOR SELECT USING (
    -- Organization admins
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR
    -- Tenants via lease links
    property_id IN (
        SELECT l.property_id FROM leases l
        JOIN tenant_lease_links tll ON tll.lease_id = l.id
        JOIN tenant_users tu ON tu.id = tll.tenant_user_id
        WHERE tu.user_id = auth.uid()
    )
);
```

### Tenant Login Page (Frontend)

```typescript
// frontend/src/features/tenant-portal/pages/TenantLoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

export function TenantLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Verify user has tenant role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user?.id)
      .single();

    if (profile?.role !== 'tenant') {
      setError('This login is for tenant users only');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    navigate('/tenant/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tenant Portal Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-gray-600 text-center">
            <a href="/tenant/forgot-password" className="text-blue-600 hover:underline">
              Forgot password?
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Invitation Signup Page

```typescript
// frontend/src/features/tenant-portal/pages/TenantSignupPage.tsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

export function TenantSignupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [invitation, setInvitation] = useState<TenantInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      return;
    }

    api.get(`/api/v1/tenant/invitations/${token}/validate`)
      .then(res => setInvitation(res.data))
      .catch(err => setError(err.response?.data?.detail || 'Invalid or expired invitation'));
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/v1/tenant/signup', {
        token,
        password,
      });
      navigate('/tenant/login');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Signup failed');
    }
  };

  if (error) return <div className="text-red-600">{error}</div>;
  if (!invitation) return <div>Loading...</div>;

  return (
    <form onSubmit={handleSignup}>
      <p>You've been invited to access lease: {invitation.lease_id}</p>
      <input
        type="password"
        placeholder="Create password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <button type="submit">Create Account</button>
    </form>
  );
}
```

## Test Cases

Test tenant authentication flow including:
- Tenant role is correctly assigned during signup
- Invitation token validates (valid token, expired, revoked, already used)
- RLS policies block access to other tenants' data
- Tenant JWT contains correct role claim
- Password reset flow works for tenant users
- Login redirects to tenant dashboard
- Non-tenant users cannot access tenant portal

## Definition of Done
- [ ] Tenant role created
- [ ] Invitation system works
- [ ] RLS policies enforced
- [ ] Token expiration works
- [ ] Password reset works
- [ ] Unit tests passing with 95%+ coverage
