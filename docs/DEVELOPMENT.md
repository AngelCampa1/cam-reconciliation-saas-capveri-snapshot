# Development setup

> **These instructions were accurate as of the final commit.** The hosted services
> (`api.capveri.com`, `app.capveri.com`, `www.capveri.com`) no longer exist. The local stack still
> comes up and the test suites still run; the deploy targets do not.

For what the project is and why it is built this way, start with the
[portfolio documentation](../portfolio/) and the [README](../README.md).

## Stack

| Layer | Technology | Deployed? |
|---|---|---|
| Backend API | Cloudflare Workers, Hono, TypeScript, Vitest (`cloudflare-backend/`) | Yes (`capveri-api`) |
| App frontend | React 19, Vite, TanStack Query/Table, shadcn/ui, Zod (`frontend/`) | Yes, `capveri-app` |
| Marketing | Next.js App Router, Tailwind, MDX, OpenNext (`marketing/`) | Yes: `capveri-marketing` |
| Database | Supabase (PostgreSQL with RLS) | Yes |
| Infrastructure | Cloudflare Queues, Durable Objects, R2, Hyperdrive | Yes |
| AI extraction | Dual-extract plus judge via OpenRouter (zero data retention) | Yes |
| Reference implementation | Python 3.11, FastAPI, Pydantic v2, Pandas, pytest (`backend/`) | **No, kept as a correctness oracle, see [ORACLE.md](../portfolio/ORACLE.md)** |

## Prerequisites

- Node.js 20+ (developed on 22)
- Python 3.11+ (developed on 3.13)
- Docker, for local Supabase
- [Supabase CLI](https://supabase.com/docs/guides/cli)

## Local stack

### 1. Database

```bash
supabase start
```

Postgres on `54322`, the API gateway on `54321`. Seed data for manual testing:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/seeds/seed_manual_testing.sql
```

That creates several organizations with properties, leases, GL entries, and finalized
reconciliation snapshots. Seeded logins are `owner@acme.example.com` (landlord) and the
`*.tenant@*` accounts (tenant portal), all on the shared local development password.

### 2. Backend API

```bash
cd cloudflare-backend
npx wrangler dev --port 8001
```

Secrets come from `cloudflare-backend/.dev.vars`. **Port 8001 is deliberate.** The frontend's
`.env.local` points at `http://127.0.0.1:8001`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- --port 5174
```

### 4. Marketing site

```bash
cd marketing
npm install
npm run dev -- --port 3001
```

### Environment variables

```
# cloudflare-backend/.dev.vars
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase start`>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# frontend/.env.local
VITE_API_URL=http://127.0.0.1:8001
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from `supabase start`>
```

`.env.example` files in each project list the full set.

## Tests

Run these **sequentially**, not in parallel across projects. They contend for CPU and for the
local database.

```bash
# Reference implementation + property-based parity suites (~9 min)
cd backend && python -m pytest -n 12 --dist loadscope

# Production API, in a real workerd runtime (~70 s)
cd cloudflare-backend && npx vitest run

# Frontend
cd frontend && npm run test:coverage

# Marketing
cd marketing && npm run test:coverage
```

Do **not** use `pytest -n auto`. On a 32-core machine it raises `MemoryError` on the heavy PDF
fixtures and is slower than `-n 12`. See [TESTING.md](../portfolio/TESTING.md).

Browser E2E needs the local stack up:

```bash
cd frontend && npm run test:e2e:chromium
```

The bespoke Worker harnesses each have their own npm script:

```bash
cd cloudflare-backend && npm run test:local-reconciliation
```

## Code quality

```bash
# TypeScript projects
npm run typecheck && npm run lint && npm run format

# Python
cd backend
python -m black app tests && python -m isort app tests
python -m ruff check app tests && python -m mypy app
```

## Generated artifacts

Several files are generated and must not be hand-edited. CI enforces this.

**API client.** `frontend/src/api/generated/` is generated from the backend's OpenAPI spec:

```bash
cd frontend && npm run generate-api-client
```

**Design tokens.** `design-tokens.json` at the repository root is the single source. It emits
both the frontend stylesheet and the Python email token module, so application and transactional
email styling cannot drift:

```bash
cd frontend && npm run tokens
# writes frontend/src/generated/tokens.css AND backend/app/services/email/tokens.py
```

**Pricing:** `plan-tiers.json` is the single source for backend billing, the frontend, and the
marketing pricing page:

```bash
node scripts/generate-plan-tiers.mjs
```

## Database changes

Migration-first. Write the migration in `supabase/migrations/`, apply and verify it locally, then
write the dependent code, and commit both together.

Migration filenames follow `<timestamp>_<action>_<subject>.sql`, and the action prefix is validated
by `backend/tests/test_migration_verification.py`.

Every table needs RLS. See [SECURITY.md](../portfolio/SECURITY.md) for why RLS is necessary but not
sufficient in this architecture.

## Repository layout

```
camaudit/
├── cloudflare-backend/     # Production API, Hono on Workers
│   ├── src/http/           # 51 route modules
│   ├── src/domain/         # Business logic, incl. reconciliation/
│   ├── src/adapters/       # DB, storage, AI, auth, analytics
│   ├── src/queues/         # Producers, consumers, message contracts
│   ├── src/workflows/      # Queue job runners
│   └── scripts/            # 37 local E2E harnesses
├── frontend/               # React 19 SPA
│   └── scripts/            # 104 production stress scenarios
├── marketing/              # Next.js site, 275 MDX pages
├── backend/                # Python reference implementation (NOT deployed)
│   └── tests/stress/       # 21 property-based oracle parity suites
├── supabase/migrations/    # 142 migrations
├── knowledge/              # Source of truth, codegen'd into TS
├── scripts/                # Cross-project gates and generators
└── portfolio/              # Engineering write-ups
```

## Troubleshooting

**`supabase start` port conflicts.** If another Supabase project is running, ports collide. Check
with `docker ps` and confirm you are talking to the right database before trusting anything.

**Frontend hits the wrong API.** Confirm `VITE_API_URL` is `http://127.0.0.1:8001`. Verify the
Worker is the right one with `curl http://127.0.0.1:8001/health`.

**CORS errors.** The Worker's allowed-origin list is in `cloudflare-backend/src/app.ts`.
