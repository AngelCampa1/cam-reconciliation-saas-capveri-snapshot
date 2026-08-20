# CapVeri Deployment Guide

## Deployment Strategy

Production deploys are service-specific:

| Service        | Watches                | URL                     | Platform                              |
| -------------- | ---------------------- | ----------------------- | ------------------------------------- |
| Marketing site | `marketing/`           | https://www.capveri.com | Cloudflare Worker `capveri-marketing` |
| App frontend   | `frontend/`            | https://app.capveri.com | Cloudflare Worker `capveri-app`       |
| Backend API    | `cloudflare-backend/`  | https://api.capveri.com | Cloudflare Worker `capveri-api`       |
| Supabase       | `supabase/migrations/` | Dashboard               | Manual migrations                     |

Do not run Vercel deploys for the marketing site or app frontend. Do not use Railway for the backend. The production domains are routed through Cloudflare Workers.

---

## Deployment Process

### 1. Prepare

Run only the checks for changed projects:

```bash
cd frontend && npm test && npm run typecheck
cd marketing && npm test && npm run typecheck
cd backend && pytest --tb=short
```

### 2. Deploy Frontend or Marketing

```bash
cd frontend && npm run deploy:cf
cd marketing && npm run deploy:cf
```

`frontend/` builds through `scripts/cloudflare-env-runner.mjs`, which loads Wrangler vars plus local env files and refuses to build unless the production Vite values are present: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY`.

`marketing/` builds through `scripts/cloudflare-env-runner.mjs`, which validates public env, runs `next build --webpack` with standalone output, packages with OpenNext, applies the remote D1 migrations for `capveri-ai-sdr-nonces`, and deploys with Wrangler.

### 3. Deploy Backend API

```bash
cd cloudflare-backend
npx wrangler deploy --env production
```

The legacy Python `backend/` tree is not a production Railway deploy target. Production API traffic is served by Cloudflare Worker `capveri-api`.

### 4. Run Database Migrations

```bash
supabase link --project-ref <project-id>
supabase db push
```

Cloudflare D1 migrations for marketing Worker state are applied automatically by `cd marketing && npm run deploy:cf`. To apply or verify manually:

```bash
cd marketing
npx wrangler d1 migrations apply capveri-ai-sdr-nonces --remote
```

### 5. Verify

```bash
cd frontend && npx wrangler deployments status --name capveri-app
cd marketing && npx wrangler deployments status --name capveri-marketing
cd cloudflare-backend && npx wrangler deployments status --name capveri-api
```

Confirm the newest version is serving 100% of traffic. Then verify live routes:

```bash
curl.exe -I https://app.capveri.com/
curl.exe -I https://www.capveri.com/
curl.exe -I --max-redirs 0 https://capveri.com/pricing
curl.exe -I https://api.capveri.com/health
```

---

## Environment Variables

### App Frontend (Cloudflare Worker `capveri-app`)

Public values live in `frontend/wrangler.jsonc`:

```env
VITE_API_URL=https://api.capveri.com
```

Build-time public values that are compiled into the Vite bundle must be present in the shell or ignored local env files before `npm run deploy:cf`:

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_TURNSTILE_SITE_KEY=...
```

Do not commit secrets to `wrangler.jsonc`.

### Marketing Site (Cloudflare Worker `capveri-marketing`)

Public values live in `marketing/wrangler.jsonc`:

```env
NEXT_PUBLIC_API_URL=https://api.capveri.com
NEXT_PUBLIC_SITE_URL=https://www.capveri.com
NEXT_PUBLIC_APP_URL=https://app.capveri.com
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Secrets must be set with Wrangler:

```bash
cd marketing
npx wrangler secret put AI_SDR_CONTEXT_SECRET --name capveri-marketing
```

### Backend API (Cloudflare Worker `capveri-api`)

```env
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=INFO
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
```

Set secrets with Wrangler for `capveri-api`; do not store secret values in `wrangler.jsonc`.

---

## Rollback

Cloudflare Workers:

```bash
npx wrangler rollback --name capveri-app
npx wrangler rollback --name capveri-marketing
npx wrangler rollback --name capveri-api
```

Git rollback:

```bash
git revert <bad-commit-hash>
git push origin master
```

---

## Monitoring

- Cloudflare Workers logs and deployment status: `npx wrangler deployments status --name <worker>`
- Supabase dashboard: https://supabase.com/dashboard

---

## Troubleshooting

### App Frontend 404 on Deep Links

Confirm `frontend/wrangler.jsonc` has `assets.not_found_handling` set to `single-page-application`.

### Marketing Homepage or Dynamic Route 500

Run:

```bash
cd marketing
npm run build:cf
npx wrangler dev
```

The marketing build must use Webpack standalone output (`next build --webpack`) before OpenNext packaging. Do not remove `output: "standalone"` from `marketing/next.config.ts`.

### Backend CORS Errors

Check the Cloudflare backend CORS configuration and Wrangler secrets/vars for `capveri-api`.

### Build Failures

1. Check Wrangler build logs.
2. Ensure all dependencies are in `package.json` / `requirements.txt`.
3. Test locally with `npm run build:cf`, `npm run cf:dry-run`, or backend pytest.
