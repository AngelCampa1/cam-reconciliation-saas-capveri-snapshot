# CapVeri.com Seed Data Documentation

## Overview

CapVeri uses multiple seed scripts for different purposes. This document explains which script to use and when.

## Auto-Loading Seed Data

### `seed.sql` ⚡ (Auto-loads with migrations)

**Purpose**: Base test data for E2E testing (Journeys 1, 3-15)

**What's included**:
- 6 organizations with varied subscription tiers
- 17 users (all roles: owner, admin, member, viewer, tenant)
- 6 properties with BOMA configurations
- 48 leases with diverse recovery profiles (cumulative, non-cumulative, compounding caps)
- 90 GL entries (2024: Jan-Jun representative sample)
- 30 reconciliation snapshots (2023-2024)
- Full tenant portal data (disputes, tenant users, invitations)
- Billing data (Stripe subscriptions, invoices)

**When it loads**: Automatically on `supabase db reset` or `supabase start`

**Coverage**: Journeys 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15

---

## Manual-Loading Seed Data

### `seed_e2e_multi_year_data.sql` (Journey 2 only)

**Purpose**: Multi-year historical data for Year-over-Year Variance Analysis

**What's included**:
- 2023 GL entries and reconciliation snapshots
- 2025 GL entries and reconciliation snapshots
- 2026 GL entries and reconciliation snapshots

**Prerequisites**: `seed.sql` must be loaded first (happens automatically)

**How to load**:
```bash
# Using docker exec
cat supabase/seed_e2e_multi_year_data.sql | docker exec -i supabase_db_capveri psql -U postgres -d postgres

# OR using supabase CLI
supabase db execute < supabase/seed_e2e_multi_year_data.sql
```

**Required for**: Journey 2 (TC2.1-2.8) - Year-over-Year Variance Analysis

---

### `seed_manual_testing.sql` (Comprehensive manual testing)

**Purpose**: Extended test data for comprehensive manual testing scenarios

**What's included**: Enhanced datasets beyond E2E requirements

**How to load**: Same as `seed_e2e_multi_year_data.sql` above

**Required for**: Manual testing only (not E2E tests)

---

## Quick Reference

| Test Scenario | Seed Files Needed | Loading Method |
|---------------|-------------------|----------------|
| **E2E Journeys 1, 3-15** | `seed.sql` only | Auto-loads |
| **E2E Journey 2 (Variance)** | `seed.sql` + `seed_e2e_multi_year_data.sql` | Auto + Manual |
| **Full Manual Testing** | `seed.sql` + `seed_manual_testing.sql` | Auto + Manual |

---

## Verification

After loading seed data, verify counts:

```sql
-- Organizations (should be 6)
SELECT COUNT(*) FROM organizations;

-- Users (should be 17)
SELECT COUNT(*) FROM users;

-- Properties (should be 6)
SELECT COUNT(*) FROM properties;

-- Leases (should be 48)
SELECT COUNT(*) FROM leases;

-- GL Entries (90 with seed.sql only, 135 with multi-year data)
SELECT COUNT(*) FROM gl_entries;

-- Reconciliation Snapshots (30 with seed.sql only, 76+ with multi-year data)
SELECT COUNT(*) FROM reconciliation_snapshots;

-- Disputes (should be 6)
SELECT COUNT(*) FROM disputes;
```

---

## Troubleshooting

### Problem: "Organization ID mismatch"
**Solution**: Ensure you're using the correct organization ID (`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001` for Acme)

### Problem: "Column does not exist"
**Solution**: Run migrations first (`supabase db reset`) to ensure schema is up to date

### Problem: "Only 2024 data visible in Year-over-Year Analysis"
**Solution**: Load `seed_e2e_multi_year_data.sql` manually for multi-year historical data

---

## Data Inventory

### Organizations (6 total)

| Organization | Subscription | Properties | Users | Purpose |
|--------------|-------------|------------|-------|---------|
| Demo Company | Professional | 2 | 2 | Basic demo setup |
| Acme Property Management | Professional | 2 | 4 | Complete workflows, role testing |
| Beta Real Estate Holdings | Starter/Trial | 1 | 6 | Tenant portal, disputes |
| Gamma Commercial Group | Free | 1 | 1 | Edge cases, limits |
| Delta Development Corp | Professional | 1 | 2 | Multi-year variance analysis |
| Epsilon Ventures | Starter | 1 | 2 | AI document extraction |

### Properties (6 total)

| Property | Organization | Size | BOMA Load Factor | Units | Leases |
|----------|-------------|------|------------------|-------|--------|
| Downtown Tower | Acme | 150K sqft | 1.11 | 25 | 15 |
| Suburban Office Park | Acme | 75K sqft | 1.10 | 12 | 8 |
| Retail Plaza | Beta | 50K sqft | 1.11 | 12 | 6 |
| Medical Office Building | Gamma | 30K sqft | 1.11 | 10 | 5 |
| Class A Office Tower | Delta | 200K sqft | 1.11 | 40+ | 20+ |
| Industrial Complex | Epsilon | 100K sqft | 1.11 | 15 | 10 |

### User Roles (17 total)

- **Owners**: 6 (one per organization)
- **Admins**: 2
- **Members**: 3
- **Viewers**: 2
- **Tenants**: 4

### Lease Recovery Profiles (48 total)

- **Cumulative Caps**: 6 leases (5% cap rate, linear growth)
- **Non-Cumulative Caps**: 3 leases (3-5% cap rate, annual reset)
- **Cumulative Compounding**: 3 leases (exponential growth)
- **No Caps**: 2 leases

### GL Entries

**With seed.sql only**: 90 entries (2024: Jan-Jun)
- Real Estate Taxes: ~24 entries
- Insurance: ~20 entries
- Utilities: ~15 entries
- Janitorial: ~12 entries
- Other operating expenses: ~19 entries

**With seed_e2e_multi_year_data.sql added**: 135 entries total
- 2023: +15 entries ($238,500)
- 2024: 90 entries (from seed.sql)
- 2025: +15 entries ($311,460)
- 2026: +15 entries ($271,305)

### Reconciliation Snapshots

**With seed.sql only**: 30 snapshots
- 2023: 15 finalized snapshots
- 2024: 15 mixed (draft + finalized)

**With seed_e2e_multi_year_data.sql added**: 76+ snapshots
- 2023: +46 snapshots (15 base + 31 additional)
- 2024: 15 snapshots
- 2025: +15 snapshots
- 2026: +15 snapshots

---

## Best Practices

1. **Always run migrations first**: `supabase db reset` loads both migrations and seed.sql
2. **Load multi-year data when needed**: Only load `seed_e2e_multi_year_data.sql` before Journey 2 testing
3. **Verify data after loading**: Run the verification queries above to confirm all data loaded correctly
4. **Use consistent organization IDs**: Stick to the predefined UUIDs (e.g., Acme = `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001`)
5. **Check RLS policies**: If data isn't visible, verify you're authenticated as the correct user for that organization

---

## Additional Resources

- **E2E Test Plan**: `E2E_TEST_PLAN_COMPREHENSIVE.md` - Full test case documentation
- **E2E Test Tracker**: `E2E_TEST_EXECUTION_TRACKER.md` - Test execution status
- **Migration Files**: `supabase/migrations/` - Database schema definitions
