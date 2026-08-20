# Role-Based Access Control (RBAC) & Permissions

> **Documentation Status**: Complete
> **Last Updated**: 2026-01-07
> **Version**: 1.0

---

## Overview

CapVeri implements a **5-tier role-based access control system** across two separate portals:
1. **Landlord Portal** - For property managers and their teams (4 roles)
2. **Tenant Portal** - For commercial tenants (1 role)

The permission model is enforced at multiple layers:
- **Database**: PostgreSQL Row Level Security (RLS) policies
- **Backend API**: FastAPI dependency injection with role checks
- **Frontend UI**: React hooks for conditional rendering

---

## Role Hierarchy

### Landlord Portal Roles

```
┌─────────────────────────────────────────┐
│              OWNER                      │  ← Full system control
│  (One per organization)                 │     Can manage billing, delete users
├─────────────────────────────────────────┤
│              ADMIN                      │  ← Administrative privileges
│  (Multiple allowed)                     │     Can manage resources, invite users
├─────────────────────────────────────────┤
│              MEMBER                     │  ← Standard user
│  (Default for new users)                │     Can create/edit, cannot delete
├─────────────────────────────────────────┤
│              VIEWER                     │  ← Read-only access
│  (Stakeholder view)                     │     Cannot modify anything
└─────────────────────────────────────────┘

Privilege Inheritance:
OWNER ⊇ ADMIN ⊇ MEMBER ⊇ VIEWER
```

### Tenant Portal Role

```
┌─────────────────────────────────────────┐
│              TENANT                     │  ← Separate portal
│  (Invitation-only)                      │     Restricted to own leases only
└─────────────────────────────────────────┘

Note: Tenants DO NOT belong to organizations (organization_id = NULL)
```

---

## Permission Matrix

| Feature | OWNER | ADMIN | MEMBER | VIEWER | TENANT |
|---------|:-----:|:-----:|:------:|:------:|:------:|
| **Organization Management** |
| View organization settings | ✅ | ✅ | ✅ | ✅ | ❌ |
| Update organization settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** |
| View users in organization | ✅ | ✅ | ✅ | ✅ | ❌ |
| Invite new users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit user roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Properties & Units** |
| View properties | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create properties | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update properties | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete properties | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create units | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update units | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete units | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Leases** |
| View leases | ✅ | ✅ | ✅ | ✅ | ✅* |
| Create leases | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update leases | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete leases | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit recovery profiles | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Data Ingestion** |
| Upload CSV/PDF files | ✅ | ✅ | ✅ | ❌ | ❌ |
| Run AI extraction | ✅ | ✅ | ✅ | ❌ | ❌ |
| Verify extractions (HITL) | ✅ | ✅ | ✅ | ❌ | ❌ |
| View import history | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delete import batches | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Expense Pools & Mappings** |
| View expense pools | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create expense pools | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update pool mappings | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete expense pools | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reconciliation** |
| View reconciliations | ✅ | ✅ | ✅ | ✅ | ✅* |
| Calculate reconciliations | ✅ | ✅ | ✅ | ❌ | ❌ |
| Finalize reconciliations | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete reconciliations | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate tenant packets | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Analysis & Reporting** |
| View year-over-year analysis | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export to CSV | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export to PDF | ✅ | ✅ | ✅ | ✅ | ❌ |
| Generate ERP write-back files | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Tenant Portal Management** |
| Invite tenant users | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revoke tenant access | ✅ | ✅ | ❌ | ❌ | ❌ |
| View disputes | ✅ | ✅ | ✅ | ❌ | ✅** |
| Respond to disputes | ✅ | ✅ | ✅ | ❌ | ❌ |
| Submit disputes | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Billing & Subscriptions** |
| View billing information | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage subscription | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update payment methods | ✅ | ❌ | ❌ | ❌ | ❌ |
| View invoices | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Audit & Logs** |
| View audit logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| View user activity | ✅ | ✅ | ❌ | ❌ | ❌ |

**\*** Tenants can only view their own assigned leases and related reconciliations
**\*\*** Tenants can only view disputes they created

---

## Role Definitions

### OWNER (Landlord Portal)

**Description**: Full system control. Only one owner per organization.

**Unique Permissions**:
- Update organization settings (name, logo, branding)
- Manage billing and subscriptions
- Change payment methods
- Delete users from organization
- Transfer ownership (future feature)

**Cannot**:
- Delete themselves (must transfer ownership first)

**Use Cases**:
- Company CEO or founder
- Billing administrator
- Final authority on all decisions

**Backend Check**:
```python
if not current_user.is_owner:
    raise HTTPException(status_code=403, detail="Owner privileges required")
```

**Frontend Check**:
```typescript
const { isOwner } = useUserRole()
if (!isOwner) return null
```

---

### ADMIN (Landlord Portal)

**Description**: Administrative privileges for managing resources and users.

**Unique Permissions**:
- Delete properties, units, leases
- Delete reconciliation snapshots
- Invite new users to organization
- Create and manage tenant portal invitations
- Finalize reconciliations
- View audit logs

**Cannot**:
- Modify organization settings
- Manage billing/subscriptions
- Delete users

**Use Cases**:
- Property managers
- Team leads
- Senior accountants

**Backend Check**:
```python
if not current_user.is_admin:  # Returns True for OWNER and ADMIN
    raise HTTPException(status_code=403, detail="Admin privileges required")
```

**Frontend Check**:
```typescript
const { isAdmin, canDelete } = useUserRole()
```

---

### MEMBER (Landlord Portal)

**Description**: Standard user with create/edit access but cannot delete.

**Permissions**:
- Create and update all resources (properties, leases, pools)
- Upload and process documents
- Run calculations and generate reports
- View all organization data

**Cannot**:
- Delete any resources
- Invite users
- Finalize reconciliations
- Access admin functions

**Use Cases**:
- Property accountants
- Junior staff members
- Data entry personnel

**Backend Check**:
```python
# No explicit check needed - authenticated users can access
# Deletion/admin operations blocked by is_admin check
```

**Frontend Check**:
```typescript
const { canEdit } = useUserRole()  // True for OWNER, ADMIN, MEMBER
```

---

### VIEWER (Landlord Portal)

**Description**: Read-only access for stakeholders and auditors.

**Permissions**:
- View all organization data
- View reconciliations and reports
- Export read-only reports (CSV, PDF)
- Update own profile

**Cannot**:
- Create, update, or delete ANY resources
- Upload documents
- Run calculations
- Invite users

**Use Cases**:
- External auditors
- Board members
- Investors or stakeholders
- Compliance reviewers

**Backend Check**:
```python
# Read operations allowed by default
# Write operations fail at RLS policy level
```

**Frontend Check**:
```typescript
const { isReadOnly } = useUserRole()
if (isReadOnly) return <ReadOnlyMessage />
```

---

### TENANT (Tenant Portal)

**Description**: Commercial tenants with restricted access to their own leases.

**Unique Characteristics**:
- **Separate portal**: Routes under `/tenant/*`
- **No organization**: `organization_id = NULL`
- **Invitation-only**: Cannot self-register
- **Lease-scoped**: Access controlled via `tenant_lease_access` table

**Permissions**:
- View assigned leases and reconciliation statements
- Submit disputes (max 3 per day - rate limited)
- View dispute status and add comments
- Upload supporting documents to disputes
- Receive email notifications (max 10 per hour)
- Manage notification preferences

**Cannot**:
- Access landlord portal
- See other tenants' data
- Create/edit properties or leases
- Run calculations

**Rate Limits**:
- Disputes: 3 per day per tenant
- Email notifications: 10 per hour per tenant

**Backend Check**:
```python
async def get_current_tenant_user(
    credentials: HTTPAuthorizationCredentials,
    supabase: Client,
) -> TenantUser:
    user = await get_current_user(credentials, supabase)
    if user.role != UserRole.TENANT:
        raise HTTPException(status_code=403, detail="Tenant access required")
    # ... fetch tenant profile
```

**Frontend Check**:
```typescript
// Tenant portal uses separate routes
// Protected by ProtectedRoute component checking user.role === 'tenant'
```

---

## Implementation Details

### Backend (Python/FastAPI)

#### Auth Dependencies

**File**: `backend/app/auth/dependencies.py`

```python
# Basic authentication
CurrentUser = Annotated[User, Depends(get_current_user)]

# Admin-only endpoints
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]

# Tenant-only endpoints
CurrentTenantUser = Annotated[TenantUser, Depends(get_current_tenant_user)]

# Example usage
@router.delete("/properties/{property_id}")
async def delete_property(
    property_id: UUID,
    admin: CurrentAdminUser,  # Only OWNER and ADMIN can access
):
    ...
```

#### User Model Helpers

**File**: `backend/app/models/user.py`

```python
class User(UserBase):
    @property
    def is_admin(self) -> bool:
        """Check if user has admin privileges (owner or admin role)."""
        return self.role in (UserRole.OWNER, UserRole.ADMIN)

    @property
    def is_owner(self) -> bool:
        """Check if user is the organization owner."""
        return self.role == UserRole.OWNER
```

---

### Database (PostgreSQL RLS)

#### Example RLS Policies

**Properties - Delete (Admin Only)**

**File**: `supabase/migrations/20240101000003_create_properties.sql:64-75`

```sql
CREATE POLICY "Properties are deletable by organization admins"
    ON public.properties
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );
```

**Leases - Delete (Admin Only)**

**File**: `supabase/migrations/20240101000005_create_leases.sql:110-125`

```sql
CREATE POLICY "Leases are deletable by admins"
    ON public.leases
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );
```

**Organizations - Update (Owner Only)**

**File**: `supabase/migrations/20240101000002_create_users.sql:100-112`

```sql
CREATE POLICY "Owners can update organizations"
    ON public.organizations
    FOR UPDATE
    USING (id = public.get_user_organization_id())
    WITH CHECK (
        id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role = 'owner'
        )
    );
```

**Tenant Lease Access (Tenant Portal)**

**File**: `docs/architecture/tenant-portal-architecture.md:25-32`

```sql
CREATE POLICY "Tenant lease access" ON leases
FOR SELECT
USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
    OR
    id IN (SELECT lease_id FROM tenant_lease_access WHERE user_id = auth.uid())
);
```

---

### Frontend (React/TypeScript)

#### Permission Hook

**File**: `frontend/src/hooks/useUserRole.tsx`

```typescript
export function useUserRole() {
  const { userRole, isAdmin, isOwner } = useAuth()

  /**
   * Check if user can edit resources
   * OWNER, ADMIN, and MEMBER can edit
   */
  const canEdit = useMemo((): boolean => {
    return userRole
      ? [UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER].includes(userRole)
      : false
  }, [userRole])

  /**
   * Check if user can delete resources
   * Only OWNER and ADMIN can delete
   */
  const canDelete = useMemo((): boolean => {
    return userRole
      ? [UserRole.OWNER, UserRole.ADMIN].includes(userRole)
      : false
  }, [userRole])

  /**
   * Check if user can manage other users
   * Only OWNER and ADMIN can manage users
   */
  const canManageUsers = useMemo((): boolean => {
    return isAdmin
  }, [isAdmin])

  /**
   * Check if user is read-only (VIEWER role)
   */
  const isReadOnly = useMemo((): boolean => {
    return userRole === UserRole.VIEWER
  }, [userRole])

  return {
    userRole,
    isAdmin,
    isOwner,
    canEdit,
    canDelete,
    canManageUsers,
    isReadOnly,
  }
}
```

#### Usage Examples

**Conditional Rendering**:
```typescript
function PropertyActions({ property }: PropertyActionsProps) {
  const { canEdit, canDelete } = useUserRole()

  return (
    <>
      {canEdit && <EditButton onClick={handleEdit} />}
      {canDelete && <DeleteButton onClick={handleDelete} />}
    </>
  )
}
```

**Protected Routes**:
```typescript
// App.tsx - Admin-only route
<Route
  path="/admin/feedback"
  element={
    <ProtectedRoute requiredRole="admin">
      <FeedbackPage />
    </ProtectedRoute>
  }
/>

// Tenant portal route
<Route
  path="/tenant/dashboard"
  element={
    <ProtectedRoute requiredRole="tenant">
      <TenantDashboard />
    </ProtectedRoute>
  }
/>
```

---

## Security Considerations

### Defense in Depth

Permissions are enforced at **three layers**:

1. **Database (RLS)**: PostgreSQL policies block unauthorized queries
2. **Backend API**: FastAPI dependencies reject requests
3. **Frontend UI**: React components hide unauthorized actions

**Never rely on UI-only protection** - Always enforce at database and API layers.

### Common Vulnerabilities to Avoid

❌ **DO NOT** check permissions only in frontend:
```typescript
// BAD - Can be bypassed
if (userRole === 'admin') {
  await api.deleteProperty(id)  // API should also check!
}
```

✅ **DO** enforce at all layers:
```typescript
// GOOD - Triple protection
// 1. UI check (UX)
const { canDelete } = useUserRole()
if (!canDelete) return null

// 2. API check (Backend)
@router.delete("/properties/{id}")
async def delete_property(admin: CurrentAdminUser, id: UUID):
    ...

// 3. RLS check (Database)
CREATE POLICY "Properties are deletable by admins"
    FOR DELETE USING (role IN ('owner', 'admin'));
```

### Privilege Escalation Prevention

- ✅ Users cannot change their own role
- ✅ Only OWNER can delete users (prevents admin lockout)
- ✅ OWNER cannot delete themselves (must transfer ownership first)
- ✅ Tenant users cannot access landlord portal (separate auth flow)
- ✅ RLS policies prevent cross-organization data access

---

## Testing

### Manual Testing

**Test Users**: See `docs/MANUAL_TESTING_GUIDE.md:200-220`

All test users use password: `TestPass123!`

| Email | Role | Organization |
|-------|------|--------------|
| owner@acme.test.capveri.com | OWNER | Acme Property Management |
| admin@acme.test.capveri.com | ADMIN | Acme Property Management |
| member@acme.test.capveri.com | MEMBER | Acme Property Management |
| viewer@acme.test.capveri.com | VIEWER | Acme Property Management |
| sarah.tenant@retailstore.com | TENANT | Beta Real Estate Holdings |

### Automated Tests

**RLS Negative Tests**: `supabase/migrations/20240101000003_create_properties.sql` (Story 3.13)

**Auth Integration Tests**: `backend/tests/test_authentication_required.py`

**Frontend Role Tests**: `frontend/src/hooks/useUserRole.test.tsx`

---

## Migration Notes

### Outdated Documentation

⚠️ **Warning**: The following files contain **outdated role names**:

- `docs/Data Architecture for CapVeri.md:105` - Uses `admin`, `manager`, `viewer`
- Should be: `owner`, `admin`, `member`, `viewer`, `tenant`

### Database Schema

Current roles are defined in:
- `backend/app/models/enums.py:54-62` (Python enum)
- `supabase/migrations/20240101000020_create_tenant_tables.sql:11` (Database constraint)
- `frontend/src/types/enums.ts` (TypeScript enum)

**All three must stay synchronized.**

---

## FAQ

### Q: Can an organization have multiple owners?

**A**: No. The system enforces one owner per organization. To transfer ownership, the current owner must designate a new owner (future feature).

### Q: Can a MEMBER finalize reconciliations?

**A**: No. Only OWNER and ADMIN can finalize reconciliations. This prevents accidental or unauthorized finalization.

### Q: Can a VIEWER export reports?

**A**: Yes, but only read-only exports (CSV, PDF). They cannot generate ERP write-back files or modify data.

### Q: Can a TENANT see other tenants' data?

**A**: No. RLS policies ensure tenants can only see leases they are explicitly linked to via the `tenant_lease_access` table.

### Q: How do I test different roles locally?

**A**: Use the test users in `docs/MANUAL_TESTING_GUIDE.md`. All use password `TestPass123!`.

### Q: What happens if I try to delete the only OWNER?

**A**: The operation is blocked by RLS policy. Owner cannot delete themselves.

### Q: Can ADMIN users see billing information?

**A**: Yes, they can view billing info, but only OWNER can modify subscriptions or payment methods.

---

## Related Documentation

- **Tenant Portal Architecture**: `docs/architecture/tenant-portal-architecture.md`
- **Database Schema**: `docs/Data Architecture for CapVeri.md`
- **Manual Testing Guide**: `docs/MANUAL_TESTING_GUIDE.md`
- **User Model Spec**: `docs/stories/epic-02/story-02.03-create-user-model.md`
- **Auth Implementation**: `docs/stories/epic-09/` (Epic 9 stories)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 1.0 | Initial documentation created |
