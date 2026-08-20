# Supabase Seed Data Scripts

## Quick Start

### Reset Database (Loads All Test Data)

To reset your database with all development and test data:

```bash
supabase db reset
```

This automatically runs all migrations and loads `seed.sql`, which now includes:
1. **Basic Development Data** - Demo Company with minimal setup
2. **Comprehensive Test Data** - Acme, Beta, Gamma, Delta, Epsilon organizations with extensive test data

**Note:** Reset now takes ~15-20 seconds due to comprehensive test data loading.

## Available Test Accounts

After running `supabase db reset`:

### Basic Development Users
- **admin@democompany.com** / `password` - Demo Company Admin
- **member@democompany.com** / `password` - Demo Company Member

### Comprehensive Test Organization Users
- **owner@acme.test.capveri.com** / `TestPass123!` - Acme Property Management (2 properties)
- **admin@acme.test.capveri.com** / `TestPass123!` - Acme Admin
- **member@acme.test.capveri.com** / `TestPass123!` - Acme Member
- **viewer@acme.test.capveri.com** / `TestPass123!` - Acme Viewer (read-only)
- **owner@beta.test.capveri.com** / `TestPass123!` - Beta Real Estate (Retail Plaza)
- **owner@gamma.test.capveri.com** / `TestPass123!` - Gamma Commercial (Medical Building)
- **owner@delta.test.capveri.com** / `TestPass123!` - Delta Development (Class A Tower)
- **owner@epsilon.test.capveri.com** / `TestPass123!` - Epsilon Ventures (Industrial Complex)

### Tenant Portal Users
- **sarah.tenant@retailstore.com** / `TestPass123!` - Multi-lease tenant (3 leases)
- **mike.tenant@coffeeshop.com** / `TestPass123!` - Single tenant
- **lisa.tenant@salon.com** / `TestPass123!` - Tenant with active disputes
- **david.tenant@gym.com** / `TestPass123!` - Tenant with resolved dispute

## What Data Gets Loaded

Running `supabase db reset` now loads **all data** from the merged `seed.sql`:

### Combined Data (seed.sql - includes everything)
**Organizations:**
- 1 Demo Company (basic development)
- 5 Test Organizations (Acme, Beta, Gamma, Delta, Epsilon)
- **Total: 6 organizations**

**Users:**
- 2 Demo Company users (admin, member)
- 15 Test organization users (all roles: Owner, Admin, Member, Viewer, Tenant)
- **Total: 17 users**

**Properties, Units, Leases:**
- 8 properties (2 Demo + 6 Test)
- 78+ units
- 53 leases (5 Demo + 48 Test)

**Financial Data:**
- 38+ Expense Pools (including parent/child hierarchy)
- 78+ Pool Mappings
- 90 GL Entries (representative data, expandable with CSV fixtures)
- 24 Reconciliation Snapshots (draft + finalized)
- 8 Calculation Jobs (various states)

**Tenant Portal:**
- 4 Tenant Portal Users
- 6 Disputes (complete lifecycle from OPEN to CLOSED)
- 10 Documents (AI extraction testing)

**Billing:**
- Subscriptions (Free, Starter, Professional plans)
- Sample invoices

## Manual Loading

If you need to manually run the seed file:

```bash
docker exec -i supabase_db_capveri psql -U postgres -d postgres < supabase/seed.sql
```

**Note:** The old `seed_manual_testing.sql` file has been merged into `seed.sql`. Running `supabase db reset` is the recommended approach.

## Troubleshooting

**Error: "column gl_entries.entry_date does not exist"**
- Solution: Run `supabase db reset` to apply correct migrations with `transaction_date` column

**Error: "Container restart failed (502)"**
- This is a harmless warning during container restart
- The reset scripts handle this automatically
- Data is still loaded successfully

**Need to speed up resets during rapid development?**

If the ~15-20 second reset time is too slow during active development, you can temporarily comment out the "COMPREHENSIVE MANUAL TESTING DATA" section in `supabase/seed.sql` (look for the comment block starting at line ~227). This will reduce reset time to ~5 seconds but only load the Demo Company data.

## Documentation

For complete testing scenarios and feature coverage, see:
- `docs/MANUAL_TESTING_GUIDE.md` - Full testing guide
- `docs/MANUAL_TESTING_SETUP_COMPLETE.md` - Setup verification

## Schema Issues

If you encounter schema mismatches (wrong column names), always start with:
```bash
supabase db reset
```

This ensures all migrations are applied correctly from scratch.
