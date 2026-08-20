# Goal Mode: Frontend Audit & Wiring Marathon

> **This is the source of truth for an active, long-running goal-mode effort.**
> If you are an agent picking this up, **read this file fully, then read `PROGRESS.md` and `FINDINGS.md` before doing anything else.**

## The Goal (verbatim intent)

Go through the entire codebase and find **every** frontend bug, missing frontend feature, and missing/incorrect wiring between frontend and backend. The app was built by AI over many iterations, component-at-a-time, without verifying how the pieces work together — so expect broken flows, dead buttons, unwired forms, mismatched API contracts, and half-finished features.

Fix all of it. Do UI integration testing, UI system-integration testing, and full local E2E testing. Everything must flow together end-to-end. This is **sub-agent driven**. Run **multiple review→fix cycles** until there is nothing left to fix or complete.

This will not finish in one session. It is expected to run for days across many agent handoffs.

## Canonized conventions (apply everywhere, always)

- **All buttons must be pills** (fully rounded, `rounded-full`). The base `Button` component (`frontend/src/components/ui/button.tsx`) must use pill radius so it propagates. Convert one-off raw `<button>`, link-styled CTAs, and `rounded-md`/`rounded-lg` buttons to pills too. Applies to app frontend and marketing site.

## Workflow (per repo CLAUDE.md — non-negotiable)

1. `git pull` before starting.
2. **Worktree isolation:** fix work happens in a git worktree (`.\scripts\new-worktree.ps1 -Branch fix/<slug>` or the `using-git-worktrees` skill).
3. **Sub-agent driven:** orchestrator decomposes; delegate discovery, implementation, verification to sub-agents. Use parallel agents for disjoint write scopes.
4. **No placeholder code. No TODO comments.** Code works completely or raises `NotImplementedError` with a story ref.
5. **Verify before done:** run impacted-project tests + typecheck and SHOW output. Backend coverage must stay ≥95%.
6. **Review before merge:** `requesting-code-review` agent, fix every flagged issue, then `finishing-a-development-branch` to merge worktree back to master.
7. Money = Decimal. Every table = RLS. No LLMs for financial math. No Yardi/MRI API integrations (file import only).

## Validation commands (impacted projects only, run sequentially)

- backend: `cd backend && pytest --tb=short` then `cd backend && pytest --cov=app --cov-fail-under=95`
- frontend: `cd frontend && npm test` ; `cd frontend && npm run typecheck`
- marketing: `cd marketing && npm run typecheck`

## How the ledger works

- **`FINDINGS.md`** — the master bug/gap ledger. Every issue gets an ID (`F-001`...), a domain, severity, status, and notes. Statuses: `TODO`, `IN-PROGRESS`, `FIXED` (code changed, not yet verified), `VERIFIED` (tested + reviewed), `WONTFIX` (with reason).
- **`PROGRESS.md`** — append-only session log + the current cycle/phase and the single "NEXT ACTION" pointer so the next agent knows exactly where to start.
- **`audit/`** — per-domain audit reports produced during discovery (one file per domain).

## Phases

1. **Discovery/Audit** — systematically map every page/flow, catalog findings into `FINDINGS.md`. (parallel Explore agents per domain)
2. **Fix cycles** — batch findings by domain, fix in worktrees, verify, review, merge.
3. **Integration & E2E** — wire-level verification that flows work end-to-end (real backend + frontend), Playwright.
4. **Review/fix loop** — repeat 2–3 until FINDINGS has no open items and a full E2E pass is clean.

Baseline at start (2026-05-28): `frontend npm run typecheck` = PASS (exit 0).
