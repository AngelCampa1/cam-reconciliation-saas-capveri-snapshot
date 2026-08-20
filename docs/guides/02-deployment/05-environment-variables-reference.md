# Environment Variables Reference

Complete reference for all environment variables in CapVeri.

## Backend Environment Variables

### Supabase Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | Public anon key (safe to expose) | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (backend only) | `eyJ...` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://...` |

**Where to find:**
- Supabase Dashboard > Settings > API

### AWS Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AWS_REGION` | Yes | AWS region | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Yes | IAM access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret key | `...` |
| `AWS_TEXTRACT_BUCKET` | Yes | S3 bucket for documents | `capveri-documents` |

**Where to find:**
- AWS IAM Console > Users > Security credentials

### Anthropic Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key | `sk-ant-api03-...` |
| `ANTHROPIC_MODEL` | No | Model to use | `claude-sonnet-4-5-20250929` |

**Default:** `claude-sonnet-4-5-20250929`

**Where to find:**
- [console.anthropic.com](https://console.anthropic.com) > API Keys

### Stripe Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key | `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key | `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret | `whsec_...` |
| `STRIPE_PRICE_ID_RECONCILE_ANNUAL` | Yes | Reconcile annual price ID | `price_...` |
| `STRIPE_PRICE_ID_CONTROL_ANNUAL` | Yes | Control annual price ID | `price_...` |
| `STRIPE_PRICE_ID_DEFEND_ANNUAL` | Yes | Defend annual price ID | `price_...` |
| `STRIPE_80OFF_COUPON_ID` | Yes | Stripe coupon ID for auto-applied 80OFF first-year discount | `80OFF` |
| `STRIPE_PRICE_ID_ENTERPRISE` | Yes | Enterprise tier price ID | `price_...` |

**Where to find:**
- [dashboard.stripe.com](https://dashboard.stripe.com) > Developers > API keys
- Dashboard > Products > Price IDs

### Resend Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RESEND_API_KEY` | Yes | Resend API key | `re_...` |
| `RESEND_FROM_ADDRESS` | Yes | Default sender address | `Angel Campa <angel.campa@capveri.com>` |

**Where to find:**
- [resend.com](https://resend.com) > API Keys

### Application Settings

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ENVIRONMENT` | No | Environment name | `production` |
| `DEBUG` | No | Enable debug mode | `false` |
| `LOG_LEVEL` | No | Logging level | `INFO` |
| `LOG_FORMAT` | No | Log format | `json` |
| `FRONTEND_URL` | No | Frontend URL (CORS) | `https://app.capveri.com` |
| `BACKEND_URL` | No | Backend URL | `https://api.capveri.com` |
| `POSTHOG_PROJECT_API_KEY` | No | Enables backend Stripe lifecycle event capture in PostHog | `phc_...` |
| `POSTHOG_HOST` | No | PostHog ingestion host for backend capture | `https://us.i.posthog.com` |

**Defaults:**
- `ENVIRONMENT`: `development`
- `DEBUG`: `false`
- `LOG_LEVEL`: `INFO`
- `LOG_FORMAT`: `text` (use `json` in production)

---

## Frontend Environment Variables

All frontend variables must be prefixed with `VITE_`.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | Yes | Backend API URL | `https://api.capveri.com` |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key | `eyJ...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | No | Stripe public key | `pk_live_...` |

**Note:** Frontend variables are embedded at build time and visible to users.

---

## Environment Files

### Local Development

**Backend** (`backend/.env`):
```env
# Supabase (from `supabase start`)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJ...local-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...local-service-role-key...
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# AWS (optional for local, mock in tests)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_TEXTRACT_BUCKET=capveri-documents

# Anthropic (optional for local)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Stripe (test keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_reconcile_annual
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_control_annual
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_defend_annual
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=price_ent

# Resend (optional for local)
RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=Angel Campa <angel.campa@capveri.com>

# Application
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG
POSTHOG_PROJECT_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
LOG_FORMAT=text
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
```

**Frontend** (`frontend/.env.local`):
```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJ...local-anon-key...
```

### Production

**Backend API** (Cloudflare Worker `capveri-api` secrets/vars):
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...production-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...production-service-role-key...
DATABASE_URL=postgresql://...supabase-connection-string...

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_TEXTRACT_BUCKET=capveri-documents

OPENROUTER_API_KEY=sk-or-...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_RECONCILE_ANNUAL=price_...
STRIPE_PRICE_ID_CONTROL_ANNUAL=price_...
STRIPE_PRICE_ID_DEFEND_ANNUAL=price_...
STRIPE_80OFF_COUPON_ID=80OFF
STRIPE_PRICE_ID_ENTERPRISE=price_...

RESEND_API_KEY=re_...
RESEND_FROM_ADDRESS=Angel Campa <angel.campa@capveri.com>

ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
LOG_FORMAT=json
FRONTEND_URL=https://app.capveri.com
BACKEND_URL=https://api.capveri.com
```

**Frontend** (Cloudflare Worker `capveri-app` vars):
```env
VITE_API_URL=https://api.capveri.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...production-anon-key...
```

---

## Variable Sources by Platform

### Cloudflare Workers (Backend, Frontend, Marketing)

Use `wrangler.jsonc` for non-secret public values and Wrangler secrets for sensitive values:

```bash
cd cloudflare-backend
npx wrangler secret put OPENROUTER_API_KEY --name capveri-api
npx wrangler secret put STRIPE_SECRET_KEY --name capveri-api
```

**Tips:**
- Use Wrangler secrets for sensitive values
- Worker vars are injected at runtime
- No `.env` file needed in deployment

Frontend and marketing public values still use the framework prefixes (`VITE_` and
`NEXT_PUBLIC_`) and are embedded at build time.

### Supabase

Some values come from Supabase:

1. Go to Supabase Dashboard
2. Select your project
3. Go to **Settings** > **API**
4. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

For `DATABASE_URL`:
1. Go to **Settings** > **Database**
2. Copy **Connection string** (URI format)
3. Use **Pooler** mode for serverless

---

## Security Notes

### Never Commit

These files should be in `.gitignore`:
- `.env`
- `.env.local`
- `.env.production`
- `backend/.env`
- `frontend/.env.local`

### Secrets to Protect

**High sensitivity** (never expose):
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_SECRET_ACCESS_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

**Medium sensitivity** (backend only):
- `DATABASE_URL`
- `AWS_ACCESS_KEY_ID`

**Low sensitivity** (safe for frontend):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STRIPE_PUBLISHABLE_KEY`

### Key Rotation

| Key | Rotation Period | How to Rotate |
|-----|-----------------|---------------|
| AWS keys | 90 days | IAM Console > Create new > Update > Delete old |
| Anthropic key | 90 days | Console > Create new > Update > Revoke old |
| Stripe keys | 12 months | Dashboard > Roll keys |
| Resend key | 12 months | Dashboard > Create new > Update > Delete old |

---

## Validation Checklist

Before deploying, verify:

- [ ] All required variables are set
- [ ] No test/development values in production
- [ ] Service role key is not exposed to frontend
- [ ] Stripe webhook secret matches endpoint
- [ ] Database URL uses pooler for serverless
- [ ] CORS URLs match deployment domains

## Related Documentation

- [AWS Setup](../01-infrastructure/01-aws-setup.md) - AWS credentials
- [Anthropic Setup](../01-infrastructure/02-anthropic-setup.md) - API key
- [Stripe Setup](../01-infrastructure/03-stripe-setup.md) - Billing config
- [Resend Setup](../01-infrastructure/04-resend-setup.md) - Email config
