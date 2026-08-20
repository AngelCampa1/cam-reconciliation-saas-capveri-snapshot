# Consolidated Deployment Checklist

A single-page checklist for deploying CapVeri to production. This consolidates all deployment steps from the scattered guides into one actionable document.

## Prerequisites

Before starting, ensure you have completed:

- [x] AWS Setup (`docs/guides/01-infrastructure/01-aws-setup.md`)
- [x] Anthropic Setup (`docs/guides/01-infrastructure/02-anthropic-setup.md`)
- [x] Stripe Setup (`docs/guides/01-infrastructure/03-stripe-setup.md`)
- [x] Resend Setup (`docs/guides/01-infrastructure/04-resend-setup.md`)

Required accounts:
- [ ] Supabase account (supabase.com)
- [ ] Railway account (railway.app)
- [ ] Vercel account (vercel.com)
- [ ] Domain DNS access (for custom domains)

---

## Step 1: Supabase Production Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Configure:
   - **Name**: `capveri-production`
   - **Database Password**: Generate strong password (save it!)
   - **Region**: `us-east-1` (matches document reader)
3. Wait for provisioning (~2 minutes)

### 1.2 Get API Keys

Go to **Settings** → **API** and note:

| Key | Environment Variable | Used By |
|-----|---------------------|---------|
| Project URL | `SUPABASE_URL` | Frontend + Backend |
| anon public | `SUPABASE_ANON_KEY` | Frontend + Backend |
| service_role | `SUPABASE_SERVICE_ROLE_KEY` | Backend only |

Go to **Settings** → **Database**:
- Enable **Connection pooling** (Transaction mode)
- Copy pooler connection string → `DATABASE_URL`

### 1.3 Push Migrations

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login
supabase login

# Navigate to project root
cd /path/to/capveri

# Link to production project (get ref from dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push

# Verify tables created
supabase db remote list
```

### 1.4 Configure Authentication

1. Go to **Authentication** → **URL Configuration**
2. Set:
   - **Site URL**: `https://app.capveri.com`
   - **Redirect URLs**:
     ```
     https://app.capveri.com/auth/callback
     https://app.capveri.com/**
     ```

### 1.5 Create Storage Bucket

1. Go to **Storage** → **New bucket**
2. Create bucket: `documents` (Private)

---

## Step 2: Backend Deployment (Railway)

### 2.1 Create Project

1. Go to [railway.app](https://railway.app) → Sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository

### 2.2 Configure Service

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

### 2.3 Add Environment Variables

Go to **Variables** tab and add:

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_TEXTRACT_BUCKET=capveri-documents

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_...
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_...
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_...
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=price_...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=Angel Campa <angel.campa@capveri.com>

# App Config
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
LOG_FORMAT=json
FRONTEND_URL=https://app.capveri.com
BACKEND_URL=https://api.capveri.com
```

### 2.4 Configure Custom Domain

1. Go to **Settings** → **Domains**
2. Click **Add Custom Domain**: `api.capveri.com`
3. Add DNS record at your registrar:

| Type | Host | Value |
|------|------|-------|
| CNAME | `api` | `your-project.up.railway.app` |

### 2.5 Deploy

Railway auto-deploys on push to `main`. For manual deploy:
1. Go to **Deployments** → **Deploy**

---

## Step 3: Frontend Deployment (Vercel)

### 3.1 Create Project

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. Click **Add New** → **Project**
3. Import your repository

### 3.2 Configure Build

| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### 3.3 Add Environment Variables

Go to **Settings** → **Environment Variables**:

| Variable | Value | Environments |
|----------|-------|--------------|
| `VITE_API_URL` | `https://api.capveri.com` | Production |
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | All |

### 3.4 Configure Custom Domain

1. Go to **Settings** → **Domains**
2. Add: `app.capveri.com`
3. Add DNS record:

| Type | Host | Value |
|------|------|-------|
| CNAME | `app` | `cname.vercel-dns.com` |

### 3.5 Deploy

Vercel auto-deploys on push to `main`.

---

## Step 4: Configure Webhooks

### 4.1 Stripe Webhooks

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Configure:
   - **URL**: `https://api.capveri.com/webhooks/stripe`
   - **Events**:
     - `checkout.session.completed`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
4. Copy **Signing secret** → Update `STRIPE_WEBHOOK_SECRET` in Railway

### 4.2 Resend Webhooks

1. Go to [Resend Dashboard](https://resend.com) → **Webhooks**
2. Add endpoint: `https://api.capveri.com/webhooks/resend`
3. Select events: `email.delivered`, `email.bounced`, `email.complained`

---

## Step 5: Verification

### 5.1 Backend Health Check

```bash
curl https://api.capveri.com/health
```

Expected:
```json
{"status": "healthy", "timestamp": "2024-01-15T10:30:00Z"}
```

### 5.2 API Documentation

Open: `https://api.capveri.com/docs`

Should display Swagger UI with all endpoints.

### 5.3 Frontend

Open: `https://app.capveri.com`

Verify:
- [ ] Page loads without errors
- [ ] Login/signup works
- [ ] API calls succeed (check Network tab)

### 5.4 End-to-End Test

1. Create a new account
2. Create an organization
3. Add a property
4. Upload a document
5. Verify Stripe checkout works (test mode first)

---

## Quick Reference

### Deployment Commands

| Action | Command |
|--------|---------|
| Push DB migrations | `supabase db push` |
| Check migration status | `supabase db remote list` |
| View Railway logs | Railway Dashboard → Deployments → View Logs |
| Rollback Railway | Railway Dashboard → Deployments → Previous → Redeploy |
| Rollback Vercel | Vercel Dashboard → Deployments → Promote to Production |

### URLs

| Service | URL |
|---------|-----|
| Frontend | `https://app.capveri.com` |
| Backend API | `https://api.capveri.com` |
| API Docs | `https://api.capveri.com/docs` |
| Health Check | `https://api.capveri.com/health` |

### Environment Variable Checklist

**Backend (Railway):**
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `DATABASE_URL`
- [ ] `AWS_REGION`
- [ ] `AWS_ACCESS_KEY_ID`
- [ ] `AWS_SECRET_ACCESS_KEY`
- [ ] `AWS_TEXTRACT_BUCKET`
- [ ] `ANTHROPIC_API_KEY`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_ADDRESS`
- [ ] `FRONTEND_URL`
- [ ] `ENVIRONMENT=production`

**Frontend (Vercel):**
- [ ] `VITE_API_URL`
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend build fails | Check Railway logs, verify `pyproject.toml` |
| Frontend 404 on refresh | Vite SPA routing should work automatically |
| CORS errors | Verify `FRONTEND_URL` matches Vercel domain |
| Auth redirect fails | Check Supabase redirect URLs include your domain |
| Webhook 401 | Verify webhook secrets match in both dashboards |
| Database connection fails | Use pooler connection string, check credentials |

---

## Post-Launch

After successful deployment:

1. **Monitor** - Check Railway/Vercel dashboards for errors
2. **Alerts** - Set up uptime monitoring (e.g., Better Uptime)
3. **Backups** - Enable Supabase Pro for automatic backups
4. **Stripe** - Switch from test mode to live mode when ready

See also:
- [Pre-Launch Checklist](./00-pre-launch-checklist.md)
- [Launch Day Runbook](./01-launch-day-runbook.md)
