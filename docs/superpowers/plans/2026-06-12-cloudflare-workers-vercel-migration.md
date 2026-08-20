# Cloudflare Workers Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CapVeri's marketing site and authenticated app frontend off Vercel and onto Cloudflare Workers, using Workers Static Assets and OpenNext where appropriate, while preserving Railway for the FastAPI backend.

**Architecture:** Keep the backend on Railway and migrate only the two Vercel frontends. Deploy the Vite authenticated app as a static-asset Worker with SPA fallback and an optional thin Worker script for `/api/*` proxying and security headers. Deploy the Next.js marketing site as an OpenNext Cloudflare Worker, following the proven pattern in `camaudit-v2/frontend`.

**Tech Stack:** Cloudflare Workers, Workers Static Assets, Wrangler 4.x, `@opennextjs/cloudflare`, Vite 5, Next.js 16 App Router, React 19, Railway FastAPI backend, Supabase, Sentry, PostHog.

---

## Investigation Summary

Current `camaudit` state:

- `frontend/` is a Vite SPA with `frontend/vercel.json` handling security headers, `X-Robots-Tag: noindex`, `/api/:path*` rewrites to `https://api.capveri.com/api/:path*`, and SPA fallback to `/index.html`.
- `marketing/` is a Next.js 16 App Router app with `marketing/vercel.json` handling app-route redirects from `www.capveri.com` to `app.capveri.com` plus apex `capveri.com` to `www.capveri.com`.
- `marketing/next.config.ts` already carries most application redirects and security/cache headers.
- `marketing/src/app/api/og/route.tsx` uses `next/og` with `export const runtime = "edge"`.
- `marketing/src/app/api/ai-sdr/product-context/route.ts` uses `node:crypto`, an in-memory nonce map, and HMAC verification. On Workers this should be changed to persistent nonce storage, because isolate memory is not a replay-protection store.
- `marketing/src/app/build.json/route.ts` currently reports Vercel env names (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`).
- Both `frontend/package.json` and `marketing/package.json` include `@vercel/analytics` / `@vercel/speed-insights` dependencies and runtime usage.
- Root `.gitignore` ignores `.vercel` but does not yet ignore `.open-next/`, `.dev.vars`, `.cloudflare`, or `.wrangler/`.

Reference `camaudit-v2` state:

- `frontend/wrangler.jsonc` deploys one OpenNext Worker named `camaudit-v2` with:
  - `"main": ".open-next/worker.js"`
  - `"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }`
  - `"compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"]`
  - a `WORKER_SELF_REFERENCE` service binding
  - D1 binding `AI_SDR_NONCE_DB`
  - `observability.enabled = true`
  - public `NEXT_PUBLIC_*` values in `vars`
- `frontend/open-next.config.ts` uses `static-assets-incremental-cache` and `enableCacheInterception: true`, intentionally avoiding KV cache bindings.
- `frontend/scripts/cloudflare-env-runner.mjs` builds/deploys through `opennextjs-cloudflare`, validates required public env, requires `SENTRY_AUTH_TOKEN`, imports Wrangler vars into the build env, and blocks Windows symlink/junction `node_modules` deployment.
- `frontend/public/_headers` carries static asset cache headers that Workers Static Assets parses.
- `cloudflare/marketing-data/` is a separate D1-backed Worker, proving this account already uses Wrangler-managed Workers and D1.
- `npx wrangler whoami` in v2 reports an OAuth token for the owner's account with account read, Workers write, Workers routes write, Workers scripts write, D1 write, Pages write, zone read, SSL cert write, and offline access. No additional OAuth is required for the plan phase.
- `npx wrangler pages project list` shows no `camaudit`/`capveri` Pages project. v2 deploys with Wrangler, not Pages Git integration.

Cloudflare documentation checked on 2026-06-12:

- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Migrate from Pages to Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
- SPA routing: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Workers Git builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Next.js on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext Cloudflare adapter: https://opennext.js.org/cloudflare

Cloudflare's current guidance is to use Workers Static Assets for new full-stack/static deployments and to migrate Pages projects to Workers. Pages still exists, but do not use Pages for this migration.

## Target Deployment Model

- `capveri-app`: Cloudflare Worker for `app.capveri.com`, serving `frontend/dist` with `assets.not_found_handling = "single-page-application"`.
- `capveri-marketing`: Cloudflare Worker for `www.capveri.com` and `capveri.com`, built with OpenNext from `marketing/`.
- `api.capveri.com`: stays on Railway FastAPI.
- Railway `camaudit` and `Worker service`: unchanged except CORS may need `https://www.capveri.com`, `https://capveri.com`, and `https://app.capveri.com` confirmed after cutover.
- Vercel projects `camaudit-marketing` and `camaudit_frontend`: kept active until Cloudflare production verification passes, then disconnected or deleted as final cleanup.

## File Map

Create:

- `frontend/wrangler.jsonc`: Vite app Worker config.
- `frontend/src/worker.ts`: optional Worker script for headers and API proxy if native static asset routing is insufficient for all current Vercel behavior.
- `frontend/public/_headers`: static headers equivalent to `frontend/vercel.json`.
- `frontend/public/_redirects`: only if a static redirect is needed for app-host paths; otherwise omit.
- `marketing/wrangler.jsonc`: OpenNext marketing Worker config.
- `marketing/open-next.config.ts`: OpenNext cache strategy.
- `marketing/public/_headers`: static asset cache/noindex headers that need asset-level behavior.
- `marketing/scripts/cloudflare-env-runner.mjs`: adapted from v2, with CapVeri env names and no private secrets in `wrangler.jsonc`.
- `marketing/scripts/validate-cloudflare-env.mjs`: adapted from v2, with CapVeri public env and secret requirements.
- `marketing/scripts/cloudflare-env-runner.test.mjs`: focused tests for env loading and command order.
- `marketing/src/app/api/ai-sdr/product-context/nonce-store.ts`: persistent nonce adapter.
- `marketing/src/app/api/ai-sdr/product-context/nonce-store.test.ts`: replay/expiry tests.
- `docs/infrastructure/cloudflare-workers-migration.md`: operational runbook for cutover, rollback, and post-cutover verification.

Modify:

- `.gitignore`: add `.open-next/`, `.dev.vars`, `.cloudflare`, `.wrangler/`.
- `frontend/package.json` and `frontend/package-lock.json`: add `wrangler`, add `build:cf`, `preview:cf`, `deploy:cf`, remove Vercel packages after replacement, add `cf:dry-run`.
- `frontend/vite.config.ts`: keep `VITE_API_URL` enforcement; add Cloudflare build mode only if needed.
- `frontend/src/App` or root analytics wiring files: remove Vercel Analytics and Speed Insights, replace with Cloudflare Web Analytics only if a token is available.
- `marketing/package.json` and `marketing/package-lock.json`: add `@opennextjs/cloudflare`, `wrangler`, `build:cf`, `preview:cf`, `deploy:cf`, `cf:dry-run`; remove Vercel packages after replacement.
- `marketing/next.config.ts`: replace Vercel-specific env fallbacks, make images compatible with Workers/OpenNext, ensure redirects remain in Next config where OpenNext supports them.
- `marketing/src/app/layout.tsx`: remove `@vercel/analytics/next` and `@vercel/speed-insights/next`, optionally add Cloudflare Web Analytics script gated by `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`.
- `marketing/src/app/build.json/route.ts`: report Cloudflare/GitHub env (`CF_VERSION_METADATA`, `CF_PAGES_COMMIT_SHA`, `GITHUB_SHA`, or explicit build vars) instead of Vercel env.
- `marketing/src/app/api/ai-sdr/product-context/route.ts`: move nonce consumption to persistent D1/KV/DO storage.
- `marketing/src/__tests__/vercel-redirects.test.ts`: replace with Worker/Next redirect coverage.
- `AGENTS.md` and `CLAUDE.md`: replace Vercel deployment verification with Cloudflare Worker verification steps after the migration is actually live.

Remove only after cutover:

- `frontend/vercel.json`
- `marketing/vercel.json`
- Vercel project references in operational docs

## Task 1: Add Shared Worker Artifact Ignores

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add Cloudflare generated artifact ignores**

Add these lines near the existing `.vercel` ignore:

```gitignore
.open-next/
.dev.vars
.cloudflare/
.wrangler/
```

- [ ] **Step 2: Verify ignore behavior**

Run:

```powershell
git check-ignore -v -- ".open-next" ".dev.vars" ".cloudflare" ".wrangler"
```

Expected: each path is reported as ignored by `.gitignore`.

- [ ] **Step 3: Commit**

```powershell
git add -- ".gitignore"
git commit -m "chore(infra): ignore cloudflare worker artifacts"
```

## Task 2: Migrate the Vite App Frontend to Workers Static Assets

**Files:**
- Create: `frontend/wrangler.jsonc`
- Create: `frontend/public/_headers`
- Create: `frontend/src/worker.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/api/url.test.ts`

- [ ] **Step 1: Install Wrangler in `frontend/`**

Run:

```powershell
cd "frontend"
npm install --save-dev wrangler@latest
```

Expected: `frontend/package.json` gains `wrangler`; lockfile updates.

- [ ] **Step 2: Add `frontend/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "capveri-app",
  "main": "src/worker.ts",
  "compatibility_date": "2026-06-12",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  },
  "vars": {
    "VITE_API_URL": "https://api.capveri.com"
  },
  "routes": [
    {
      "pattern": "app.capveri.com",
      "custom_domain": true
    }
  ]
}
```

- [ ] **Step 3: Add `frontend/src/worker.ts`**

```ts
export interface Env {
  ASSETS: Fetcher;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://crm.ventoralabs.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://api.capveri.com https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.sentry.io https://crm.ventoralabs.com; worker-src 'self' blob: https://cdn.jsdelivr.net; child-src 'self' blob:; frame-src 'self' blob:; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests",
};

function withSecurityHeaders(response: Response): Response {
  const next = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    next.headers.set(key, value);
  }
  return next;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const upstream = new URL(url.pathname + url.search, "https://api.capveri.com");
      return fetch(new Request(upstream, request));
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
```

- [ ] **Step 4: Add app static `_headers`**

Create `frontend/public/_headers`:

```text
/*
  X-Robots-Tag: noindex, nofollow
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

The Worker script remains authoritative for the long CSP; `_headers` covers static asset behavior if the Worker script is bypassed or simplified later.

- [ ] **Step 5: Add package scripts**

Update `frontend/package.json` scripts:

```json
{
  "build:cf": "npm run build",
  "preview:cf": "wrangler dev",
  "deploy:cf": "npm run build && wrangler deploy",
  "cf:dry-run": "npm run build && wrangler deploy --dry-run"
}
```

- [ ] **Step 6: Validate local Worker packaging**

Run sequentially:

```powershell
cd "frontend"
npm run typecheck
npm test -- --run src/api/url.test.ts
npm run cf:dry-run
```

Expected: typecheck passes, API URL tests pass, Wrangler dry-run packages the Worker without upload errors.

- [ ] **Step 7: Commit**

```powershell
git add -- "frontend/package.json" "frontend/package-lock.json" "frontend/wrangler.jsonc" "frontend/public/_headers" "frontend/src/worker.ts"
git commit -m "feat(frontend): add cloudflare worker deployment"
```

## Task 3: Migrate the Marketing Next App to OpenNext Workers

**Files:**
- Create: `marketing/wrangler.jsonc`
- Create: `marketing/open-next.config.ts`
- Create: `marketing/public/_headers`
- Create: `marketing/scripts/cloudflare-env-runner.mjs`
- Create: `marketing/scripts/validate-cloudflare-env.mjs`
- Create: `marketing/scripts/cloudflare-env-runner.test.mjs`
- Modify: `marketing/package.json`
- Modify: `marketing/package-lock.json`
- Modify: `marketing/next.config.ts`
- Modify: `marketing/src/app/layout.tsx`
- Modify: `marketing/src/app/build.json/route.ts`
- Test: `marketing/src/__tests__/next-config.test.ts` or nearest existing redirect/header tests

- [ ] **Step 1: Install OpenNext and Wrangler**

Run:

```powershell
cd "marketing"
npm install --save-dev @opennextjs/cloudflare@latest wrangler@latest
```

Expected: dev dependencies and lockfile update.

- [ ] **Step 2: Add `marketing/wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "capveri-marketing",
  "compatibility_date": "2026-06-12",
  "compatibility_flags": [
    "nodejs_compat",
    "global_fetch_strictly_public"
  ],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "capveri-marketing"
    }
  ],
  "d1_databases": [
    {
      "binding": "AI_SDR_NONCE_DB",
      "database_name": "capveri-ai-sdr-nonces",
      "database_id": "REPLACE_WITH_CREATED_D1_ID"
    }
  ],
  "observability": {
    "enabled": true
  },
  "vars": {
    "NEXT_PUBLIC_API_URL": "https://api.capveri.com",
    "NEXT_PUBLIC_SITE_URL": "https://www.capveri.com",
    "NEXT_PUBLIC_APP_URL": "https://app.capveri.com",
    "NEXT_PUBLIC_POSTHOG_HOST": "https://us.i.posthog.com"
  },
  "routes": [
    {
      "pattern": "www.capveri.com",
      "custom_domain": true
    },
    {
      "pattern": "capveri.com",
      "custom_domain": true
    }
  ]
}
```

Before commit, replace `REPLACE_WITH_CREATED_D1_ID` by running:

```powershell
cd "marketing"
npx wrangler d1 create "capveri-ai-sdr-nonces"
```

Expected: Wrangler prints a database id to paste into `wrangler.jsonc`.

- [ ] **Step 3: Add `marketing/open-next.config.ts`**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
```

- [ ] **Step 4: Add marketing `_headers`**

Create `marketing/public/_headers`:

```text
/llms.txt
  Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800

/llms-full.txt
  Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
```

Keep route-level security and cache headers in `next.config.ts` unless OpenNext testing proves a specific header must move to middleware.

- [ ] **Step 5: Adapt v2 deploy runner**

Copy `camaudit-v2/frontend/scripts/cloudflare-env-runner.mjs` into `marketing/scripts/cloudflare-env-runner.mjs`, then make these CapVeri-specific changes:

```js
export const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_POSTHOG_HOST",
];

export const REQUIRED_SECRET_ENV = ["SENTRY_AUTH_TOKEN"];
```

Keep the command plan:

```js
[
  ["npx", ["opennextjs-cloudflare", "build"]],
  ["npx", ["opennextjs-cloudflare", "deploy"]]
]
```

Do not put `SENTRY_AUTH_TOKEN`, `AI_SDR_CONTEXT_SECRET`, Supabase service-role keys, or other private secrets in `wrangler.jsonc`.

- [ ] **Step 6: Add env validation tests**

Create `marketing/scripts/cloudflare-env-runner.test.mjs` with the same test shape as v2, asserting:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getCommandPlan, validateRequiredEnv } from "./cloudflare-env-runner.mjs";

test("deploy runs OpenNext build before deploy", () => {
  assert.deepEqual(getCommandPlan("deploy").slice(-2), [
    ["npx", ["opennextjs-cloudflare", "build"]],
    ["npx", ["opennextjs-cloudflare", "deploy"]],
  ]);
});

test("missing public env fails", () => {
  assert.throws(
    () => validateRequiredEnv({ SENTRY_AUTH_TOKEN: "secret" }),
    /Missing required Cloudflare frontend env variables/,
  );
});

test("missing sentry token fails", () => {
  assert.throws(
    () =>
      validateRequiredEnv({
        NEXT_PUBLIC_API_URL: "https://api.capveri.com",
        NEXT_PUBLIC_SITE_URL: "https://www.capveri.com",
        NEXT_PUBLIC_APP_URL: "https://app.capveri.com",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      }),
    /Missing required Cloudflare secret build env variables: SENTRY_AUTH_TOKEN/,
  );
});
```

- [ ] **Step 7: Add package scripts**

Update `marketing/package.json` scripts:

```json
{
  "build:cf": "node scripts/cloudflare-env-runner.mjs build",
  "preview:cf": "npx opennextjs-cloudflare preview",
  "deploy:cf": "node scripts/cloudflare-env-runner.mjs deploy",
  "cf:dry-run": "node scripts/cloudflare-env-runner.mjs build && npx wrangler deploy --dry-run"
}
```

- [ ] **Step 8: Validate marketing packaging**

Run sequentially:

```powershell
cd "marketing"
npm run typecheck
node scripts/cloudflare-env-runner.test.mjs
npm run build:cf
npx wrangler deploy --dry-run
```

Expected: TypeScript passes, runner tests pass, OpenNext creates `.open-next/worker.js`, and Wrangler dry-run succeeds.

- [ ] **Step 9: Commit**

```powershell
git add -- "marketing/package.json" "marketing/package-lock.json" "marketing/wrangler.jsonc" "marketing/open-next.config.ts" "marketing/public/_headers" "marketing/scripts/cloudflare-env-runner.mjs" "marketing/scripts/validate-cloudflare-env.mjs" "marketing/scripts/cloudflare-env-runner.test.mjs" "marketing/next.config.ts" "marketing/src/app/layout.tsx" "marketing/src/app/build.json/route.ts"
git commit -m "feat(marketing): add opennext cloudflare worker deployment"
```

## Task 4: Replace Marketing In-Memory Nonce Replay Protection

**Files:**
- Create: `marketing/src/app/api/ai-sdr/product-context/nonce-store.ts`
- Create: `marketing/src/app/api/ai-sdr/product-context/nonce-store.test.ts`
- Modify: `marketing/src/app/api/ai-sdr/product-context/route.ts`
- Modify: `marketing/wrangler.jsonc`

- [ ] **Step 1: Create the D1 nonce table**

Create `marketing/migrations/0001_ai_sdr_nonces.sql`:

```sql
CREATE TABLE IF NOT EXISTS ai_sdr_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_sdr_nonces_expires_at
  ON ai_sdr_nonces (expires_at);
```

Run:

```powershell
cd "marketing"
npx wrangler d1 migrations apply "capveri-ai-sdr-nonces" --local
```

Expected: local D1 migration applies.

- [ ] **Step 2: Add nonce store**

```ts
export interface NonceDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
}

export async function consumeNonce(input: {
  db: NonceDatabase;
  nonce: string;
  expiresAt: number;
  now: number;
}): Promise<boolean> {
  await input.db
    .prepare("DELETE FROM ai_sdr_nonces WHERE expires_at <= ?")
    .bind(input.now)
    .run();

  const existing = await input.db
    .prepare("SELECT nonce FROM ai_sdr_nonces WHERE nonce = ?")
    .bind(input.nonce)
    .first<{ nonce: string }>();

  if (existing) {
    return false;
  }

  await input.db
    .prepare("INSERT INTO ai_sdr_nonces (nonce, expires_at) VALUES (?, ?)")
    .bind(input.nonce, input.expiresAt)
    .run();
  return true;
}
```

- [ ] **Step 3: Wire the route to D1**

Change the route handler to read `AI_SDR_NONCE_DB` from the request context. Use the OpenNext Cloudflare binding access pattern documented for the installed `@opennextjs/cloudflare` version. If the binding cannot be accessed directly from the route, move this endpoint into a small dedicated Worker route and proxy it from marketing.

- [ ] **Step 4: Run focused tests**

```powershell
cd "marketing"
npm test -- --run src/app/api/ai-sdr/product-context/nonce-store.test.ts src/app/api/ai-sdr/product-context/__tests__/route.test.ts
```

Expected: first nonce use passes, replay fails, expired nonce is cleaned and can no longer block unrelated requests.

- [ ] **Step 5: Commit**

```powershell
git add -- "marketing/migrations/0001_ai_sdr_nonces.sql" "marketing/src/app/api/ai-sdr/product-context/nonce-store.ts" "marketing/src/app/api/ai-sdr/product-context/nonce-store.test.ts" "marketing/src/app/api/ai-sdr/product-context/route.ts" "marketing/wrangler.jsonc"
git commit -m "fix(marketing): persist ai sdr nonce replay protection"
```

## Task 5: Replace Vercel Analytics and Build Metadata

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `marketing/package.json`
- Modify: `marketing/package-lock.json`
- Modify: `marketing/src/app/layout.tsx`
- Modify: `marketing/src/app/build.json/route.ts`
- Modify: any frontend Vercel analytics import sites found by `rg -n "@vercel|SpeedInsights|Analytics" frontend marketing`

- [ ] **Step 1: Remove Vercel packages**

Run:

```powershell
cd "frontend"
npm uninstall @vercel/analytics @vercel/speed-insights
cd "..\\marketing"
npm uninstall @vercel/analytics @vercel/speed-insights
```

- [ ] **Step 2: Add Cloudflare Web Analytics script only if token exists**

In `marketing/src/app/layout.tsx`, use a validated public token:

```tsx
const cfWebAnalyticsToken = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN;
```

Render Cloudflare's beacon script only when the token is non-empty. Do not hardcode the token.

- [ ] **Step 3: Update build metadata**

Change `marketing/src/app/build.json/route.ts` to prefer:

```ts
process.env.NEXT_PUBLIC_BUILD_COMMIT ||
process.env.CF_PAGES_COMMIT_SHA ||
process.env.GITHUB_SHA ||
"unknown"
```

For `environment`, prefer:

```ts
process.env.CF_WORKER_ENV ||
process.env.NODE_ENV ||
"unknown"
```

- [ ] **Step 4: Verify no Vercel runtime imports remain**

Run:

```powershell
rg -n "@vercel|VERCEL_|vercel-insights|va.vercel" "frontend" "marketing"
```

Expected: only deleted Vercel config files or historical docs remain. Runtime code should have no Vercel analytics imports.

- [ ] **Step 5: Run checks**

```powershell
cd "frontend"
npm run typecheck
cd "..\\marketing"
npm run typecheck
```

Expected: both typechecks pass.

- [ ] **Step 6: Commit**

```powershell
git add -- "frontend/package.json" "frontend/package-lock.json" "marketing/package.json" "marketing/package-lock.json" "marketing/src/app/layout.tsx" "marketing/src/app/build.json/route.ts"
git commit -m "chore(infra): remove vercel runtime dependencies"
```

## Task 6: Add Operational Runbook and Replace Deployment Instructions

**Files:**
- Create: `docs/infrastructure/cloudflare-workers-migration.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create cutover runbook**

Create `docs/infrastructure/cloudflare-workers-migration.md` with these sections:

```markdown
# Cloudflare Workers Migration Runbook

## Production Workers

| Host | Worker | Source | Deploy command |
| --- | --- | --- | --- |
| app.capveri.com | capveri-app | frontend/ | npm run deploy:cf |
| www.capveri.com, capveri.com | capveri-marketing | marketing/ | npm run deploy:cf |
| api.capveri.com | Railway camaudit service | backend/ | git push origin master |

## Pre-Cutover

1. `npx wrangler whoami` must show Workers write, Workers routes write, D1 write, and zone read.
2. `cd frontend && npm run cf:dry-run`
3. `cd marketing && npm run build:cf && npx wrangler deploy --dry-run`
4. Confirm Railway CORS accepts `https://www.capveri.com`, `https://capveri.com`, and `https://app.capveri.com`.

## Deploy

1. Deploy `capveri-app` first with `cd frontend && npm run deploy:cf`.
2. Verify the preview/custom domain before moving DNS.
3. Deploy `capveri-marketing` with `cd marketing && npm run deploy:cf`.
4. Verify the preview/custom domain before moving DNS.
5. Move DNS/custom domains only after both Workers return expected headers and app routes.

## Verification

Run:

```powershell
curl.exe -I "https://app.capveri.com/"
curl.exe -I "https://app.capveri.com/dashboard"
curl.exe -I "https://www.capveri.com/"
curl.exe -I "https://capveri.com/"
curl.exe -I "https://www.capveri.com/build.json"
curl.exe -I "https://www.capveri.com/api/og"
```

Expected:

- `app.capveri.com/dashboard` serves the SPA shell, not a 404.
- `capveri.com` redirects to `https://www.capveri.com/`.
- marketing app paths redirect to `https://app.capveri.com/...`.
- security headers include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, and CSP where applicable.
- `build.json` returns Cloudflare/GitHub build metadata.

## Rollback

1. Repoint DNS/custom domains to Vercel while Vercel projects still exist.
2. Or run `npx wrangler rollback --name capveri-app <version-id>` / `npx wrangler rollback --name capveri-marketing <version-id>`.
3. Confirm `curl.exe -I` responses return to the last healthy deployment.

## Vercel Cleanup

Only after 24 hours of healthy Cloudflare traffic:

1. Disable Git integration or delete Vercel project `camaudit_frontend`.
2. Disable Git integration or delete Vercel project `camaudit-marketing`.
3. Remove `frontend/vercel.json` and `marketing/vercel.json`.
```

- [ ] **Step 2: Update agent deployment instructions**

Replace the Vercel deployment verification section in `AGENTS.md` and `CLAUDE.md` with Cloudflare Worker verification. Keep Railway backend verification unchanged.

- [ ] **Step 3: Run docs grep**

```powershell
rg -n "Vercel|vercel|camaudit_frontend|camaudit-marketing" "AGENTS.md" "CLAUDE.md" "docs/infrastructure/cloudflare-workers-migration.md"
```

Expected: only historical migration notes or explicit Vercel cleanup references remain.

- [ ] **Step 4: Commit**

```powershell
git add -- "docs/infrastructure/cloudflare-workers-migration.md" "AGENTS.md" "CLAUDE.md"
git commit -m "docs(infra): document cloudflare worker deployment"
```

## Task 7: Cloudflare Resource Creation and Secret Configuration

**Files:**
- Modify only `frontend/wrangler.jsonc` and `marketing/wrangler.jsonc` if resource ids or routes need correction.

- [ ] **Step 1: Confirm permissions**

Run:

```powershell
npx wrangler whoami
```

Expected: OAuth token includes account read, Workers write, Workers routes write, D1 write, and zone read. If any are missing, prompt the user to re-authenticate with Wrangler OAuth for the highest available Cloudflare scope.

- [ ] **Step 2: Create/confirm D1 nonce database**

Run:

```powershell
cd "marketing"
npx wrangler d1 list
```

Expected: `capveri-ai-sdr-nonces` exists with the id recorded in `marketing/wrangler.jsonc`. If absent, create it:

```powershell
npx wrangler d1 create "capveri-ai-sdr-nonces"
```

- [ ] **Step 3: Set marketing secrets**

Run one command per secret, entering values from ignored local env files or password manager:

```powershell
cd "marketing"
npx wrangler secret put SENTRY_AUTH_TOKEN
npx wrangler secret put AI_SDR_CONTEXT_SECRET
npx wrangler secret put AI_SDR_PRODUCT_CONTEXT_SECRET
```

Expected: Wrangler confirms each secret upload. Do not paste secret values into tracked files or docs.

- [ ] **Step 4: Confirm custom domains**

Run:

```powershell
cd "frontend"
npx wrangler deploy --dry-run
cd "..\\marketing"
npx wrangler deploy --dry-run
```

Expected: Wrangler accepts route/custom domain config. If Cloudflare requires dashboard approval for custom domains, complete that step before cutover and record it in the runbook.

## Task 8: End-to-End Verification Before Vercel Removal

**Files:**
- Modify tests only if real Cloudflare behavior requires a test adjustment.

- [ ] **Step 1: Run impacted checks sequentially**

```powershell
cd "frontend"
npm test
npm run typecheck
npm run cf:dry-run
cd "..\\marketing"
npm test
npm run typecheck
npm run build:cf
npx wrangler deploy --dry-run
```

Expected: all checks pass.

- [ ] **Step 2: Deploy Workers**

```powershell
cd "frontend"
npm run deploy:cf
cd "..\\marketing"
npm run deploy:cf
```

Expected: Wrangler prints successful deployments and version ids.

- [ ] **Step 3: Verify production endpoints**

Run:

```powershell
curl.exe -I "https://app.capveri.com/"
curl.exe -I "https://app.capveri.com/dashboard"
curl.exe -I "https://www.capveri.com/"
curl.exe -I "https://capveri.com/"
curl.exe -I "https://www.capveri.com/build.json"
curl.exe -I "https://www.capveri.com/api/og"
```

Expected: responses match the runbook.

- [ ] **Step 4: Run production manual E2E**

Use ignored `.env.local` credentials:

```powershell
cd "marketing"
npm run test:e2e:production:manual
```

If app production E2E exists under `frontend/`, run the equivalent against `https://app.capveri.com`.

- [ ] **Step 5: Inspect Worker deployment history**

```powershell
cd "frontend"
npx wrangler deployments list --name "capveri-app"
cd "..\\marketing"
npx wrangler deployments list --name "capveri-marketing"
```

Expected: newest deployments correspond to the commit under verification and receive live traffic.

## Task 9: Remove Vercel Config and Projects After Healthy Cloudflare Traffic

**Files:**
- Delete: `frontend/vercel.json`
- Delete: `marketing/vercel.json`
- Modify: `frontend/package.json`, `marketing/package.json`, docs if any Vercel scripts remain.

- [ ] **Step 1: Wait for healthy Cloudflare soak**

Maintain both Vercel projects for at least 24 hours after Cloudflare cutover. Use logs, endpoint checks, and analytics to confirm traffic is healthy.

- [ ] **Step 2: Delete Vercel config files**

```powershell
git rm -- "frontend/vercel.json" "marketing/vercel.json"
```

- [ ] **Step 3: Remove remaining Vercel references**

```powershell
rg -n "Vercel|vercel|@vercel|VERCEL_" "frontend" "marketing" "AGENTS.md" "CLAUDE.md" "docs"
```

Expected: no runtime or deployment-control references remain. Historical migration notes may remain if clearly marked.

- [ ] **Step 4: Run final checks**

```powershell
cd "frontend"
npm test
npm run typecheck
npm run cf:dry-run
cd "..\\marketing"
npm test
npm run typecheck
npm run build:cf
npx wrangler deploy --dry-run
```

- [ ] **Step 5: Commit**

```powershell
git add -- "frontend/package.json" "frontend/package-lock.json" "marketing/package.json" "marketing/package-lock.json"
git rm -- "frontend/vercel.json" "marketing/vercel.json"
git commit -m "chore(infra): remove vercel deployment config"
```

## Task 10: Final Merge, Push, and Deployment Verification

**Files:**
- No new files unless final fixes are required.

- [ ] **Step 1: Request code review**

Use `superpowers:requesting-code-review` or `review-merge` after all implementation checks pass.

- [ ] **Step 2: Address every review finding**

Apply fixes, then rerun the affected checks sequentially.

- [ ] **Step 3: Merge branch to master**

```powershell
git checkout master
git pull --ff-only
git merge --no-ff cf-migration-plan
```

- [ ] **Step 4: Push**

```powershell
git push origin master
```

- [ ] **Step 5: Verify triggered deployments**

Until the agent instructions are updated, a push to `master` may still trigger Vercel and Railway. Verify all triggered deploys reach their healthy terminal state:

```powershell
cd "frontend"
npx wrangler deployments list --name "capveri-app"
cd "..\\marketing"
npx wrangler deployments list --name "capveri-marketing"
```

Also verify Railway backend services if the push touched backend files or if current repo automation still deploys Railway on every master push.

## Risks and Decisions

- Marketing OpenNext is the larger risk than the Vite app because it has dynamic routes, Sentry source maps, `next/og`, and AI-SDR HMAC logic.
- The AI-SDR nonce map must not remain memory-only on Workers. Use D1 or a Durable Object before production cutover.
- Keep Vercel available for rollback until Cloudflare has served production traffic for at least 24 hours.
- Avoid Cloudflare Pages. Use Workers Static Assets and OpenNext Workers.
- Do not move the FastAPI backend from Railway as part of this plan.
- Do not store secrets in `wrangler.jsonc`; use `wrangler secret put` or Cloudflare dashboard secrets.

## Self-Review

- Spec coverage: The plan investigates `camaudit-v2`, maps current Vercel behavior, defines Cloudflare Workers architecture, checks OAuth capability, and gives end-to-end migration, deployment, verification, rollback, and cleanup steps.
- Placeholder scan: The only replacement token is `REPLACE_WITH_CREATED_D1_ID`, and the plan gives the exact Wrangler command that produces the value before commit. There are no empty implementation stubs.
- Type consistency: Worker names, paths, scripts, and domains are consistent across tasks: `capveri-app`, `capveri-marketing`, `app.capveri.com`, `www.capveri.com`, `capveri.com`, and `api.capveri.com`.
