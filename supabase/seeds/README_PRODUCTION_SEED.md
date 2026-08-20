# Production Test Seed Data

This guide explains how to seed test data into your **production** Supabase database for testing purposes.

## Safety Features

All test data is clearly identifiable:

| Data Type | Identification Pattern |
|-----------|----------------------|
| Organizations | Name starts with `[PROD-TEST]` |
| Properties | Name starts with `[PROD-TEST]` |
| Users | Email starts with `prodtest+` |
| User Names | Name starts with `[PROD-TEST]` |
| Tenant Names | Name starts with `[PROD-TEST]` |
| UUIDs | Pattern `ffffffff-ffff-ffff-ffff-ffffffff*` |
| Stripe IDs | Contains `prodtest_` (e.g., `cus_prodtest_acme001`) |

## Prerequisites

1. **Supabase Project Reference**: Found in your Supabase dashboard URL
2. **Database Password**: From Supabase Settings > Database
3. **psql installed**: PostgreSQL command-line client

## Quick Start

### 1. Get Your Connection String

```bash
# Format:
postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Example:
postgresql://postgres:MySecretPassword@db.abcdefghijklmnop.supabase.co:5432/postgres
```

### 2. Seed Test Data

```bash
# From project root
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/seeds/seed_production_test.sql
```

### 3. Verify Data Loaded

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) as orgs FROM organizations WHERE name LIKE '[PROD-TEST]%';"
```

### 4. Cleanup When Done

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/seeds/cleanup_production_test.sql
```

## Test User Credentials

All test users use password: **`TestPass123!`**

### Landlord Users

| Email | Role | Organization |
|-------|------|--------------|
| `prodtest+admin@democompany.com` | Admin | [PROD-TEST] Demo Company |
| `prodtest+member@democompany.com` | Member | [PROD-TEST] Demo Company |
| `prodtest+owner@acme.example.com` | Owner | [PROD-TEST] Acme Property Management |
| `prodtest+admin@acme.example.com` | Admin | [PROD-TEST] Acme Property Management |
| `prodtest+member@acme.example.com` | Member | [PROD-TEST] Acme Property Management |
| `prodtest+viewer@acme.example.com` | Viewer | [PROD-TEST] Acme Property Management |
| `prodtest+owner@beta.example.com` | Owner | [PROD-TEST] Beta Real Estate Holdings |
| `prodtest+owner@gamma.example.com` | Owner | [PROD-TEST] Gamma Commercial Group |
| `prodtest+owner@delta.example.com` | Owner | [PROD-TEST] Delta Development Corp |
| `prodtest+owner@epsilon.example.com` | Owner | [PROD-TEST] Epsilon Ventures |

### Tenant Users

| Email | Tenant | Property |
|-------|--------|----------|
| `prodtest+sarah.tenant@retailstore.com` | [PROD-TEST] Sarah's Retail Store | Retail Plaza |
| `prodtest+mike.tenant@coffeeshop.com` | [PROD-TEST] Mike's Coffee Shop | Retail Plaza |
| `prodtest+lisa.tenant@salon.com` | [PROD-TEST] Lisa's Hair Salon | Retail Plaza |
| `prodtest+david.tenant@gym.com` | [PROD-TEST] David's Fitness Center | Retail Plaza |

## Data Included

| Entity | Count | Notes |
|--------|-------|-------|
| Organizations | 6 | Various subscription tiers |
| Users | 17 | All roles (owner, admin, member, viewer, tenant) |
| Properties | 8 | Office, retail, medical, industrial |
| Units | 39 | Across all properties |
| Leases | 15 | Various recovery profiles |
| GL Entries | 30 | Sample 2024 expenses |
| Expense Pools | 10 | Operating, tax, insurance, capital |
| Pool Mappings | 10 | GL account patterns |
| Reconciliation Snapshots | 6 | 2023 (finalized) + 2024 (draft) |
| Tenant Portal Users | 4 | 3 accepted, 1 pending |
| Disputes | 3 | Various statuses |
| Subscriptions | 6 | Growth plan (with fake Stripe IDs) |
| Invoices | 4 | Sample payment history |

## Subscription Testing

The test data includes subscriptions with **fake Stripe IDs**:

```
cus_prodtest_demo001
cus_prodtest_acme001
cus_prodtest_beta002
cus_prodtest_delta004
cus_prodtest_epsilon005
```

These allow testing subscription-gated features but will **not** work for actual Stripe API calls.

### Testing Real Stripe Integration

If you need to test actual Stripe flows:

1. Create test customers in Stripe Dashboard (Test Mode)
2. Note their customer IDs (`cus_test_...`)
3. Update the seed file to use real test customer IDs
4. Run the seed

## Verification Queries

```sql
-- Count all test data
SELECT
  (SELECT COUNT(*) FROM organizations WHERE name LIKE '[PROD-TEST]%') as orgs,
  (SELECT COUNT(*) FROM users WHERE email LIKE 'prodtest+%') as users,
  (SELECT COUNT(*) FROM properties WHERE name LIKE '[PROD-TEST]%') as properties,
  (SELECT COUNT(*) FROM leases WHERE tenant_name LIKE '[PROD-TEST]%') as leases,
  (SELECT COUNT(*) FROM subscriptions WHERE stripe_customer_id LIKE 'cus_prodtest_%') as subs;

-- List all test organizations
SELECT id, name, subscription_status
FROM organizations
WHERE name LIKE '[PROD-TEST]%'
ORDER BY name;

-- Check test user can login
SELECT id, email, role
FROM users
WHERE email LIKE 'prodtest+%'
ORDER BY email;
```

## Troubleshooting

### Error: "permission denied for table auth.users"

You need to use the `postgres` user (service role), not an application user.

### Error: "duplicate key value violates unique constraint"

The seed data already exists. Run cleanup first:

```bash
psql "..." -f supabase/seeds/cleanup_production_test.sql
psql "..." -f supabase/seeds/seed_production_test.sql
```

### Error: "SSL connection required"

Add `?sslmode=require` to your connection string:

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?sslmode=require" \
  -f supabase/seeds/seed_production_test.sql
```

### Test user can't login

1. Verify auth.users entry exists:
   ```sql
   SELECT id, email FROM auth.users WHERE email LIKE 'prodtest+%';
   ```

2. Verify public.users entry exists:
   ```sql
   SELECT id, email, organization_id FROM users WHERE email LIKE 'prodtest+%';
   ```

3. Check RLS policies allow access to the organization

## Important Notes

1. **Never run the regular `seed.sql`** in production - it's for local development only
2. **Always clean up** test data when done testing
3. **Stripe IDs are fake** - they won't work with real Stripe API calls
4. **Passwords are visible** - this is test data, not for real users
