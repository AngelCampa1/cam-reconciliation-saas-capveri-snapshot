# Supabase RLS Verification

Guide for testing Row Level Security policies in CapVeri.

## Understanding RLS

### Multi-Tenancy Model

CapVeri uses `organization_id` for tenant isolation:

```
Organization A
├── User A1 (owner)
├── User A2 (admin)
├── Properties (org A)
├── Leases (org A)
└── Snapshots (org A)

Organization B
├── User B1 (owner)
├── Properties (org B)  ← NEVER visible to Org A users
└── ...
```

### How RLS Works

Every table has policies like:

```sql
CREATE POLICY "Users can only view own org data"
ON properties FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);
```

## Critical Tables to Verify

### Must Have RLS

| Table | Policy Type | Description |
|-------|-------------|-------------|
| `organizations` | org_id match | Users see only their org |
| `properties` | org_id match | Properties filtered by org |
| `units` | via property | Units via property's org |
| `leases` | org_id match | Leases filtered by org |
| `gl_entries` | org_id match | GL data filtered by org |
| `expense_pools` | org_id match | Pools filtered by org |
| `reconciliation_snapshots` | org_id match | Snapshots filtered by org |
| `documents` | org_id match | Documents filtered by org |
| `tenant_users` | linked leases | Tenants see linked leases only |

## Testing RLS

### Method 1: SQL Editor

In Supabase Dashboard > SQL Editor:

```sql
-- Test as specific user
BEGIN;

-- Set auth context
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'user-uuid-from-org-a';
SET LOCAL request.jwt.claim.email = 'user@org-a.com';

-- Try to access another org's data
SELECT * FROM properties
WHERE organization_id = 'org-b-uuid';
-- Expected: 0 rows (blocked by RLS)

-- Access own org's data
SELECT * FROM properties
WHERE organization_id = 'org-a-uuid';
-- Expected: Returns data

ROLLBACK;
```

### Method 2: API Testing

```bash
# Get token for User A (org A)
TOKEN_A="user_a_jwt_token"

# Try to access Org B's property
curl https://api.capveri.com/api/v1/properties/org-b-property-uuid \
  -H "Authorization: Bearer $TOKEN_A"
# Expected: 404 or 403 (not found/forbidden)

# Access own property
curl https://api.capveri.com/api/v1/properties/org-a-property-uuid \
  -H "Authorization: Bearer $TOKEN_A"
# Expected: 200 with data
```

### Method 3: Automated Tests

```python
# In pytest
async def test_cross_tenant_access_blocked(
    client: AsyncClient,
    org_a_user_token: str,
    org_b_property_id: str,
):
    """Verify users cannot access other organization's data."""
    response = await client.get(
        f"/api/v1/properties/{org_b_property_id}",
        headers={"Authorization": f"Bearer {org_a_user_token}"}
    )
    assert response.status_code == 404  # Not found, not forbidden
```

## Test Cases

### Positive Tests (Should Succeed)

| Test | Expected |
|------|----------|
| User reads own org properties | 200, data returned |
| Admin updates own org property | 200, updated |
| Owner deletes own org property | 200, deleted |
| Tenant reads linked lease | 200, data returned |

### Negative Tests (Should Fail)

| Test | Expected |
|------|----------|
| User reads other org properties | 0 rows / 404 |
| User updates other org property | 404 / 403 |
| User deletes other org property | 404 / 403 |
| Tenant reads unlinked lease | 404 |
| Update finalized snapshot | 403 |
| Delete finalized snapshot | 403 |

## Verify All Tables

### Check RLS Enabled

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All `rowsecurity` should be `true`.

### Check Policies Exist

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Missing Policies

If a table lacks policies:

```sql
-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "org_isolation" ON table_name
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  )
);
```

## Special Cases

### Finalized Snapshots

Finalized snapshots are immutable:

```sql
-- Should fail
UPDATE reconciliation_snapshots
SET total_recovery = 1000
WHERE id = 'finalized-snapshot-uuid' AND status = 'finalized';
-- Expected: 0 rows updated (blocked by policy)
```

### Tenant Portal Access

Tenants can only see linked leases:

```sql
-- Tenant user context
SET LOCAL request.jwt.claim.sub = 'tenant-user-uuid';

SELECT * FROM leases WHERE id IN (
  SELECT lease_id FROM tenant_lease_links
  WHERE tenant_user_id IN (
    SELECT id FROM tenant_users WHERE user_id = auth.uid()
  )
);
-- Only returns linked leases
```

### Admin Operations

Some operations require admin role:

```sql
-- Non-admin trying to delete property
-- Expected: Blocked by policy requiring admin role
```

## Common Issues

### RLS Not Enabled

```sql
-- Fix: Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

### Missing Policy

```sql
-- Fix: Add policy
CREATE POLICY "name" ON table_name FOR operation USING (condition);
```

### Wrong Policy Logic

Review policy `qual` in pg_policies and fix:

```sql
-- Drop and recreate
DROP POLICY "wrong_policy" ON table_name;
CREATE POLICY "correct_policy" ON table_name ...;
```

### Service Role Bypass

The service role key bypasses RLS. Ensure:
- Never exposed to frontend
- Only used in backend for admin operations
- Logged when used

## Verification Checklist

- [ ] RLS enabled on all public tables
- [ ] Policies exist for SELECT, INSERT, UPDATE, DELETE
- [ ] Cross-tenant SELECT returns 0 rows
- [ ] Cross-tenant UPDATE affects 0 rows
- [ ] Cross-tenant DELETE affects 0 rows
- [ ] Finalized snapshots immutable
- [ ] Tenant portal respects lease links
- [ ] Storage buckets have RLS

## Next Steps

- [Secrets Management](./03-secrets-management.md)
- [Security Headers](./04-security-headers-and-cors.md)
