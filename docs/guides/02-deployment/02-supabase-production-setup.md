# Supabase Production Setup

This guide covers setting up a Supabase project for CapVeri production deployment.

## 1. Create Supabase Project

### Sign Up / Sign In

1. Go to [supabase.com](https://supabase.com)
2. Click **Start your project**
3. Sign in with GitHub (recommended) or email

### Create Project

1. Click **New project**
2. Configure:
   - **Organization**: Select or create
   - **Name**: `capveri-production`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free (can upgrade later)
3. Click **Create new project**
4. Wait for project to provision (~2 minutes)

### Region Selection

| Region | Best For |
|--------|----------|
| `us-east-1` | US East Coast, works with document reader |
| `us-west-1` | US West Coast |
| `eu-west-1` | Europe |
| `ap-southeast-1` | Asia Pacific |

**Recommendation**: Use `us-east-1` to match document reader region.

## 2. Get API Keys

### From Dashboard

1. Go to **Settings** > **API**
2. Note these values:

| Key | Variable | Use |
|-----|----------|-----|
| **Project URL** | `SUPABASE_URL` | Both frontend & backend |
| **anon public** | `SUPABASE_ANON_KEY` | Both frontend & backend |
| **service_role** | `SUPABASE_SERVICE_ROLE_KEY` | Backend only (secret!) |

### Database Connection

1. Go to **Settings** > **Database**
2. Under **Connection string**, select **URI**
3. Copy the connection string for `DATABASE_URL`

**For serverless (Railway)**: Use the **Pooler** connection mode:
- Check "Use connection pooling"
- Copy the pooler connection string

## 3. Run Migrations

### Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# npm (cross-platform)
npm install -g supabase
```

### Link to Project

```bash
# Login to Supabase
supabase login

# Link to your project
cd /path/to/capveri
supabase link --project-ref YOUR_PROJECT_REF

# Project ref is in your dashboard URL:
# https://supabase.com/dashboard/project/YOUR_PROJECT_REF
```

### Push Migrations

```bash
# Preview what will be applied
supabase db diff

# Apply all migrations
supabase db push

# Verify tables exist
supabase db remote list
```

### Migration Files

The project has 47+ migration files in `supabase/migrations/`:

| Range | Tables |
|-------|--------|
| 001-010 | Core: organizations, users, properties, units, leases |
| 011-020 | Financial: gl_entries, expense_pools, pool_mappings |
| 021-030 | Reconciliation: snapshots, calculation_jobs |
| 031-040 | Documents: documents, ocr_results, extraction_jobs |
| 041-047 | Features: billing, tenant portal, audit logs |

## 4. Configure Authentication

### Enable Email Auth

1. Go to **Authentication** > **Providers**
2. **Email** is enabled by default
3. Configure:
   - **Enable email confirmations**: Yes (production)
   - **Enable signup**: Yes

### Configure OAuth

Follow the [OAuth Setup Guide](../../configuration/oauth-setup.md) for:
- Google OAuth
- Google Sign In

### Auth Settings

1. Go to **Authentication** > **Settings**
2. Configure:
   - **Site URL**: `https://app.capveri.com`
   - **Redirect URLs**: Add:
     ```
     https://app.capveri.com/auth/callback
     https://app.capveri.com/**
     ```

## 5. Configure Storage

### Create Buckets

1. Go to **Storage**
2. Click **New bucket**
3. Create these buckets:

| Bucket | Public | Purpose |
|--------|--------|---------|
| `documents` | No | Lease PDFs |
| `feedback_screenshots` | No | User feedback |

### Storage Policies

The migrations create appropriate RLS policies. Verify:

1. Go to **Storage** > **Policies**
2. Check `documents` bucket has policies for:
   - SELECT (organization members can read)
   - INSERT (organization members can upload)
   - DELETE (admins can delete)

## 6. Verify RLS Policies

### Check Policies Exist

1. Go to **Database** > **Tables**
2. For each table, click **Policies**
3. Verify policies exist for SELECT, INSERT, UPDATE, DELETE

### Critical Tables

These tables MUST have RLS enabled:

| Table | Policy Description |
|-------|-------------------|
| `organizations` | Users can only access their org |
| `properties` | Filtered by organization_id |
| `leases` | Filtered by organization_id |
| `gl_entries` | Filtered by organization_id |
| `reconciliation_snapshots` | Filtered by organization_id |
| `documents` | Filtered by organization_id |

### Test RLS

Run this in SQL Editor to verify:

```sql
-- Should return 0 rows (no auth context)
SELECT * FROM properties;

-- Test with specific user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'test-user-uuid';
SELECT * FROM properties;
```

## 7. Database Settings

### Connection Pooling

For Railway (serverless):

1. Go to **Settings** > **Database**
2. Enable **Connection pooling**
3. Use **Transaction** mode
4. Copy pooler connection string

### Performance Settings

For production, consider:

1. Go to **Settings** > **Database**
2. Review:
   - **Max connections**: Default is fine for small scale
   - **Statement timeout**: 60s (default)

## 8. Backup Configuration

### Automatic Backups

Supabase Pro plan includes:
- Daily automated backups
- 7-day retention
- Point-in-time recovery

### Manual Backup

For Free tier, create manual backups:

```bash
# Export schema and data
supabase db dump -f backup.sql

# Or use pg_dump directly
pg_dump $DATABASE_URL > backup.sql
```

## 9. Environment Variables

After setup, you should have:

```env
# Backend
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Frontend
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 10. Monitoring

### Dashboard Metrics

Monitor in Supabase Dashboard:
- **Database** > **Reports**: Query performance
- **Auth** > **Users**: User signups
- **Storage** > **Usage**: Storage consumption

### Usage Limits (Free Tier)

| Resource | Limit |
|----------|-------|
| Database size | 500 MB |
| Storage | 1 GB |
| Bandwidth | 2 GB/month |
| Auth users | Unlimited |
| API requests | Unlimited |

Upgrade to Pro ($25/month) for:
- 8 GB database
- 100 GB storage
- Daily backups
- Email support

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Migration fails | Check SQL syntax, run locally first |
| RLS blocks access | Verify policies match auth context |
| Connection refused | Use pooler URL for serverless |
| Slow queries | Add indexes, check query plans |

### Debug Connection

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check tables
psql $DATABASE_URL -c "\dt"

# Check RLS status
psql $DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'"
```

## Next Steps

- [Backend Deployment (Railway)](./03-backend-deployment-railway.md)
- [Frontend Deployment (Vercel)](./04-frontend-deployment-vercel.md)
- [RLS Verification](../security/02-supabase-rls-verification.md)
