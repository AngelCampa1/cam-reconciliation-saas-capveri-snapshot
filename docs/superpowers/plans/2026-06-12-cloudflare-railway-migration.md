# Cloudflare Railway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Railway bill by moving CapVeri backend compute and background jobs to Cloudflare-native services while keeping the existing Postgres database boundary, referred to by the product owner as Neon, in place for now.

**Architecture:** Build a new TypeScript Cloudflare backend rather than a direct FastAPI transliteration. The new backend uses Workers for HTTP, Hyperdrive for Postgres/Neon access, R2 for object storage, Queues for dispatch, Workflows for long-running orchestration, Durable Objects for coordination/idempotency, and Cron Triggers for scheduled work. Existing database/auth semantics must be preserved; database migration is out of scope.

**Tech Stack:** Cloudflare Workers Paid, TypeScript, Hono, Zod, OpenAPI generation, Hyperdrive, Postgres.js or node-postgres, R2, Queues, Workflows, Durable Objects, Vitest, Miniflare/Wrangler, Neon/Postgres, OpenRouter, Stripe, Resend, Sentry/PostHog.

---

## Current Evidence

The repository currently documents Railway as the backend host and shows two Railway services in production: `camaudit` for FastAPI and `Worker service` for Celery. See `AGENTS.MD` and `CLAUDE.md`.

The runtime code still has these Railway-shaped responsibilities:

- HTTP API: `backend/app/main.py`. `create_app()` builds the app, mounts `/api/v1` and root `/webhooks`, and exports `app = create_app()`.
- Production API start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` in `docs/guides/02-deployment/03-backend-deployment-railway.md`.
- API router registry: `backend/app/api/v1/__init__.py`, which aggregates auth, billing, ingestion, reconciliation, documents, extractions, tenant portal, reports, exports, and other app domains.
- Root webhooks: `backend/app/api/routes/webhooks.py`, mounted outside `/api/v1`.
- Celery app: `backend/app/celery_app.py`, named `capveri`, backed by Redis broker/result backend, late acknowledgements, prefetch `1`, soft limit `600`, hard limit `720`, and autodiscovery for extraction tasks.
- Extraction Celery task and retry logic: `backend/app/services/extraction/job_queue.py`. The live Celery task is `app.services.extraction.process_extraction_task`; enqueue points are new extraction jobs and retries.
- Reconciliation in-process background task: `backend/app/api/v1/reconciliation.py`, which uses FastAPI `BackgroundTasks`.
- Other FastAPI background work: signup welcome email in `backend/app/api/v1/auth.py`, lead capture and nurture/enrollment in `backend/app/api/v1/leads.py`, and team invitation email in `backend/app/api/v1/team/invitations.py`.
- Fire-and-forget request telemetry: `asyncio.create_task` in `backend/app/main.py`.
- R2-backed object storage adapter, still named `s3_client.py`: `backend/app/services/extraction/s3_client.py`
- Health checks: `backend/app/services/health.py`
- OpenRouter extraction pipeline: `backend/app/services/extraction/`
- Deterministic financial math: `backend/app/services/calculation/`
- Upload surfaces currently handled by Python request bodies: lease PDFs in `backend/app/api/v1/documents.py`, GL ingestion in `backend/app/api/v1/ingestion.py`, actual billed uploads in `backend/app/api/v1/actual_billed.py`, rent roll preview/import in `backend/app/api/v1/rent_roll.py`, feedback screenshots in `backend/app/api/v1/feedback.py`, and tenant dispute attachments in `backend/app/api/v1/tenant/disputes.py`.

Database reality needs an explicit first task. The product owner says to keep Neon for now, but this worktree still contains Supabase/Auth/PostgREST-heavy code and no `NEON_*` configuration. The migration must not silently move or rewrite the database. The implementation must discover and preserve the real production Postgres/Auth contract before the cutover.

Official Cloudflare facts used by this plan, current as of 2026-06-12:

- Workers Paid includes Workers, Pages Functions, KV, Hyperdrive, and Durable Objects usage for a minimum account charge of $5/month, with no additional data transfer/throughput charge. Workers Standard includes 10M requests/month and 30M CPU ms/month, then $0.30/M requests and $0.02/M CPU ms. Source: https://developers.cloudflare.com/workers/platform/pricing/
- Hyperdrive is included in Workers Paid, has unlimited database queries on Paid, and has no data transfer charge. Source: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- For Neon with Hyperdrive, Cloudflare recommends connecting directly through a driver such as `pg` or Postgres.js rather than the Neon serverless driver. Source: https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/
- Workers Paid can raise CPU limit to 5 minutes per invocation, but memory is 128 MB per isolate and startup must stay under 1 second. Source: https://developers.cloudflare.com/workers/platform/limits/
- Queue consumers have 15 minutes wall-clock time; messages are billed by 64 KB read/write/delete operations. Paid includes 1M queue operations/month, then $0.40/M operations. Sources: https://developers.cloudflare.com/queues/platform/limits/ and https://developers.cloudflare.com/queues/platform/pricing/
- Workflows Paid supports long wall-clock steps, 10,000 default steps configurable to 25,000, 50,000 concurrent workflow instances, and 300 instance creations/second per account. Workflows are billed as Workers plus persisted state. Sources: https://developers.cloudflare.com/workflows/reference/limits/ and https://developers.cloudflare.com/workflows/reference/pricing/
- R2 standard storage includes 10 GB-month, 1M Class A ops, 10M Class B ops monthly, with free egress; overage is $0.015/GB-month, $4.50/M Class A, $0.36/M Class B. Source: https://developers.cloudflare.com/r2/pricing/

---

## Non-Negotiable Requirements

1. Railway compute reaches zero production dependency: no production HTTP requests, webhooks, scheduled jobs, background jobs, or health checks depend on Railway.
2. Railway billable resources reach zero: API service, worker service, Redis/add-ons, volumes, public domains, auto-deploy links, orphan services, and any other billable Railway resources are stopped or deleted after cutover verification.
3. Database remains the current Postgres provider for now. If production is Neon and the backend talks directly to Postgres, use Neon through Cloudflare Hyperdrive. If production still depends on Supabase Auth/PostgREST in front of Postgres, preserve that boundary until a separate database/auth migration is explicitly planned.
4. No containers. Cloudflare Containers are out of scope for this migration.
5. Large files never pass through Worker memory. Browser uploads go directly to R2 with signed URLs or multipart upload. Queue and Workflow payloads contain IDs and R2 keys, not PDF/XLSX bytes.
6. New code must be clean, modular, typed, and testable. Route handlers stay thin. Domain logic must not import Cloudflare bindings directly.
7. All money and CAM math remains deterministic. LLMs remain advisory/extraction only, never financial math.
8. Rollout must be reversible until the final cutover. Railway remains as a fallback during shadow and canary phases, but the soak period must use the cheapest possible fallback posture.
9. Every task gets implementation review, spec review, and code quality review before the next task starts.

---

## Target Runtime

```text
api.capveri.com
  Cloudflare Worker HTTP API
    - Hono router
    - Zod request/response validation
    - generated OpenAPI
    - structured JSON logs
    - Sentry/PostHog adapters
    - auth middleware
    - per-route cost/latency metrics

Cloudflare service bindings
  api-worker
  webhook-worker
  extraction-worker
  reconciliation-worker
  export-worker
  cron-worker

Cloudflare platform bindings
  Hyperdrive -> current Postgres/Neon connection string
  R2 -> documents, imports, exports, forensic snapshots
  Queues -> extraction, reconciliation, export, email, analytics
  Workflows -> long-running extraction and reconciliation orchestration
  Durable Objects -> org/job coordinator, idempotency, per-org throttles
  Cron Triggers -> cleanup, retries, scheduled nurture/winback

External services retained
  Postgres/Neon
  Auth provider currently used by production
  OpenRouter
  Stripe
  Resend
  Sentry
  PostHog
```

---

## Clean Code Standard For New Cloudflare Code

Create a separate backend package so the new runtime is not polluted by Python-era assumptions.

```text
cloudflare-backend/
  package.json
  tsconfig.json
  vitest.config.ts
  wrangler.jsonc
  src/
    index.ts
    app.ts
    env.ts
    http/
      errors.ts
      json.ts
      openapi.ts
      validation.ts
    middleware/
      auth.ts
      cors.ts
      correlation.ts
      rate-limit.ts
      security-headers.ts
    platform/
      cloudflare.ts
      hyperdrive.ts
      r2.ts
      queues.ts
      workflows.ts
      durable-objects.ts
    adapters/
      db/
        client.ts
        postgres.ts
        supabase-compat.ts
        transaction.ts
      auth/
        verifier.ts
        supabase-jwt.ts
      storage/
        documents.ts
        signed-uploads.ts
      ai/
        openrouter.ts
      billing/
        stripe.ts
      email/
        resend.ts
      analytics/
        posthog.ts
        sentry.ts
    domain/
      billing/
      extraction/
      ingestion/
      reconciliation/
      reports/
      tenant/
      team/
      properties/
      leases/
      units/
      pools/
    routes/
      health.ts
      webhooks.ts
      billing.ts
      documents.ts
      extraction.ts
      reconciliation.ts
      ingestion.ts
      properties.ts
      leases.ts
      units.ts
      tenant.ts
      team.ts
    workflows/
      lease-extraction.ts
      reconciliation.ts
      export.ts
    queues/
      consumers.ts
      producers.ts
    durable-objects/
      org-job-coordinator.ts
      rate-limit-bucket.ts
    test/
      fixtures/
      helpers/
```

Design rules:

- `routes/*` only parses input, calls a domain service, and serializes output.
- `domain/*` contains business workflows and imports adapter interfaces, not Cloudflare binding types.
- `platform/*` is the only place that knows about Cloudflare binding shapes.
- `adapters/*` wraps external vendors and database access.
- `workflows/*` only stores compact state and R2 keys; durable business records live in Postgres.
- `queues/*` messages are versioned Zod schemas and stay under 64 KB.
- Generated OpenAPI must remain stable enough for `frontend/src/api/generated/`.
- No implicit `any`; use `unknown` plus narrowing when necessary.
- No hidden singleton mutable state except durable object state.
- Every module should be small enough to review in one screenful unless it is a generated schema.

---

## Subagent Execution Model

Each task below is executed by a fresh implementer subagent.

For every task:

1. Implementer writes failing tests first.
2. Implementer makes the minimal production change.
3. Implementer runs the task-specific validation commands.
4. Spec reviewer checks task output against this plan before commit.
5. Implementer fixes every spec issue and reruns validation.
6. Code quality reviewer checks maintainability, boundaries, tests, and cost risks before commit.
7. Implementer fixes every important quality issue and reruns validation.
8. Implementer commits only task files after both reviews pass.
9. Main coordinator marks the task complete after reviewing the commit.

No implementation subagents run in parallel if their write sets overlap. Exploration and review subagents may run in parallel.

---

## Phase 0: Ground Truth And Scaffold

### Task 0.1: Production Boundary Inventory

**Files:**
- Create: `docs/architecture/cloudflare-railway-migration-inventory.md`
- Read: `AGENTS.MD`
- Read: `CLAUDE.md`
- Read: `docs/DEPLOYMENT.md`
- Read: `docs/architecture/system-architecture.md`
- Read: `backend/app/config.py`
- Read: `backend/.env.example`
- Read: `.env.example`
- Read: `frontend/src/lib/supabase.ts`
- Read: `frontend/src/api/client.ts`
- Read: `backend/app/database/client.py`
- Read: `backend/app/auth/dependencies.py`

- [ ] **Step 1: Document the authoritative deployment map**

Create `docs/architecture/cloudflare-railway-migration-inventory.md` with these sections:

```markdown
# Cloudflare Railway Migration Inventory

## Production Goal

Eliminate Railway compute. Keep the current Postgres database provider for now.

## Current Production Compute

| Responsibility | Current host | Evidence | Target host |
|---|---|---|---|
| Backend HTTP API | Railway `camaudit` | `AGENTS.MD` Railway backend section | Cloudflare Workers |
| Background worker | Railway `Worker service` | `AGENTS.MD` Railway backend section | Cloudflare Queues/Workflows |
| Redis / queue backend | Inspect Railway services/plugins and env vars | Cloudflare Queues/Workflows |
| Volumes/add-ons/domains | Inspect Railway project resources | Delete or detach during retirement |

## Current Database/Auth Boundary

| Concern | Current evidence | Migration treatment |
|---|---|---|
| Postgres provider | Product owner says Neon; repo still has Supabase config | Preserve; do not migrate data |
| Auth/session provider | Record the exact provider, JWT issuer, JWKS/signing method, anonymous-session support, and OAuth providers found in repo and production env | Preserve contract for frontend |
| RLS/session claims | Record the exact database functions, session variables, JWT claims, and service/admin bypass mechanism found in migrations and runtime config | Preserve or emulate exactly |

## Current Storage Boundary

| Bucket/use | Current evidence | Migration treatment |
|---|---|---|
| Lease documents | R2 adapter exists | Keep R2 |
| Reports/exports/screenshots/disputes | Record every storage bucket/API used by current route code and migrations | Move to R2 only if currently tied to Railway-hosted code paths |

## Unknowns That Block Cutover

List each unknown as a concrete command, dashboard check, or environment variable inspection needed to prove the production boundary.

## Railway Billable Resource Checklist

Record the current state and final retirement action for:

- `camaudit` API service
- `Worker service`
- Redis service/plugin or external Redis provider
- Volumes
- Custom domains and generated Railway domains
- GitHub auto-deploy links
- Environment variables/secrets that should be moved to Cloudflare
- Orphan services in project `Capveri`
- Railway project-level settings that could keep billing active
```

- [ ] **Step 2: Verify the inventory is evidence-backed**

Run:

```powershell
rg -n "Railway|Neon|SUPABASE|DATABASE_URL|DOCUMENTS_R2|CELERY|REDIS|api.capveri.com" "docs/architecture/cloudflare-railway-migration-inventory.md" "AGENTS.MD" "backend/app/config.py" "frontend/src/api/client.ts"
```

Expected: the new inventory and source files are listed. No claim in the inventory should be unsupported by a source path or an explicit production-env check item.

- [ ] **Step 3: Commit**

```powershell
git add -- "docs/architecture/cloudflare-railway-migration-inventory.md"
git commit -m "docs: inventory railway migration boundaries"
```

### Task 0.2: Cloudflare Backend Package Scaffold

**Files:**
- Create: `cloudflare-backend/package.json`
- Create: `cloudflare-backend/tsconfig.json`
- Create: `cloudflare-backend/vitest.config.ts`
- Create: `cloudflare-backend/wrangler.jsonc`
- Create: `cloudflare-backend/src/env.ts`
- Create: `cloudflare-backend/src/index.ts`
- Create: `cloudflare-backend/src/app.ts`
- Create: `cloudflare-backend/src/http/json.ts`
- Create: `cloudflare-backend/src/http/errors.ts`
- Create: `cloudflare-backend/src/http/validation.ts`
- Create: `cloudflare-backend/src/test/app.test.ts`

- [ ] **Step 1: Write failing smoke tests**

Create `cloudflare-backend/src/test/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

const env = {
  ENVIRONMENT: 'test',
  APP_VERSION: '0.1.0-test',
} as const

describe('cloudflare backend app', () => {
  it('serves health without touching external services', async () => {
    const app = createApp()
    const res = await app.request('/health', {}, env)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'healthy',
      version: '0.1.0-test',
      environment: 'test',
      runtime: 'cloudflare-workers',
    })
  })

  it('returns JSON 404 errors', async () => {
    const app = createApp()
    const res = await app.request('/missing', {}, env)
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: 'not_found',
      },
    })
  })
})
```

- [ ] **Step 2: Add package metadata**

Create `cloudflare-backend/package.json`:

```json
{
  "name": "capveri-cloudflare-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy:staging": "wrangler deploy --env staging",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write \"src/**/*.{ts,json}\""
  },
  "dependencies": {
    "@hono/zod-openapi": "^0.19.0",
    "hono": "^4.10.0",
    "postgres": "^3.4.7",
    "zod": "^4.3.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.10.0",
    "@cloudflare/workers-types": "^4.20260601.0",
    "@types/node": "^25.0.0",
    "eslint": "^9.39.0",
    "prettier": "^3.7.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0",
    "wrangler": "^4.50.0"
  }
}
```

- [ ] **Step 3: Add TypeScript config**

Create `cloudflare-backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "vitest"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Add Wrangler config with cost guardrails**

Create `cloudflare-backend/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "capveri-api-dev",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-12",
  "compatibility_flags": ["nodejs_compat"],
  "limits": {
    "cpu_ms": 30000
  },
  "vars": {
    "ENVIRONMENT": "development",
    "APP_VERSION": "0.1.0"
  },
  "observability": {
    "enabled": true
  },
  "env": {
    "staging": {
      "name": "capveri-api-staging",
      "vars": {
        "ENVIRONMENT": "staging",
        "APP_VERSION": "0.1.0"
      }
    }
  }
}
```

- [ ] **Step 5: Add the minimal app**

Create `cloudflare-backend/src/env.ts`:

```ts
export type AppEnv = {
  ENVIRONMENT: string
  APP_VERSION: string
}
```

Create `cloudflare-backend/src/http/json.ts`:

```ts
import type { Context } from 'hono'
import type { AppEnv } from '../env'

export type JsonBody = Record<string, unknown> | readonly unknown[]

export function json(c: Context<{ Bindings: AppEnv }>, body: JsonBody, status = 200): Response {
  return c.json(body, status)
}
```

Create `cloudflare-backend/src/http/errors.ts`:

```ts
import type { Context } from 'hono'
import type { AppEnv } from '../env'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function errorResponse(c: Context<{ Bindings: AppEnv }>, error: unknown): Response {
  if (error instanceof HttpError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status)
  }
  return c.json(
    { error: { code: 'internal_error', message: 'Unexpected server error' } },
    500,
  )
}
```

Create `cloudflare-backend/src/http/validation.ts`:

```ts
import { z } from 'zod'

export const healthResponseSchema = z.object({
  status: z.literal('healthy'),
  version: z.string(),
  environment: z.string(),
  runtime: z.literal('cloudflare-workers'),
})
```

Create `cloudflare-backend/src/app.ts`:

```ts
import { Hono } from 'hono'
import type { AppEnv } from './env'
import { errorResponse } from './http/errors'
import { json } from './http/json'

export function createApp(): Hono<{ Bindings: AppEnv }> {
  const app = new Hono<{ Bindings: AppEnv }>()

  app.onError((error, c) => errorResponse(c, error))

  app.get('/health', (c) =>
    json(c, {
      status: 'healthy',
      version: c.env.APP_VERSION,
      environment: c.env.ENVIRONMENT,
      runtime: 'cloudflare-workers',
    }),
  )

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: 'not_found',
          message: 'Route not found',
        },
      },
      404,
    ),
  )

  return app
}
```

Create `cloudflare-backend/src/index.ts`:

```ts
import { createApp } from './app'

export default createApp()
```

- [ ] **Step 6: Run validation**

```powershell
cd "cloudflare-backend"
npm install
npm test
npm run typecheck
```

Expected: tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```powershell
git add -- "cloudflare-backend/package.json" "cloudflare-backend/package-lock.json" "cloudflare-backend/tsconfig.json" "cloudflare-backend/vitest.config.ts" "cloudflare-backend/wrangler.jsonc" "cloudflare-backend/src"
git commit -m "feat: scaffold cloudflare backend"
```

### Task 0.3: Runtime Feasibility And Cost Model

**Files:**
- Create: `docs/architecture/cloudflare-runtime-feasibility.md`
- Create: `docs/architecture/cloudflare-cost-model.md`
- Read: `backend/pyproject.toml`
- Read: `backend/app/services/ingestion/`
- Read: `backend/app/services/extraction/`
- Read: `backend/app/services/export/`
- Read: `backend/app/services/reports/`
- Read: `backend/app/services/calculation/`

- [ ] **Step 1: Inventory heavy Python dependencies**

Create `docs/architecture/cloudflare-runtime-feasibility.md` with this table:

```markdown
# Cloudflare Runtime Feasibility

## Heavy Dependency Inventory

| Current dependency | Current use | Worker-compatible replacement or design | Proof required |
|---|---|---|---|
| pandas | CSV/Excel parsing and normalization | streaming CSV parser plus focused XLSX parser, or R2-backed chunked workflow | representative import fixture under Worker memory/CPU limits |
| numpy/statsmodels | anomaly/trend analysis | port only required formulas or queue advisory analysis separately | golden output parity |
| reportlab | PDF generation | HTML-to-PDF alternative, lightweight PDF library, or R2-staged async generation | representative export under Worker memory/CPU limits |
| openpyxl | Excel import/export | xlsx library with streaming/chunking or async R2 staged workflow | representative workbook under Worker memory/CPU limits |
| boto3/botocore | R2 S3-compatible access | native R2 binding | storage adapter tests |
| celery/redis | extraction queue/retry | Queues and Workflows | queue/workflow integration tests |
```

- [ ] **Step 2: Define representative workload fixtures**

Add a section listing exact fixture categories to test:

```markdown
## Representative Workloads

- Small lease PDF, typical lease PDF, largest allowed lease PDF.
- Small GL CSV, typical GL CSV, largest expected GL CSV.
- Small XLSX rent roll, typical XLSX rent roll, largest expected XLSX rent roll.
- Typical reconciliation property/year.
- Large reconciliation property/year.
- PDF export packet.
- ZIP export packet.
```

- [ ] **Step 3: Add cost model**

Create `docs/architecture/cloudflare-cost-model.md`:

```markdown
# Cloudflare Backend Cost Model

## Pricing Inputs

Use official Cloudflare pricing as of 2026-06-12:

- Workers Standard/Paid: 10M requests/month and 30M CPU ms/month included; overage $0.30/M requests and $0.02/M CPU ms.
- Hyperdrive: included in Workers Paid with unlimited database queries and no data transfer charge.
- Queues: 1M operations/month included; $0.40/M operations after. Count one logical delivered message as at least write + read + delete.
- R2 Standard: 10 GB-month included; 1M Class A and 10M Class B included; free egress.
- Workflows: billed as Workers plus persisted state.

## Workload Unit Estimates

| Unit | Worker requests | CPU ms | Queue ops | Workflow instances | R2 Class A | R2 Class B | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| Login/session API day per active user | measure | measure | 0 | 0 | 0 | 0 | API/auth only |
| One lease extraction | measure | measure | measure | measure | measure | measure | Upload, workflow, R2 reads/writes, OpenRouter excluded |
| One GL import | measure | measure | measure | measure | measure | measure | Upload, parse workflow, inserts |
| One reconciliation | measure | measure | measure | measure | measure | measure | Deterministic math, snapshots |
| One export packet | measure | measure | measure | measure | measure | measure | PDF/ZIP generation and download |

## Budget Gates

- p95 API CPU per request target: under 50 ms for read routes, under 250 ms for ordinary writes.
- Queue backlog alert: any production queue older than 5 minutes for user-visible work.
- Workflow failure alert: any production workflow failure rate above 1% over 15 minutes.
- R2 Class A/B alert: 50%, 80%, and 100% of included monthly operations.
- Worker CPU alert: 50%, 80%, and 100% of included monthly CPU.
- Neon/Postgres alert: connection pool saturation, p95 query latency over 250 ms for API queries, p95 over 2 seconds for job queries.
```

- [ ] **Step 4: Verify**

Run:

```powershell
rg -n "pandas|reportlab|openpyxl|numpy|statsmodels|Queues|Workers|R2|Hyperdrive|Budget Gates|Representative Workloads" "docs/architecture/cloudflare-runtime-feasibility.md" "docs/architecture/cloudflare-cost-model.md"
```

Expected: every heavy backend workload has a documented Worker-compatible design and a measurement requirement before cutover.

Acceptance:

- The selected CSV/XLSX/PDF/ZIP libraries are named with bundle-size impact.
- Worker bundle startup time stays under Cloudflare's startup limit in staging.
- Representative parser/export workflows document peak memory, CPU time, and wall-clock time.
- Any workload that cannot fit comfortably inside Worker memory/CPU limits is explicitly moved to chunked Queue/Workflow processing with R2-staged intermediate artifacts.

- [ ] **Step 5: Commit**

```powershell
git add -- "docs/architecture/cloudflare-runtime-feasibility.md" "docs/architecture/cloudflare-cost-model.md"
git commit -m "docs: define cloudflare runtime feasibility and cost gates"
```

---

## Phase 1: Platform Ports

### Task 1.1: Environment And Binding Contracts

**Files:**
- Modify: `cloudflare-backend/wrangler.jsonc`
- Modify: `cloudflare-backend/src/env.ts`
- Create: `cloudflare-backend/src/platform/cloudflare.ts`
- Create: `cloudflare-backend/src/test/env.test.ts`

Bindings to define:

```ts
export type Bindings = {
  ENVIRONMENT: string
  APP_VERSION: string
  DATABASE_URL?: string
  HYPERDRIVE?: Hyperdrive
  DOCUMENTS_BUCKET: R2Bucket
  EXTRACTION_QUEUE: Queue<ExtractionQueueMessage>
  RECONCILIATION_QUEUE: Queue<ReconciliationQueueMessage>
  EXPORT_QUEUE: Queue<ExportQueueMessage>
  EMAIL_QUEUE: Queue<EmailQueueMessage>
  ANALYTICS_QUEUE: Queue<AnalyticsQueueMessage>
  OPENROUTER_API_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  RESEND_API_KEY: string
  RESEND_WEBHOOK_SECRET: string
  AUTH_JWKS_URL?: string
  AUTH_JWT_AUDIENCE?: string
  AUTH_JWT_ISSUER?: string
}
```

Acceptance:

- `env.ts` exposes a typed binding contract.
- Tests prove missing required runtime secrets produce a structured startup/config error when a route uses them.
- `wrangler.jsonc` binds R2, Queues, Hyperdrive entries, and Durable Object migrations.
- Secrets are not committed.

### Task 1.2: Database Adapter For Current Postgres Boundary

**Files:**
- Create: `cloudflare-backend/src/adapters/db/client.ts`
- Create: `cloudflare-backend/src/adapters/db/postgres.ts`
- Create: `cloudflare-backend/src/adapters/db/transaction.ts`
- Create: `cloudflare-backend/src/adapters/db/supabase-compat.ts`
- Create: `cloudflare-backend/src/test/db-adapter.test.ts`

Implementation requirements:

- Implement two explicit database modes:
  - `direct-postgres`: prefer Hyperdrive when the binding exists, use direct `DATABASE_URL` only in local tests/dev, and use Postgres.js or `pg` as Cloudflare recommends for Neon through Hyperdrive.
  - `postgrest-compat`: preserve the existing PostgREST/Supabase-style request boundary if Task 0.1 proves production still depends on it.
- The implementation must refuse to boot in production if `DB_ACCESS_MODE` is missing or conflicts with Task 0.1's inventory.
- Every query function accepts an `ActorContext` containing `userId`, `organizationId`, role, and service/admin flag.
- If RLS depends on session variables, every transaction sets those variables before business queries.
- No route imports a raw SQL client.

Acceptance:

- Tests verify actor context is required for org-scoped queries.
- Tests verify service/admin context is explicit.
- Tests verify a transaction wrapper sets org/user context before query execution.
- Tests prove tenant/org isolation at the database boundary, not only at repository level:
  - ordinary user from org A cannot read org B rows;
  - ordinary user from org A cannot update org B rows;
  - tenant user cannot read landlord-only rows;
  - service/admin context is the only bypass path;
  - the exact session variables, JWT claims, roles, or PostgREST headers recorded in Task 0.1 are set before protected queries.
- In `direct-postgres` mode, no `.table()`-style PostgREST assumptions leak into new Worker domain code.
- In `postgrest-compat` mode, PostgREST access is isolated inside `adapters/db/supabase-compat.ts` and still exposes typed repository methods to domain code.

### Task 1.3: Auth Adapter

**Files:**
- Create: `cloudflare-backend/src/adapters/auth/verifier.ts`
- Create: `cloudflare-backend/src/adapters/auth/supabase-jwt.ts`
- Create: `cloudflare-backend/src/middleware/auth.ts`
- Create: `cloudflare-backend/src/test/auth.test.ts`

Implementation requirements:

- Verify Bearer JWTs with JWKS or the current auth provider's documented verification method.
- Resolve user profile and organization membership from Postgres through the DB adapter.
- Preserve tenant-user auth separately from landlord auth.
- Return consistent `401` and `403` JSON bodies.

Acceptance:

- Tests cover missing token, malformed token, valid token with no user row, valid token with inactive user, valid owner/admin/member/viewer, and tenant user.
- Frontend can keep sending the existing `Authorization: Bearer <token>` header.

### Task 1.4: R2 Storage Adapter

**Files:**
- Create: `cloudflare-backend/src/adapters/storage/documents.ts`
- Create: `cloudflare-backend/src/adapters/storage/signed-uploads.ts`
- Create: `cloudflare-backend/src/test/storage.test.ts`

Implementation requirements:

- Use R2 bindings directly, not S3-compatible boto3.
- Generate scoped object keys with organization and property IDs.
- Validate content type and file size before issuing upload intent.
- Store file metadata in Postgres.
- Never read full files into memory unless the file is below a documented small-file threshold.

Acceptance:

- Tests cover PDF validation, CSV/XLSX validation, object key scoping, signed upload intent creation, and forbidden cross-org access.
- Queue messages contain document IDs and R2 keys only.

---

## Phase 2: Cheap Cloudflare API Shell

### Task 2.1: Middleware Parity

**Files:**
- Create: `cloudflare-backend/src/middleware/correlation.ts`
- Create: `cloudflare-backend/src/middleware/cors.ts`
- Create: `cloudflare-backend/src/middleware/security-headers.ts`
- Create: `cloudflare-backend/src/middleware/rate-limit.ts`
- Modify: `cloudflare-backend/src/app.ts`
- Create: `cloudflare-backend/src/test/middleware.test.ts`

Requirements:

- Match current production CORS allowlist: `https://capveri.com`, `https://www.capveri.com`, `https://app.capveri.com`.
- Preserve `Content-Disposition` exposure for file downloads.
- Preserve security headers from `backend/app/main.py`.
- Use Durable Object-backed rate limits in production.
- Permit an in-memory rate-limit fallback only when `ENVIRONMENT` is `development` or `test`.
- Refuse production boot if the production rate-limit binding is absent.
- Do not log secrets, tokens, raw PDFs, or full request bodies.

Acceptance:

- Tests cover preflight, allowed origins, denied origins, security headers, correlation ID propagation, and rate-limit response shape.

### Task 2.2: Health And Version Endpoints

**Files:**
- Create: `cloudflare-backend/src/routes/health.ts`
- Modify: `cloudflare-backend/src/app.ts`
- Create: `cloudflare-backend/src/test/health.test.ts`

Requirements:

- `/health` checks database, R2, OpenRouter key presence, Stripe key presence, and Resend key presence.
- `/health.version` returns version, environment, and commit metadata.
- Health must not run expensive probes on every request; use short TTL caching for non-database checks.

Acceptance:

- Tests cover healthy, degraded, and unhealthy database states.
- Response shape matches current frontend/deployment expectations.

### Task 2.3: OpenAPI Compatibility

**Files:**
- Create: `cloudflare-backend/src/http/openapi.ts`
- Modify: `cloudflare-backend/src/app.ts`
- Create: `cloudflare-backend/scripts/export-openapi.ts`
- Create: `cloudflare-backend/src/test/openapi.test.ts`

Requirements:

- New Worker exposes `/openapi.json`.
- Public routes have empty security arrays.
- Authenticated routes declare bearer auth.
- Export script writes `cloudflare-backend/openapi.json`.

Acceptance:

- `npm test` verifies `/openapi.json` is valid JSON and includes `/health`.
- Later route-port tasks must update this spec.

---

## Phase 3: Isolated Endpoints First

### Task 3.1: Stripe Webhook Worker Route

**Files:**
- Create: `cloudflare-backend/src/routes/webhooks.ts`
- Create: `cloudflare-backend/src/adapters/billing/stripe.ts`
- Create: `cloudflare-backend/src/domain/billing/webhook-service.ts`
- Create: `cloudflare-backend/src/test/stripe-webhook.test.ts`
- Read: `backend/app/api/routes/webhooks.py`

Requirements:

- Verify Stripe signature from raw request body.
- Preserve idempotency using `stripe_webhook_events`.
- Preserve subscription, invoice, credit, and analytics side effects.
- Use service/admin DB context explicitly.
- Return fast; enqueue slow email/analytics work.

Acceptance:

- Golden tests replay representative Stripe event fixtures.
- Duplicate event test proves idempotency.
- Invalid signature test returns `400`.

### Task 3.2: Resend Webhook Worker Route

**Files:**
- Modify: `cloudflare-backend/src/routes/webhooks.ts`
- Create: `cloudflare-backend/src/adapters/email/resend.ts`
- Create: `cloudflare-backend/src/domain/email/resend-webhook-service.ts`
- Create: `cloudflare-backend/src/test/resend-webhook.test.ts`
- Read: `backend/app/api/routes/webhooks.py`

Requirements:

- Verify Resend/Svix signature.
- Preserve unsubscribe/bounce/complaint behavior.
- Persist normalized webhook events if current backend does so.

Acceptance:

- Tests cover valid signed event, invalid signature, unknown event type, and idempotent replay.

### Task 3.3: Public Lead And Contact Routes

**Files:**
- Create: `cloudflare-backend/src/routes/leads.ts`
- Create: `cloudflare-backend/src/routes/contact.ts`
- Create: `cloudflare-backend/src/domain/leads/lead-service.ts`
- Create: `cloudflare-backend/src/test/public-intake.test.ts`
- Read: `backend/app/api/v1/leads.py`
- Read: `backend/app/api/v1/contact_requests.py`

Requirements:

- Preserve Turnstile verification.
- Preserve public rate limits.
- Enqueue emails through `EMAIL_QUEUE`.
- Preserve PostHog/Sentry sanitization.

Acceptance:

- Tests cover Turnstile success/failure, rate limit, DB insert, and email enqueue.

---

## Phase 4: Replace Celery And Redis

### Task 4.1: Queue Message Contracts

**Files:**
- Create: `cloudflare-backend/src/queues/messages.ts`
- Create: `cloudflare-backend/src/queues/producers.ts`
- Create: `cloudflare-backend/src/queues/consumers.ts`
- Create: `cloudflare-backend/src/test/queue-messages.test.ts`

Message schemas:

```ts
export const extractionQueueMessageSchema = z.object({
  version: z.literal(1),
  jobId: z.string().uuid(),
  documentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  priority: z.number().int().min(0).max(10),
})

export const reconciliationQueueMessageSchema = z.object({
  version: z.literal(1),
  jobId: z.string().uuid(),
  organizationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
})

export const emailQueueMessageSchema = z.object({
  version: z.literal(1),
  messageId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  template: z.string().min(1),
  recipient: z.string().email(),
  dataR2Key: z.string().optional(),
})

export const analyticsQueueMessageSchema = z.object({
  version: z.literal(1),
  eventId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  eventName: z.string().min(1),
  propertiesR2Key: z.string().optional(),
})
```

Requirements:

- All queue messages stay under 64 KB.
- Queue payloads use IDs and R2 keys only.
- Invalid messages go to structured error handling.

Acceptance:

- Tests prove message size stays under 64 KB and schemas reject unknown versions.

### Task 4.2: Extraction Workflow

**Files:**
- Create: `cloudflare-backend/src/workflows/lease-extraction.ts`
- Create: `cloudflare-backend/src/domain/extraction/extraction-service.ts`
- Create: `cloudflare-backend/src/adapters/ai/openrouter.ts`
- Create: `cloudflare-backend/src/test/extraction-workflow.test.ts`
- Read: `backend/app/services/extraction/job_queue.py`
- Read: `backend/app/services/extraction/processor.py`
- Read: `backend/app/services/extraction/dual/`
- Read: `docs/architecture/dual-extraction.md`

Requirements:

- Preserve dual-extract + judge + gap-filler semantics.
- Store raw stage snapshots in R2.
- Persist audit pipeline events.
- Mark job `processing`, `completed`, `failed`, and `retrying` consistently.
- Use Workflow retries for transient OpenRouter/R2/Postgres failures.
- Do not base64 large PDFs inside Workflow state; store and pass R2 keys.

Acceptance:

- Tests cover successful extraction, one extractor failure, both extractor failure, judge failure-open, gap filler, R2 forensic write failure, and retry metadata.

### Task 4.3: Reconciliation Workflow

**Files:**
- Create: `cloudflare-backend/src/workflows/reconciliation.ts`
- Create: `cloudflare-backend/src/domain/reconciliation/reconciliation-service.ts`
- Create: `cloudflare-backend/src/domain/reconciliation/calculation-trace.ts`
- Create: `cloudflare-backend/src/test/reconciliation-workflow.test.ts`
- Read: `backend/app/api/v1/reconciliation.py`
- Read: `backend/app/services/calculation/`

Requirements:

- Port deterministic math with golden tests before changing behavior.
- Preserve `Decimal` behavior using a decimal library or integer minor units.
- Preserve calculation trace structure.
- Workflow persists progress to Postgres after each major step.
- No LLM calls participate in financial math.

Acceptance:

- Golden tests compare Python fixture outputs and TypeScript outputs for gross-up, caps, base year, expense stops, tenant share, and finalized snapshot trace.

### Task 4.4: Cron Replacement

**Files:**
- Create: `cloudflare-backend/src/routes/cron.ts`
- Create: `cloudflare-backend/src/domain/scheduled/cleanup-service.ts`
- Create: `cloudflare-backend/src/domain/scheduled/winback-service.ts`
- Modify: `cloudflare-backend/wrangler.jsonc`
- Create: `cloudflare-backend/src/test/cron.test.ts`

Requirements:

- Replace Railway-hosted scheduled jobs and secret-trigger endpoints.
- Configure Cron Triggers in Wrangler.
- Keep each cron under the 15-minute wall-clock limit.
- Chunk long work and enqueue follow-up queue messages.

Acceptance:

- Tests cover chunking and idempotent repeated cron invocation.

---

## Phase 5: Port API Surface By Domain

Port routes in domains, not file order. Each domain task follows the same pattern:

1. Generate a route contract table from current FastAPI code, OpenAPI, and existing tests before implementation.
2. The route contract table must list every route, method, auth role, request body/query/path params, response schema, status codes, DB side effects, queue/workflow side effects, storage side effects, and permission failure behavior.
3. Add contract tests from the route table and current FastAPI behavior.
4. Implement Worker route and domain service.
5. Compare response shape to generated frontend expectations.
6. Add OpenAPI entries.
7. Run domain tests, typecheck, and frontend API client generation check.
8. Commit after review passes.

If a route group has more than 10 routes or more than one stateful workflow, split it into smaller tasks before implementation. Examples: `properties-read`, `properties-write`, `leases-read`, `leases-write`, `billing-checkout`, `billing-subscription`, `billing-invoices`.

### Task 5.1: Properties, Units, Leases

**Files:**
- Create: `cloudflare-backend/src/routes/properties.ts`
- Create: `cloudflare-backend/src/routes/units.ts`
- Create: `cloudflare-backend/src/routes/leases.ts`
- Create: `cloudflare-backend/src/domain/properties/`
- Create: `cloudflare-backend/src/domain/units/`
- Create: `cloudflare-backend/src/domain/leases/`
- Read: `backend/app/api/v1/properties.py`
- Read: `backend/app/api/v1/units.py`
- Read: `backend/app/api/v1/leases.py`

Acceptance:

- CRUD parity for property/unit/lease happy paths and authorization failures.
- Organization scoping cannot be bypassed.

### Task 5.2: Documents And Extraction API

**Files:**
- Create: `cloudflare-backend/src/routes/documents.ts`
- Create: `cloudflare-backend/src/routes/extraction.ts`
- Read: `backend/app/api/v1/documents.py`
- Read: `backend/app/api/v1/extraction.py`

Acceptance:

- Upload intent, document list/detail/delete, extraction start/status/retry, approve/reject all work without Railway.
- Extraction start enqueues Cloudflare Workflow, not Celery.

### Task 5.3: Ingestion, Rent Roll, Actual Billed

**Files:**
- Create: `cloudflare-backend/src/routes/ingestion.ts`
- Create: `cloudflare-backend/src/routes/rent-roll.ts`
- Create: `cloudflare-backend/src/routes/actual-billed.ts`
- Create: `cloudflare-backend/src/domain/ingestion/`
- Read: `backend/app/api/v1/ingestion.py`
- Read: `backend/app/api/v1/rent_roll.py`
- Read: `backend/app/api/v1/actual_billed.py`

Acceptance:

- Browser uploads files directly to R2.
- Parsing jobs run via Queue/Workflow.
- CSV/XLSX parser behavior matches existing tests.

### Task 5.4: Reconciliation, Analysis, Pools

**Files:**
- Create: `cloudflare-backend/src/routes/reconciliation.ts`
- Create: `cloudflare-backend/src/routes/analysis.ts`
- Create: `cloudflare-backend/src/routes/pools.ts`
- Create: `cloudflare-backend/src/domain/pools/`
- Read: `backend/app/api/v1/reconciliation.py`
- Read: `backend/app/api/v1/analysis.py`
- Read: `backend/app/api/v1/expense_pools.py`
- Read: `backend/app/api/v1/pool_mappings.py`
- Read: `backend/app/api/v1/pool_allocations.py`

Acceptance:

- Calculation start returns a job ID and progress state.
- Finalized snapshot immutability is preserved.
- Pool CRUD and mapping behavior preserve org scoping.

### Task 5.5: Billing

**Files:**
- Create: `cloudflare-backend/src/routes/billing.ts`
- Create: `cloudflare-backend/src/domain/billing/`
- Read: `backend/app/api/v1/billing.py`
- Read: `backend/app/services/billing/`

Acceptance:

- Checkout, portal, plan selection, subscription status, credits, invoices, save offers, and guarantee checks match existing behavior.
- Stripe calls are adapter-isolated and mocked in tests.

### Task 5.6: Team, Tenant Portal, Disputes, Notifications

**Files:**
- Create: `cloudflare-backend/src/routes/team.ts`
- Create: `cloudflare-backend/src/routes/tenant.ts`
- Create: `cloudflare-backend/src/routes/disputes.ts`
- Create: `cloudflare-backend/src/domain/team/`
- Create: `cloudflare-backend/src/domain/tenant/`
- Read: `backend/app/api/v1/team/`
- Read: `backend/app/api/v1/tenant/`
- Read: `backend/app/api/v1/disputes.py`

Acceptance:

- Landlord and tenant auth remain separate.
- Tenant users cannot access landlord endpoints.
- Dispute attachments use R2 and preserve authorization checks.

### Task 5.7: Exports, Reports, Compliance, Warranty, Tax Protest

**Files:**
- Create: `cloudflare-backend/src/routes/export.ts`
- Create: `cloudflare-backend/src/routes/reports.ts`
- Create: `cloudflare-backend/src/routes/compliance.ts`
- Create: `cloudflare-backend/src/routes/warranty.ts`
- Create: `cloudflare-backend/src/routes/tax-protest.ts`
- Create: `cloudflare-backend/src/domain/export/`
- Create: `cloudflare-backend/src/domain/reports/`
- Create: `cloudflare-backend/src/domain/compliance/`
- Create: `cloudflare-backend/src/domain/warranty/`
- Create: `cloudflare-backend/src/domain/tax-protest/`
- Read: `backend/app/api/v1/export.py`
- Read: `backend/app/api/v1/exports.py`
- Read: `backend/app/api/v1/reports.py`
- Read: `backend/app/api/v1/compliance.py`
- Read: `backend/app/api/v1/warranty.py`
- Read: `backend/app/api/v1/tax_protest.py`

Acceptance:

- Heavy PDF/ZIP/XLSX generation is moved to Queue/Workflow when it risks Worker memory or CPU limits.
- Downloads stream from R2 or generated response bodies without buffering oversized artifacts.

---

## Phase 5.5: Cloudflare Staging Integration

### Task 5.5.1: Staging Bindings And Seeded Integration Tests

**Files:**
- Modify: `cloudflare-backend/wrangler.jsonc`
- Create: `cloudflare-backend/scripts/seed-staging-fixtures.ts`
- Create: `cloudflare-backend/scripts/run-staging-smoke.ts`
- Create: `cloudflare-backend/src/test/staging-smoke.test.ts`
- Create: `docs/architecture/cloudflare-staging-test-runbook.md`

Requirements:

- Create a staging Worker name and staging route that cannot receive production traffic, such as `api-staging.capveri.com` or a workers.dev route.
- Bind staging Hyperdrive to a staging/sandbox Postgres branch or database, never production.
- Bind staging R2 buckets, Queues, Workflows, and Durable Objects separate from production.
- Seed rollback-safe fixtures: one organization, one owner, one member, one tenant user, one property, one lease, one GL import, one extraction job, one reconciliation job, and one export artifact.
- Run a smoke sequence against real Cloudflare staging bindings:
  - `/health`
  - auth-protected read route
  - direct-to-R2 upload intent
  - extraction queue/workflow enqueue
  - reconciliation queue/workflow enqueue
  - export generation/download path
  - Stripe webhook fixture in test mode
  - Resend webhook fixture in test mode
- Capture Worker logs, queue backlog, workflow state, R2 object presence, and database rows after the run.

Acceptance:

- Staging smoke script exits non-zero on any missing binding, failed workflow, queue backlog older than 5 minutes, failed health check, or cross-org isolation failure.
- No production domain, production database, production R2 bucket, production Stripe webhook, or production Resend webhook is used by staging.
- The runbook documents exact commands for seed, smoke, cleanup, and evidence capture.

---

## Phase 6: Frontend And Deployment Cutover

### Task 6.1: Frontend API Client Against Worker OpenAPI

**Files:**
- Modify: `frontend/scripts/generate-api-client.ts`
- Modify: `frontend/openapi-codegen.config.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/**/*.test.ts`

Requirements:

- Frontend generated SDK can use Worker `/openapi.json`.
- API base URL remains configurable.
- Bearer token behavior remains unchanged.

Acceptance:

```powershell
cd "frontend"
npm run generate-api-client:save
npm test
npm run typecheck
```

### Task 6.2: Cloudflare Deployment Pipeline

**Files:**
- Create: `.github/workflows/cloudflare-backend.yml`
- Modify: `AGENTS.MD`
- Modify: `CLAUDE.md`
- Create: `docs/DEPLOYMENT-cloudflare-backend.md`

Requirements:

- Deploy Cloudflare Worker on push to `master` when `cloudflare-backend/` changes.
- Use Cloudflare API token from GitHub secrets.
- Dry-run build and typecheck before deploy.
- Document rollback using Wrangler versions.
- Remove Railway verification from tasks that no longer touch Railway after cutover.

Acceptance:

- CI typechecks and tests the Worker.
- Deployment docs include exact commands for inspecting Worker versions, routes, logs, Queues, and Workflows.

### Task 6.3: Shadow Traffic And Canary

**Files:**
- Create: `cloudflare-backend/src/routes/shadow.ts`
- Create: `cloudflare-backend/src/domain/shadow/parity-service.ts`
- Create: `docs/architecture/cloudflare-cutover-runbook.md`

Requirements:

- For selected safe GET endpoints, compare Worker response with Railway response while Railway remains live.
- Log only metadata and hashed IDs, not customer data.
- Canary route percentage is controlled by Cloudflare route or Worker flag.

Acceptance:

- Runbook defines rollback in under 5 minutes.
- Canary starts with health/webhooks/public GETs before authenticated mutating routes.

### Task 6.4: Final Railway Retirement

**Files:**
- Modify: `AGENTS.MD`
- Modify: `CLAUDE.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/architecture/system-architecture.md`

Requirements:

- `api.capveri.com` points to Cloudflare Worker.
- Stripe and Resend webhooks point to Cloudflare routes.
- Celery/Redis env vars are unused in production.
- Railway fallback is cost-minimized during soak: after Worker canary passes, Railway worker and Redis are disabled first, then the API service is scaled down or stopped if a cold fallback is acceptable.
- Any paid soak longer than 24 hours requires explicit owner approval recorded in the runbook.
- Railway services, Redis/add-ons, volumes, domains, GitHub auto-deploy links, and orphan resources are disabled or deleted after successful cutover verification.
- Docs no longer require Railway deployment verification for backend changes.

Acceptance:

- Production `/health` returns Worker metadata.
- Worker logs show traffic for API, webhooks, queue consumers, and workflows.
- Railway receives no production requests during the runbook-defined soak window.
- Railway project inventory proves no billable resources remain: no running services, no Redis/add-ons, no volumes, no custom domains, no active generated public domains, no auto-deploy links, and no orphan services.
- The runbook captures exact verification evidence from Railway MCP or Railway CLI/dashboard for:
  - `list_services` for project `Capveri`, proving only intentionally retained non-billable resources remain or the project is empty.
  - `list_deployments` for each former backend service, proving no active production deployment remains serving traffic.
  - service variables for former API, worker, and Redis services, proving production secrets were copied to Cloudflare or intentionally removed.
  - custom domains and generated Railway domains, proving `api.capveri.com` is detached from Railway and generated public domains are disabled where Railway supports disabling them.
  - volumes, plugins, add-ons, Redis service/plugin, and project resources, proving no billable storage or data services remain.
  - GitHub integration/auto-deploy settings, proving pushes to `master` no longer create Railway deployments.
  - current Railway billing/resource screen or API output, proving there are no active billable resources for this backend migration.
- Railway billable services are stopped/deleted.

---

## Cost Controls

Every implementation task must preserve these controls:

- Use Workers for I/O-heavy request handling; do not do CPU-heavy PDF/XLSX generation synchronously.
- Use Hyperdrive for Postgres connection pooling and query routing.
- Keep Queue messages under 64 KB to avoid multi-operation billing.
- Store large payloads in R2 and pass object keys.
- Set Worker CPU limits intentionally. Keep API Worker default near 30 seconds; only job consumers/workflows get higher CPU if measurements prove need.
- Add per-org and per-IP rate limits before public cutover.
- Use structured logs with sampling for noisy endpoints.
- Avoid Durable Object storage for large or long-lived state; store durable business state in Postgres and artifacts in R2.
- Cache read-only public/config data where it does not weaken authorization.

---

## Review Gates

Each phase must pass:

- Task tests.
- `npm run typecheck` in `cloudflare-backend`.
- Relevant frontend tests when API contracts change.
- Contract parity tests against old FastAPI behavior before replacing a route.
- Spec review subagent.
- Code quality review subagent.

Before final cutover:

- Cloudflare Worker deployed and serving `/health`.
- Stripe webhook verified in test mode and live mode.
- Resend webhook verified.
- Extraction workflow completes from upload to HITL-ready result.
- Reconciliation workflow completes and matches Python golden outputs.
- Export/download flow works with real R2 artifacts.
- Production monitoring dashboard exists for request errors, CPU, queue backlog, workflow failures, and database latency.
- Railway fallback runbook has been tested.

---

## Self-Review

Spec coverage:

- Railway bill elimination is covered by Phases 0, 2, 4, 6.
- Railway add-on/resource bill elimination is covered by Task 0.1 and Task 6.4.
- Keeping current database provider is covered by Tasks 0.1, 1.2, 1.3, and non-negotiable requirement 3.
- Workers Paid cost leverage is covered by Target Runtime and Cost Controls.
- Scalability for many customers is covered by Queues, Workflows, Hyperdrive, R2, Durable Objects, rate limits, and Task 0.3's cost/capacity gates.
- Clean organized code is covered by the dedicated package structure and design rules.
- Subagent-driven review/fix cycles are covered by the execution model and review gates.

Placeholder scan:

- This plan intentionally avoids vague implementation steps. Each phase has concrete files, behavior, tests, and acceptance criteria.
- Database/auth production unknowns are not left as ambiguity; Task 0.1 converts them into explicit evidence requirements before cutover.

Type consistency:

- `AppEnv` and `Bindings` are introduced early and reused by route/platform tasks.
- Queue message schemas are versioned and referenced by producers, consumers, and workflows.
- `ActorContext` is the cross-cutting authorization context for DB access.
