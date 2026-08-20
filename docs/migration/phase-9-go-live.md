# Phase 9: Go-Live — DNS Cutover & Infrastructure Setup

> **Prerequisites**: Phases 1–8 complete and merged to `master`.
> All `camaudit`/`CAMAudit` brand references have been eliminated from the codebase.
> This phase covers the manual infrastructure steps to make CapVeri publicly accessible at `capveri.com`.

---

## Overview

The codebase is fully rebranded. Going live requires:
1. Pushing code to trigger auto-deployments
2. Configuring custom domains in Vercel and Railway
3. Pointing DNS at the new services
4. Updating Supabase auth config
5. Updating production environment variables
6. Configuring the email sending domain
7. Creating new Google/Apple OAuth credentials for CapVeri
8. Setting up GTM & GA4
9. Verifying end-to-end

Estimated time: 30–60 minutes (plus DNS propagation, which can take up to 24h but is usually minutes).

---

## Step 1 — Push Code to `master`

This triggers automatic deployments on Railway (backend) and Vercel (frontend + marketing).

```bash
git push
```

Watch deploy logs in the Railway and Vercel dashboards to confirm all three services deploy successfully before continuing.

---

## Step 2 — Vercel: Add Custom Domains

Do this for **both** Vercel projects.

### 2a. Marketing site (`www.capveri.com`)
1. Open [vercel.com/dashboard](https://vercel.com/dashboard) → select the marketing project
2. Go to **Settings → Domains**
3. Add `www.capveri.com`
4. Also add `capveri.com` (bare domain) and set it to redirect → `www.capveri.com`
5. Vercel will show you the DNS records to add (usually a CNAME pointing to `cname.vercel-dns.com`)

### 2b. App frontend (`app.capveri.com`)
1. Select the app/frontend project in Vercel
2. Go to **Settings → Domains**
3. Add `app.capveri.com`
4. Vercel will show you the DNS record (CNAME to `cname.vercel-dns.com`)

> **Note**: If Vercel asks to verify domain ownership first, add the TXT record it provides, then re-add the CNAME.

---

## Step 3 — Railway: Add Custom Domain

1. Open [railway.app](https://railway.app) → your backend service
2. Go to **Settings → Networking → Custom Domain**
3. Add `api.capveri.com`
4. Railway will give you a CNAME target (e.g., `<hash>.up.railway.app`)

---

## Step 4 — DNS Records at Your Registrar

Log in to wherever `capveri.com` is registered (e.g., Namecheap, Cloudflare, GoDaddy).

Add the following records using the exact targets Vercel and Railway provided in Steps 2–3:

| Type | Name | Target | TTL |
|------|------|--------|-----|
| CNAME | `www` | `cname.vercel-dns.com` | 300 |
| CNAME | `app` | `cname.vercel-dns.com` | 300 |
| CNAME | `api` | `<your-railway-cname>.up.railway.app` | 300 |
| A or ALIAS | `@` (bare) | Vercel's IP or redirect to `www` | 300 |

> **Cloudflare users**: Set proxy status to **DNS only** (grey cloud) initially. Enable proxying after SSL certs are confirmed.

To verify DNS is propagating:
```bash
dig www.capveri.com CNAME +short
dig app.capveri.com CNAME +short
dig api.capveri.com CNAME +short
```

---

## Step 5 — Supabase: Update Auth Configuration

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) → your project
2. Go to **Authentication → URL Configuration**
3. Update **Site URL**:
   ```
   https://app.capveri.com
   ```
4. Under **Redirect URLs**, add:
   ```
   https://app.capveri.com/**
   ```
5. Remove any `camaudit.io` entries from the redirect list
6. Click **Save**

> **Why this matters**: Supabase uses Site URL for magic link and OAuth redirect validation. Wrong URL = broken login.

---

## Step 6 — Update Production Environment Variables

### Railway (backend)
Go to your Railway service → **Variables** and confirm/set these:

| Variable | New Value | Notes |
|----------|-----------|-------|
| `ENVIRONMENT` | `production` | Disables debug mode and removes localhost CORS entries |
| `CORS_ORIGINS` | `["https://app.capveri.com","https://www.capveri.com","https://capveri.com"]` | JSON array — Pydantic parses this as `list[str]` |
| `RESEND_FROM_ADDRESS` | `CapVeri <noreply@capveri.com>` | Set explicitly (matches the default but good to pin) |

> **Note**: `SITE_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, and `MARKETING_URL` are **not** read by the backend — do not add them.

### Vercel (frontend + marketing)
Go to each Vercel project → **Settings → Environment Variables** and set:

| Variable | Project | New Value |
|----------|---------|-----------|
| `VITE_API_URL` | frontend (app) | `https://api.capveri.com` |
| `NEXT_PUBLIC_API_URL` | marketing | `https://api.capveri.com` |
| `NEXT_PUBLIC_SITE_URL` | marketing | `https://www.capveri.com` |
| `NEXT_PUBLIC_APP_URL` | marketing | `https://app.capveri.com` |

After updating env vars, **redeploy** both Vercel projects so they pick up the new values:
- Vercel dashboard → Deployments → click the latest → Redeploy

---

## Step 7 — Resend: Configure Email Sending Domain

1. Open [resend.com](https://resend.com) → **Domains → Add Domain**
2. Add `capveri.com`
3. Resend will give you DNS records to add (SPF TXT, DKIM CNAME, and optionally DMARC TXT)
4. Add those records at your registrar
5. Click **Verify** in Resend once propagated
6. In Railway, update the email env var:
   ```
   FROM_EMAIL=noreply@capveri.com
   ```
7. Redeploy the backend

> **Note**: Until this step is complete, transactional emails (magic links, invites, reports) will fail or send from the old domain.

---

## Step 8 — Google & Apple SSO: Create New OAuth Credentials

The existing OAuth apps belong to camaudit-v2 and must **not** be reused. Create fresh credentials for CapVeri.

### 8a. Google OAuth (Google Cloud Console)

1. Open [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project named **CapVeri** (or use an existing CapVeri GCP project)
3. Go to **APIs & Services → OAuth consent screen**
   - App name: `CapVeri`
   - User support email / developer contact: your email
   - Authorized domains: `capveri.com`
   - Save
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: `CapVeri Web`
   - Authorized JavaScript origins:
     ```
     https://app.capveri.com
     ```
   - Authorized redirect URIs:
     ```
     https://[your-supabase-project-ref].supabase.co/auth/v1/callback
     ```
5. Copy the **Client ID** and **Client Secret**
6. Supabase Dashboard → **Authentication → Providers → Google**
   - Paste the new Client ID and Client Secret
   - Save

### 8b. Apple Sign In (Apple Developer Portal)

1. Open [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles**
2. **Register a new App ID** (if you don't already have one for CapVeri):
   - Platform: iOS/macOS or multiplatform, Bundle ID: `com.capveri.app`
   - Enable **Sign In with Apple** capability
3. **Register a new Services ID** for the web flow:
   - Description: `CapVeri Web`
   - Identifier: `com.capveri.web` (must be unique)
   - Enable **Sign In with Apple → Configure**:
     - Primary App ID: the App ID from above
     - Domains: `app.capveri.com`
     - Return URLs: `https://[your-supabase-project-ref].supabase.co/auth/v1/callback`
   - Save
4. **Create a new Key** for Sign in with Apple:
   - Go to **Keys → + (new key)**
   - Name: `CapVeri Sign in with Apple`
   - Enable **Sign In with Apple**, configure with the App ID from above
   - Download the `.p8` private key file (you only get one download)
   - Note the **Key ID** and your **Team ID** (shown in top-right of the portal)
5. Supabase Dashboard → **Authentication → Providers → Apple**
   - Services ID: `com.capveri.web`
   - Team ID, Key ID: from above
   - Private key: paste the contents of the `.p8` file
   - Save

---

## Step 9 — GTM & GA4 Setup

The marketing site (`layout.tsx`) is already wired to read `NEXT_PUBLIC_GTM_ID` and `NEXT_PUBLIC_GA_ID` — you just need to create the accounts and set the env vars.

### 9a. Create GA4 Property

1. Open [analytics.google.com](https://analytics.google.com) → **Admin → Create Property**
2. Property name: `CapVeri`
3. URL: `https://www.capveri.com`
4. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)

### 9b. Create GTM Container

1. Open [tagmanager.google.com](https://tagmanager.google.com) → **Create Account**
2. Account name: `CapVeri`, container name: `www.capveri.com`, platform: **Web**
3. Copy the **Container ID** (format: `GTM-XXXXXXX`)
4. Inside GTM: add a GA4 Configuration tag using the Measurement ID from 9a, trigger: **All Pages**
5. Publish the container

### 9c. Set Vercel Environment Variables

In the **marketing** Vercel project → **Settings → Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` |
| `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` |

Set both for **Production** environment, then redeploy.

> **Note**: Both vars are optional at runtime — if blank, the scripts are simply omitted. Don't set placeholder values.

---

## Step 11 — Optional: Stripe Dashboard Branding

If you have active Stripe products/prices still named "CAMAudit":
1. Stripe Dashboard → **Products** → rename display names to CapVeri
2. Stripe Dashboard → **Settings → Business Settings** → update business name if needed
3. Update any Stripe email receipt branding

This is cosmetic and non-blocking for the initial launch.

---

## Step 10 — Verification Checklist

After DNS has propagated (run `dig` commands from Step 4 to confirm), verify each surface:

### Public pages
- [ ] `https://www.capveri.com` — marketing homepage loads
- [ ] `https://www.capveri.com/pricing` — pricing page loads
- [ ] `https://capveri.com` — redirects to `www.capveri.com`

### App
- [ ] `https://app.capveri.com` — app loads without console errors
- [ ] Login with email/password works
- [ ] Login with magic link works (tests Supabase + Resend + redirect URLs)
- [ ] After login, dashboard loads correctly

### API
- [ ] `https://api.capveri.com/health` — returns `{"status": "ok"}`
- [ ] `https://api.capveri.com/docs` — FastAPI Swagger UI loads
- [ ] CORS: app at `app.capveri.com` can call `api.capveri.com` without CORS errors

### Email
- [ ] Trigger a magic link → email arrives from `noreply@capveri.com`
- [ ] Email lands in inbox (not spam) — indicates SPF/DKIM is working

---

## Step 12 — Post-Launch (SEO & Analytics)

Once the site is live and verified:

1. **Google Search Console**
   - Add property for `https://www.capveri.com`
   - Submit sitemap: `https://www.capveri.com/sitemap.xml`

2. **Google Analytics / GA4** — confirm events are flowing (see Step 9 for setup)
   - Open GA4 → **Realtime** report and visit the live site to verify hits appear

3. **Bing Webmaster Tools** — submit sitemap

4. **Re-crawl with Firecrawl** — delete `.firecrawl/` cache, re-run crawl against new domain

---

## Rollback Plan

If something goes wrong after DNS cutover:
- **Vercel**: Instantly revert to previous deployment (Deployments → Promote)
- **Railway**: Restart previous deployment from the deployments list
- **DNS**: Change CNAME targets back to old Vercel/Railway URLs (propagation is fast at TTL=300)
- **Supabase**: Restore old Site URL and redirect URLs in Auth config

---

## Reference

| Service | Dashboard |
|---------|-----------|
| Vercel | [vercel.com/dashboard](https://vercel.com/dashboard) |
| Railway | [railway.app](https://railway.app) |
| Supabase | [supabase.com/dashboard](https://supabase.com/dashboard) |
| Resend | [resend.com](https://resend.com) |
| Stripe | [dashboard.stripe.com](https://dashboard.stripe.com) |
| Google Search Console | [search.google.com/search-console](https://search.google.com/search-console) |
| Google Tag Manager | [tagmanager.google.com](https://tagmanager.google.com) |
| Google Analytics | [analytics.google.com](https://analytics.google.com) |
| Google Cloud Console | [console.cloud.google.com](https://console.cloud.google.com) |
| Apple Developer | [developer.apple.com](https://developer.apple.com) |
