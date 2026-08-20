# CapVeri — AGENTS.md

> Critical constraints live in this file. Operational detail (exact deploy IDs/commands,
> project layout, browser testing, E2E creds, full sub-agent policy, doc index) lives in
> **[docs/guides/agent-operations.md](./docs/guides/agent-operations.md)** — open it before
> deploying, before a multi-project change, or when you need exact commands.

## Non-Negotiables (read first)

1. **Verify before claiming done.** Run the impacted project's tests and show real output.
   No placeholder code, no `pass`/`...` bodies, no `TODO`/`FIXME`/`HACK`/`XXX` — implement
   it or `raise NotImplementedError("<story ref>")`.
2. **Verify every deployment** reaches a healthy terminal state before claiming done —
   `100%` current version on the impacted Cloudflare Worker(s). Railway is retired for
   CapVeri and must not be used as a deploy or verification target. A CLI "success" only
   means the upload was accepted. (Runbook → Deployment Verification.)
3. **Money is `Decimal`, never float. No LLMs for financial math** — deterministic Python only.
4. **Every table needs RLS.** Multi-tenancy is enforced at the database.
5. **Merges are local to `master` — do NOT open PRs.** `git merge --no-ff <branch>` after
   review, re-run the gate, `git push origin master`. Close any PR opened by mistake. This
   overrides the `finishing-a-development-branch` skill's PR option.
6. **Run `git pull` before starting** — this repo is developed across multiple machines.
7. **Windows / PowerShell:** quote every path; use `--` before paths in git ops; quote
   Next.js route-group folders like `(marketing)` separately when staging. If
   `new-worktree` partially succeeds, verify the worktree `.git` `gitdir` before anything
   else. Distinguish a quoting failure from a real git/merge error in status updates.

## Design Canon

- **Buttons are pills.** Fully rounded geometry is a standing preference: every button or
  button-styled CTA uses pill corners (`rounded-full` / `border-radius: 9999px`), including
  primary/secondary, link-buttons, toolbar, segmented/toggle controls, and icon buttons
  (circular when square). No square/mildly-rounded buttons unless the user explicitly asks.

## Architecture Constraints

1. **No API integrations** with Yardi/MRI/RealPage — file imports only ("Anti-Integration").
2. **No LLMs for financial math** — deterministic Python only.
3. **All AI extractions require human verification** before commit.
4. **Every table needs RLS** — no exceptions.
5. **Use `Decimal` for money** — never float.
6. **Privacy-safe AI / Zero Data Retention** — API data is not stored or used for model
   training; explicit ZDR opt-out on all LLM calls.

## Critical Rules

- **Worktree-first.** Start every task from a new git worktree branch; do all changes,
  validation, and commits there, then merge back to `master`.
- **Never run quality checks in parallel.** Run tests, type checks, lint, coverage, and
  formatting one command at a time in the foreground — no parallel runners or shell fan-out.
- **Test real logic.** Mock only external boundaries (Supabase, Stripe, AWS, OpenRouter) —
  never the function under test or internal business logic.
- **No `# type: ignore`** without an inline reason; **no `any`** in TypeScript (use a real
  type or `unknown` with narrowing); **no `eslint-disable`** without an inline reason.
- **Migration-first.** If a task touches the schema: write the migration in
  `supabase/migrations/` first, apply and verify it locally, then write code/tests, and
  commit the migration with its dependent code. A schema error is a setup failure, not a TDD red.
- **Scope quality checks to impacted projects** (backend / frontend / marketing); run them
  sequentially, never `-n auto`. (Runbook → Commands.)
- **Git staging discipline.** Stage only files you changed: `git add -- "path1" "path2"`.
  Never `git add -A`/`.`, never commit `.env` or another track's generated files, never
  amend another agent's commit, never force push, never `--no-verify`.
- **Code review before merge.** After tests + lint pass, invoke
  `superpowers:requesting-code-review` (or the `review-merge` skill), fix every flagged
  issue, re-run tests, then merge locally to `master`.

## Gates (must pass before completion)

- **Marketing copy gate** — before changing public copy (landing/SEO, blog/resource MDX,
  LinkedIn bodies, `marketing/data/*.json`, transactional emails, onboarding/PLG), run
  `node scripts/marketing-copy-gate.mjs` (must exit 0). Never put internal jargon in
  reader-visible text: codenames ("Anti-Integration", "Operation Sovereign Wedge"),
  funnel terms (TOFU/MOFU/BOFU, "lead magnet", "buyer persona", "nurture sequence"). Say
  "no integration needed" / "import a CSV instead of connecting an API" instead.
- **LinkedIn/Postiz gate** — before creating/exporting/scheduling LinkedIn posts, run
  `node scripts/linkedin-post-review-gate.mjs marketing/content/linkedin`. No internal
  labels, no image suggestions without an attached image, no TODO/TBD, no generic AI phrasing.
- **Required marketing copy pass** — all marketing/user-facing persuasive copy passes the
  `humanizer` skill then the `third-grade-copy` skill before completion. Does not apply to
  code identifiers, logs, API/dev docs, legal text, DB values, or user-generated content.

## Sub-Agent Driven Development

Sub-agent delegation is the **default**. As orchestrator, decompose work and delegate bounded
tasks via `spawn_agent` (`explorer` for investigation, `worker` for implementation,
`default` for general tasks), preserving your context window for coordination and final
judgment. Choose the least expensive capable model/reasoning. Plan first, run independent
agents in parallel (disjoint write scopes), two-stage review (spec then quality) each
result. **Full policy + model selection table:** see the runbook.

## Project & Stack

CRE FinOps SaaS that automates CAM (Common Area Maintenance) reconciliation for commercial
landlords and property managers. Codename: Operation Sovereign Wedge.

| Layer | Stack |
|-------|-------|
| Backend API | Cloudflare Workers / Hono / TypeScript / Vitest (`cloudflare-backend/`) |
| Legacy Backend Reference | Python 3.11+ / FastAPI / Pydantic v2 / Pandas / pytest (`backend/`) |
| App Frontend | React 19+ / Vite / Shadcn/UI / TanStack Query & Table / Zod |
| Marketing | Next.js (App Router) / Tailwind / Shadcn/UI / OpenNext Cloudflare Workers |
| Database | Supabase (PostgreSQL) with RLS for multi-tenancy |
| Infra | Cloudflare Workers / Queues / Workflows / R2 / OpenRouter LLM gateway (ZDR) |
| AI Extraction | Dual-extract + judge via OpenRouter; active Worker model IDs live in `cloudflare-backend/wrangler.jsonc` |

**More detail:** [docs/guides/agent-operations.md](./docs/guides/agent-operations.md) —
commands, deploy runbook, API conventions, project structure, key patterns, browser
testing, E2E creds, full sub-agent policy, and the documentation index.

<!-- BEGIN: User-Facing Copy Guardrails -->
## User-Facing Copy Guardrails

For any user-facing copy in this repo, run the copy through these guardrails before you call the work done. This applies to product UI text, landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social posts, SEO pages, help text, empty states, reassurance text, and any copy that sells, explains, persuades, activates, or reassures.

Required order:

1. Run the globally installed `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Run the globally installed `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level. The source package for this skill lives in a shared internal package repository; if the global skill is missing or stale, reinstall or sync it from there before finalizing copy.
3. Verify there are zero lies: no made-up numbers, claims, proof, testimonials, guarantees, rankings, integrations, prices, timelines, or capabilities. Check claims against the product source of truth before publishing.
4. Verify the message fits the whole place it appears: the page, flow, audience, offer, brand voice, surrounding copy, and user intent. Do not approve a line just because it is clear in isolation.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.
<!-- END: User-Facing Copy Guardrails -->

## Working autonomously
- **Poll, don't idle.** When a task, build, test run, or hook is running, actively poll its status and output until it finishes. Don't just sit and wait passively for it to return.
- **Keep going.** When working toward a goal, finishing one chunk of work means moving straight to the next chunk. Don't stop and wait for further input mid-goal — continue until the goal is done or you are genuinely blocked.
