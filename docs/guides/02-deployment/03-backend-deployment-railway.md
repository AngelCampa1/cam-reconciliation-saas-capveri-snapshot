# Backend Deployment (Railway)

> Deprecated: Railway is retired for CapVeri production. Do not use this guide for current
> deployments. The production API runs on Cloudflare Worker `capveri-api` from
> `cloudflare-backend/`; deploy with `cd cloudflare-backend && npx wrangler deploy --env
> production` and verify with `npx wrangler deployments status --name capveri-api` plus
> `curl.exe -I https://api.capveri.com/health`.

This guide covers deploying the CapVeri FastAPI backend to Railway.

## Why Railway?

- Simple GitHub integration
- Automatic deployments on push
- Built-in HTTPS and custom domains
- Reasonable pricing ($5/month minimum)
- Good for Python/FastAPI workloads

## Prerequisites

- GitHub repository with the project
- Railway account at [railway.app](https://railway.app)
- Environment variables ready (see [Environment Variables Reference](./05-environment-variables-reference.md))

## 1. Create Railway Project

### Sign Up

1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub

### Create Project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Select your repository: `username/capveri`
4. Railway auto-detects the Python project

## 2. Configure Service

### Root Directory

Since the backend is in a subdirectory:

1. Go to **Settings** > **General**
2. Set **Root Directory**: `backend`

### Build Configuration

Railway auto-detects Python, but verify:

1. Go to **Settings** > **Build**
2. **Builder**: Nixpacks (default)
3. **Build command**: (leave empty, uses pyproject.toml)

### Start Command

1. Go to **Settings** > **Deploy**
2. Set **Start command**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

### Health Check

1. Go to **Settings** > **Deploy**
2. Set **Health Check Path**: `/health`
3. Railway will ping this to verify deployments

## 3. Add Environment Variables

### Add Variables

1. Go to **Variables** tab
2. Click **New Variable** for each:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_TEXTRACT_BUCKET=capveri-documents

ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

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

### Bulk Import

Alternatively, use Railway CLI:

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Set variables from .env file
railway variables set < production.env
```

## 4. Configure Custom Domain

### Add Domain

1. Go to **Settings** > **Domains**
2. Click **Generate Domain** for Railway subdomain (testing)
3. Click **Add Custom Domain**
4. Enter: `api.capveri.com`

### Configure DNS

Add these DNS records:

| Type | Host | Value |
|------|------|-------|
| CNAME | `api` | `your-project.up.railway.app` |

Wait for DNS propagation (up to 24h).

### SSL Certificate

Railway automatically provisions SSL via Let's Encrypt.

## 5. Deploy

### Automatic Deployment

Railway deploys automatically when you push to the configured branch.

### Manual Deploy

1. Go to **Deployments**
2. Click **Deploy** button
3. Select branch (usually `main`)

### Monitor Deployment

1. Watch build logs in Railway dashboard
2. Verify no errors in build output
3. Check deployment status (green = success)

## 6. Verify Deployment

### Health Check

```bash
curl https://api.capveri.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### API Documentation

Visit: `https://api.capveri.com/docs`

This should show the Swagger UI (may want to disable in production).

### Test Endpoint

```bash
curl https://api.capveri.com/api/v1/properties \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 7. Scaling

### Current Setup

Railway starter plan includes:
- 512 MB RAM
- 1 vCPU
- Automatic sleep after inactivity

### Upgrade Options

For more traffic:

1. Go to **Settings** > **Service**
2. Increase resources:
   - **Memory**: 1GB, 2GB, 4GB
   - **vCPU**: 1, 2, 4

### Horizontal Scaling

Railway supports multiple replicas:

1. Go to **Settings** > **Service**
2. Set **Replicas**: 2, 3, etc.

## 8. Logs and Monitoring

### View Logs

1. Go to **Deployments** > Select deployment
2. Click **View Logs**
3. Logs are in JSON format (for production)

### Log Levels

Control via `LOG_LEVEL` variable:
- `DEBUG`: All logs (development only)
- `INFO`: Standard operations (recommended)
- `WARNING`: Warnings and errors
- `ERROR`: Errors only

### External Monitoring

Consider adding:
- [Better Uptime](https://betteruptime.com) - Free tier
- [Sentry](https://sentry.io) - Error tracking

## 9. Rollback

### Rollback to Previous

1. Go to **Deployments**
2. Find previous successful deployment
3. Click **Redeploy**

### Pin Deployment

To prevent auto-deploys:

1. Go to **Settings** > **Deploy**
2. Disable **Auto Deploy**

## 10. Alternative: Render

If Railway doesn't suit your needs, Render is similar:

### Render Setup

1. Go to [render.com](https://render.com)
2. Connect GitHub
3. Create **Web Service**
4. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -e ".[dev]"`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables
6. Deploy

### render.yaml (Infrastructure as Code)

```yaml
services:
  - type: web
    name: capveri-api
    env: python
    rootDir: backend
    buildCommand: pip install -e ".[dev]"
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      - key: ENVIRONMENT
        value: production
      # Add other variables or use Render dashboard
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check `pyproject.toml`, ensure dependencies resolve |
| Import errors | Verify root directory is `backend` |
| Health check fails | Check `/health` endpoint responds |
| Env var missing | Verify all required variables set |
| CORS errors | Check `FRONTEND_URL` matches Vercel domain |

### Debug Build

View detailed build logs:
1. Go to **Deployments**
2. Click on failed deployment
3. Expand **Build Logs**

### Test Locally

Before deploying, test production config locally:

```bash
cd backend
export ENVIRONMENT=production
export LOG_FORMAT=json
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Cost Estimate

| Usage | Est. Cost |
|-------|-----------|
| Starter (minimal) | $5/month |
| Small production | $10-20/month |
| Medium traffic | $25-50/month |

Railway charges based on:
- RAM hours
- CPU hours
- Network egress

## Next Steps

- [Frontend Deployment (Vercel)](./04-frontend-deployment-vercel.md)
- [Domain & SSL Configuration](./06-domain-and-ssl-configuration.md)
- [Logging Setup](../monitoring/01-logging-and-observability.md)
