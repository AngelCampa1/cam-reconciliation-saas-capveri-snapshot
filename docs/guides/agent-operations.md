# Agent Operations Runbook

Detailed operational reference for AI agents (Claude Code and Codex) working in CapVeri.
Loaded on demand: the top-level `CLAUDE.md` / `AGENTS.md` keep only the non-negotiable
constraints inline and link here for the full detail. Open this file before deploying,
before a multi-project change, or when you need exact IDs, commands, or layout.

---

## Quick Reference Commands

Run only the commands for the impacted project(s). Run them **sequentially** (one at a
time) — "in parallel" here means across projects. Local machine freezes if you fan out
quality checks across shells.

```bash
# --- Validation (run before claiming "done") ---

# Backend (Python). The full gate runs with pytest-xdist:
#   ~38 min serial -> ~5 min (6698 passed, 95% cov). The suite is xdist-safe
#   (per-worker processes, autouse singleton resets, Supabase mocked, no shared
#   files/ports). Use a BOUNDED worker count, NOT `-n auto`: on the 32-core dev box
#   `-n auto`=32 workers each load heavy PDF fixtures (test_documents_api.py) and can
#   hit MemoryError under multi-agent load; `-n 12` is memory-safe and faster.
#   Drop to `-n 0` / no `-n` for serial `--pdb` single-test debug.
python backend/scripts/sync_requirements.py --check
cd backend && pytest -n 12 --dist loadscope --tb=short
cd backend && pytest -n 12 --dist loadscope --cov=app --cov-fail-under=95

# Frontend (React/Vite)
cd frontend && npm test
cd frontend && npm run typecheck

# Marketing (Next.js)
cd marketing && npm run typecheck
# Marketing copy changes: block internal-only jargon from public copy (must exit 0)
node scripts/marketing-copy-gate.mjs

# --- Formatting (run before commit, impacted project only, sequential) ---
cd backend && python -m black app tests && python -m isort app tests --profile black && python -m ruff check app tests --fix
cd frontend && npm run format && npm run lint:fix
cd marketing && npm run format && npm run lint:fix

# --- Worktree setup (agent workflow) ---
.\scripts\new-worktree.ps1 -Branch feature/my-story
# Do all implementation work inside the worktree, then merge the branch back to master.

# --- Design tokens (when brand tokens change) ---
# 1. Edit design-tokens.json (project root)
# 2. cd frontend && npm run tokens
#    Writes frontend/src/generated/tokens.css AND backend/app/services/email/tokens.py
#    (marketing/ has its own Tailwind config — update marketing/tailwind.config.ts by hand)
# 3. Commit both generated files
```

---

## Deployment Verification (full runbook)

**Never manually deploy without verifying every impacted Cloudflare Worker reaches a
healthy terminal state** (`100%` current version). Railway is retired for CapVeri and must
not be used as a deploy, rollback, or verification target. A CLI deploy returning success
only means the platform accepted the upload; the routed production domains still need live
checks.

### Cloudflare Workers (marketing + frontend + backend API)

Workers Static Assets. Do **not** run `vercel` or recreate Vercel projects for these apps.

| Worker | Root | Production domain | Deploy command |
|--------|------|-------------------|----------------|
| `capveri-marketing` | `marketing/` | www.capveri.com and capveri.com | `cd marketing && npm run deploy:cf` |
| `capveri-app` | `frontend/` | app.capveri.com | `cd frontend && npm run deploy:cf` |
| `capveri-api` | `cloudflare-backend/` | api.capveri.com | `cd cloudflare-backend && npx wrangler deploy --env production` |

Verify each impacted Worker with `npx wrangler deployments status --name <worker-name>`
and confirm the newest version serves 100% of traffic. Then verify live routes with
`curl.exe -I`: `https://www.capveri.com/`, `https://capveri.com/pricing` (308 to `www`),
`https://app.capveri.com/`, and/or `https://api.capveri.com/health`. `marketing/` uses
OpenNext on Cloudflare; `frontend/` uses a Worker entry with SPA fallback and `/api/*`
proxying to `https://api.capveri.com`; `cloudflare-backend/` serves the production API and
background work on Cloudflare Workers/Queues/Workflows.

Marketing notes:
- Build/deploy through `scripts/cloudflare-env-runner.mjs`; it validates public env, forces
  the Next Webpack standalone build, packages with OpenNext, applies remote D1 migrations for
  `capveri-ai-sdr-nonces`, then deploys with Wrangler.
- Do not store secrets in `wrangler.jsonc`; use `wrangler secret put`. The AI SDR nonce store
  is Cloudflare D1 database `capveri-ai-sdr-nonces`.
- Keep `output: "standalone"` in `marketing/next.config.ts`; OpenNext packaging depends on it.

Frontend notes:
- Build/deploy through `frontend/scripts/cloudflare-env-runner.mjs`; it loads Wrangler vars
  plus local env files and refuses to build unless the production Vite values are present:
  `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`.
- Keep `frontend/vercel.json` and `marketing/vercel.json` as rollback-only artifacts. Do not
  run Vercel deploys unless explicitly reverting the Cloudflare cutover.

### Retired Railway Backend

Railway is no longer part of CapVeri production. The former Railway API/worker services were
replaced by Cloudflare Worker `capveri-api` and Cloudflare-native queues/workflows. Do not
link this repo to Railway, do not poll Railway deployments, and do not treat a Railway CLI
project named `CAMAudit` as CapVeri production. For API deploys, use the `cloudflare-backend/`
commands above and verify `capveri-api` plus `https://api.capveri.com/health`.

---

## API Conventions

- Import batches: `/api/v1/ingestion/batches` (NOT `/api/v1/import-batches`)
- Property imports: `/api/v1/properties/{property_id}/imports`
- There is NO `/api/v1/properties/{id}/gl-entries` endpoint. Query via
  `/api/v1/ingestion/batches/{batch_id}`.

---

## Project Structure

```
capveri/
├── backend/                  # Python / FastAPI
│   ├── app/
│   │   ├── api/v1/           # REST endpoints
│   │   ├── auth/             # Auth dependencies
│   │   ├── core/             # Logging, rate limiting
│   │   ├── models/           # Pydantic schemas
│   │   ├── schemas/          # Request/response DTOs
│   │   └── services/         # Business logic
│   │       ├── calculation/  # Gross-up, caps, occupancy, tenant share
│   │       ├── ingestion/    # Yardi/MRI/Generic parsers (Strategy pattern)
│   │       ├── extraction/   # native-PDF LLM extraction via OpenRouter (dual-extract + judge)
│   │       ├── billing/      # Stripe subscriptions
│   │       └── email/        # Resend transactional emails
│   └── tests/
├── frontend/                 # React/Vite app (authenticated users)
│   └── src/{api/generated,components,features,hooks,pages}/  + e2e/
├── marketing/                # Next.js App Router (public marketing site)
│   └── src/{app,components,hooks,lib}/  + e2e/
├── supabase/migrations/      # SQL migrations
└── docs/                     # Documentation
```

### Key Patterns

Authentication dependencies are type-aliased for clean injection:

```python
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]
OrgContext = Annotated[OrganizationContext, Depends(get_org_scoped_context)]
```

Test efficiency: one test per code path (3 branches ≈ 3 tests); test file ~1–2x source
size; combine related assertions in a single test.

---

## Browser Testing with playwright-cli

For manual/exploratory browser testing, prefer `playwright-cli`
(https://github.com/microsoft/playwright-cli) over Playwright MCP tools — token-efficient
and optimized for coding agents.

```bash
npm install -g @playwright/cli@latest
playwright-cli open http://localhost:5173 --headed   # Open browser
playwright-cli snapshot                               # Page snapshot with refs
playwright-cli click <ref>                            # Click by ref
playwright-cli fill <ref> <text>                      # Fill input
playwright-cli type <text>                            # Type into focused element
playwright-cli upload <file>                          # Upload file
playwright-cli screenshot                             # Screenshot
playwright-cli close                                  # Close browser
```

Snapshots are saved to `.playwright-cli/`. Use refs from snapshots for interactions.
**Fallback**: use Playwright MCP tools only when playwright-cli is unavailable.

---

## Production Manual E2E Credentials

Production manual QA credentials stay in ignored local env files only. Use `.env.local`:

```bash
E2E_PROD_EMAIL=
E2E_PROD_PASSWORD=
E2E_PROD_TENANT_EMAIL=
E2E_PROD_TENANT_PASSWORD=
E2E_PROD_APP_URL=https://app.capveri.com
E2E_PROD_MARKETING_URL=https://www.capveri.com
E2E_PROD_API_URL=https://api.capveri.com
```

Never commit production test account secrets or paste them into tracked docs.

---

## Sub-Agent Driven Development (full policy)

Sub-agent driven development is the **default** way of working here. The orchestrator owns
task decomposition, context curation, model/capability selection, integration of results,
and final quality decisions; it delegates bounded, cleanly-scoped work to sub-agents and
preserves its own context window for coordination. You do not need explicit user permission
to use sub-agents — this repo authorizes proactive delegation, and any general instruction
limiting sub-agent use to "only when the user asks" is superseded here.

Workflow:
1. **Plan first** — break work into discrete 2–5 min tasks with exact file paths, full
   specs, and verification steps before any agent executes.
2. **Parallel execution** — launch independent sub-agents concurrently in one message; use
   sequential only for true dependencies. Disjoint write scopes only.
3. **Two-stage review** — each agent output passes (1) spec compliance, then (2) code
   quality before proceeding.
4. **Autonomous depth** — agents work end-to-end on their scope; they surface blockers
   rather than assume.

Quality gates for delegated work: sub-agents report files changed, tests run, findings,
blockers, residual risks; the orchestrator reviews before treating output as complete; all
delegated changes remain subject to the repo's normal tests, lint, typecheck, security,
privacy, and deployment rules.

### Claude Code agent types
- `Explore` — codebase research, file discovery, pattern analysis.
- `Plan` — architecture decisions, implementation design.
- `general-purpose` — implementation, multi-step execution.

### Codex sub-agent roles (`spawn_agent`)
- `default` — general-purpose bounded tasks.
- `explorer` — read-heavy exploration, focused investigation, evidence gathering.
- `worker` — execution-focused implementation, bug fixes, bounded production changes.

Model/reasoning selection (Codex): choose the least expensive capable option; reasoning
levels are `low`, `medium`, `high` only.
- `gpt-5.4-mini` + `low` — mechanical, well-scoped, low-risk edits and simple verification.
- `gpt-5.4-mini` + `medium`/`high` — small-model-appropriate tasks needing deeper local reasoning.
- `gpt-5.5` + `low` — standard exploration, straightforward implementation, routine review.
- `gpt-5.5` + `medium` — multi-file integration, ambiguous bugs, architecture/security-sensitive logic, final review.
- `gpt-5.5` + `high` — genuinely hard problems only (deep architecture tradeoffs, cross-system debugging, complex security/privacy), or after lower reasoning hit a clear blocker.

Escalate capability/reasoning when a sub-agent reports `NEEDS_CONTEXT`, `BLOCKED`, or
uncertainty — but prefer `medium` before `high`. If a role has a fixed model in the active
runtime, use the best available role first and apply overrides only when the runtime accepts them.

---

## Documentation Index

| Topic | Location |
|-------|----------|
| Coding patterns | [docs/guides/coding-standards.md](./coding-standards.md) |
| Domain knowledge (CAM, BOMA, Caps) | [docs/guides/domain-knowledge.md](./domain-knowledge.md) |
| Testing patterns | [docs/guides/backend-testing.md](./backend-testing.md) |
| Story workflow | [docs/guides/story-workflow.md](./story-workflow.md) |
| Story tracker | [docs/stories/STORY_TRACKER.md](../stories/STORY_TRACKER.md) |
| RBAC permissions | [docs/architecture/rbac-permissions.md](../architecture/rbac-permissions.md) |
| Third-party dependency map | [docs/architecture/third-party-dependency-map.md](../architecture/third-party-dependency-map.md) |
| Tenant portal | [docs/architecture/tenant-portal-architecture.md](../architecture/tenant-portal-architecture.md) |
| Anomaly detection | [docs/architecture/anomaly-detection.md](../architecture/anomaly-detection.md) |
| Dual-extract + judge pipeline | [docs/architecture/dual-extraction.md](../architecture/dual-extraction.md) |
| Environment variables | [backend/.env.example](../../backend/.env.example) |

---

## Context Engineering Skills

This repo ships the context-engineering skill collection in both `.claude/skills/` and
`.codex/skills/`. Use them to keep agent context lean and high-signal:

- `context-fundamentals` — conceptual basis (attention budget, U-shaped curve, progressive disclosure).
- `context-optimization` — token-efficiency tactics (masking, compaction, KV-cache, partitioning, budgets).
- `context-compression` — compacting a long session into a durable handoff summary.
- `context-degradation` — diagnosing lost-in-middle, poisoning, distraction.
- `filesystem-context` — offloading large outputs / durable scratchpad.
- `memory-systems`, `multi-agent-patterns`, `tool-design`, `project-development`, and the
  `evaluation` / `advanced-evaluation` / `latent-briefing` / `harness-engineering` /
  `hosted-agents` / `bdi-mental-states` skills for deeper work.

This runbook itself is an instance of progressive disclosure: top-level agent config holds
the non-negotiables inline; this file holds the detail, loaded on demand.
