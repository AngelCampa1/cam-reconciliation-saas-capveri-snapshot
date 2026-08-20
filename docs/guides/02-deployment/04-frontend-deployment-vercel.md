# Frontend Deployment (Vercel)

> Deprecated: Vercel is retired for CapVeri production. Do not use this guide for current
> deployments. The production app frontend runs on Cloudflare Worker `capveri-app` from
> `frontend/`; deploy with `cd frontend && npm run deploy:cf` and verify with
> `npx wrangler deployments status --name capveri-app`.

This guide covers deploying the CapVeri React frontend to Vercel.

## Why Vercel?

- Native Vite/React support
- Global CDN for fast loading
- Automatic HTTPS
- Preview deployments for PRs
- Generous free tier

## Prerequisites

- GitHub repository with the project
- Vercel account at [vercel.com](https://vercel.com)
- Backend deployed (for API URL)

## 1. Create Vercel Project

### Sign Up

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up**
3. Sign in with GitHub (recommended)

### Import Project

1. Click **Add New...** > **Project**
2. Select **Import Git Repository**
3. Choose your repository: `username/capveri`
4. Click **Import**

## 2. Configure Build Settings

### Framework Preset

Vercel auto-detects Vite. Verify settings:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm ci` |

### Configure Root Directory

1. In import wizard, click **Edit** next to Root Directory
2. Set to: `frontend`
3. Vercel will now build from the frontend folder

## 3. Add Environment Variables

### Required Variables

Add these in Vercel dashboard:

| Variable | Value | Environments |
|----------|-------|--------------|
| `VITE_API_URL` | `https://api.capveri.com` | Production |
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | All |

### Add Variables

1. Go to **Settings** > **Environment Variables**
2. Add each variable
3. Select environments:
   - **Production**: Live site
   - **Preview**: PR previews
   - **Development**: Local (optional)

### Preview Environment

For preview deployments (PRs), you may want different values:

| Variable | Preview Value |
|----------|---------------|
| `VITE_API_URL` | `https://api-staging.capveri.com` |

## 4. Deploy

### Initial Deployment

1. After configuration, click **Deploy**
2. Watch build logs
3. Wait for deployment (usually 1-2 minutes)

### Automatic Deployments

Vercel automatically deploys when:
- Push to `main` branch → Production
- Push to other branches → Preview deployment
- Open/update PR → Preview deployment

## 5. Configure Custom Domain

### Add Domain

1. Go to **Settings** > **Domains**
2. Enter: `app.capveri.com`
3. Click **Add**

`app.capveri.com` is the canonical host for authenticated routes.
Do not serve `/dashboard`, `/auth/*`, `/settings/*`, `/properties/*`,
`/reconciliations/*`, `/admin/*`, `/tenant/*`, `/organization/*`, or
`/portfolio*` from `www.capveri.com`.

### DNS Configuration

Add these DNS records at your domain registrar:

**Option A: CNAME (Recommended)**
| Type | Host | Value |
|------|------|-------|
| CNAME | `app` | `cname.vercel-dns.com` |

**Option B: A Records**
| Type | Host | Value |
|------|------|-------|
| A | `app` | `76.76.21.21` |

### Redirect www

If using `www.capveri.com`:

1. Add both domains in Vercel
2. Set primary domain as `app.capveri.com`
3. Enable redirect for `www`
4. In the marketing project, add redirect rules so app route prefixes on
   `www` are permanently redirected to `https://app.capveri.com`.

### SSL Certificate

Vercel automatically provisions SSL via Let's Encrypt.

## 6. Verify Deployment

### Check Live Site

1. Visit `https://app.capveri.com`
2. Verify page loads correctly
3. Check browser console for errors

### Test Authentication

1. Click Login
2. Verify OAuth redirect works
3. Complete login flow

### Test API Connection

1. Open browser DevTools > Network
2. Trigger an API call
3. Verify requests go to `api.capveri.com`

## 7. Preview Deployments

### How It Works

Every PR gets a unique preview URL:
```
https://capveri-git-feature-branch-username.vercel.app
```

### Configure Preview

1. Go to **Settings** > **Git**
2. Enable **Preview Deployments**
3. Configure branch rules if needed

### Preview Comments

Vercel can comment on PRs with preview links:
1. Go to **Settings** > **Git** > **Vercel for GitHub**
2. Enable PR comments

## 8. Performance Optimization

### Build Optimization

The project includes:
- Code splitting (automatic with Vite)
- Tree shaking
- Minification
- Gzip compression (Vercel CDN)

### Caching

Vercel CDN caches static assets. Headers are set automatically.

### Analyze Bundle

Run locally to check bundle size:
```bash
cd frontend
npm run build
# Check dist folder size
```

## 9. Monitoring

### Vercel Analytics

1. Go to **Analytics** tab
2. View:
   - Page views
   - Performance metrics
   - Web Vitals

### Speed Insights

1. Go to **Speed Insights**
2. View Core Web Vitals:
   - LCP (Largest Contentful Paint)
   - FID (First Input Delay)
   - CLS (Cumulative Layout Shift)

## 10. Rollback

### Rollback Deployment

1. Go to **Deployments**
2. Find previous working deployment
3. Click **...** > **Promote to Production**

### Instant Rollback

Rollbacks are instant since Vercel keeps previous builds.

## 11. Environment-Specific Builds

### Development

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=http://localhost:54321
```

### Staging

```env
VITE_API_URL=https://api-staging.capveri.com
VITE_SUPABASE_URL=https://xxx-staging.supabase.co
```

### Production

```env
VITE_API_URL=https://api.capveri.com
VITE_SUPABASE_URL=https://xxx.supabase.co
```

## 12. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check npm dependencies, Node version |
| 404 on refresh | Verify SPA redirect (automatic with Vite) |
| API CORS errors | Check backend `FRONTEND_URL` setting |
| Env vars undefined | Ensure `VITE_` prefix, redeploy after changes |
| Old version cached | Hard refresh (Ctrl+Shift+R) |

### Debug Build

View build logs:
1. Go to **Deployments**
2. Click on deployment
3. View **Building** logs

### Local Production Build

Test production build locally:
```bash
cd frontend
npm run build
npm run preview
```

## Cost Estimate

| Plan | Features | Cost |
|------|----------|------|
| Hobby | Personal projects | Free |
| Pro | Team features, more bandwidth | $20/user/month |
| Enterprise | Custom | Contact sales |

**Free tier includes:**
- 100 GB bandwidth/month
- Unlimited deployments
- Custom domains
- HTTPS

## Next Steps

- [Domain & SSL Configuration](./06-domain-and-ssl-configuration.md)
- [Security Checklist](../security/01-security-checklist.md)
- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
