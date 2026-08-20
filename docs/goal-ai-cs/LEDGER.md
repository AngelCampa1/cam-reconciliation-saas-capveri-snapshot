# Goal: AI-CS for CapVeri — LEDGER

Goal (Angel, 2026-06-20): make AI-CS a world-class in-product expert + teacher for CapVeri.
80-yr-old beginner can learn the product from it. Plain words, fast, no lies, beautiful,
always in sync. Iterative to perfection. Research-heavy before code. Shared infra in
`ventora-platform`; per-product knowledge in CapVeri (`camaudit`).

Design spec: `docs/superpowers/specs/2026-06-20-ai-cs-capveri-design.md`.

## Research (DONE 2026-06-20)
- AI-CS brain = ventora `packages/ai-cs-worker` (OpenRouter minimax-m3 / gpt-5.4-nano).
- Widget = ventora `packages/ai-cs/src/react/AiCsWidget.tsx`; CTA default "Need help?".
- Contract = ventora `packages/ai-cs-contracts` `AiCsAppContext` (no teaching fields).
- CapVeri provider = `cloudflare-backend/src/domain/ai-context/public-knowledge.ts`
  `buildAiCsAppContext()` — forwards thin nav+3 sources+workflow; DROPS glossary/steps/faqs.
- CRITICAL: AI-CS chat is DARK in CapVeri — not embedded; only CRM feedback button mounted.
- SYNC HOLE: `cloudflare-backend/src/generated/public-knowledge.json` hand-copied, not in
  generator output nor drift gate. ~half of routes have zero AI-CS coverage.

## Decisions (user-approved)
React embed; rearchitect contract w/ teaching fields; improve shared infra product-agnostic.

## Slices
1. [DONE] Sync gate — generator + drift gate + generated json in pipeline (commit 28064625).
2. [DONE] Knowledge contract + CapVeri depth (commit 2f8f2461).
3. [DONE] Communication brain (teacher prompt + eval harness) — ventora commit 70999d5.
4. [DONE] Embed + design + "Questions?" CTA (BFF + frontend mount).
5. [DONE] Exhaustive local e2e + review cycles -> prod (merge c86d99fb).
6. [DONE] Real-browser prod hardening — fixed a user-facing 502 the scripted
   e2e masked (commit e8edc198 + regression test 9a9f86ae).

## Environment notes
- Work isolated in worktree `camaudit/.worktrees/goal-ai-cs` (branch
  `feat/ai-cs-capveri`) to dodge shared-tree churn that wiped Slice 2 once.
- Generator (`scripts/generate-public-knowledge.mjs`) needs typescript + prettier
  resolvable from an ancestor of repoRoot; installed prettier@3.7.4 (must match
  frontend) + typescript@5.9.3 at main-tree root node_modules. Frontend deps
  installed in the worktree so pre-commit frontend-build/eslint hooks pass.

## Cycle log
- 2026-06-20: research complete; spec written; starting Slice 1.
- 2026-06-20: Slice 1a done (sync gate, 28064625).
- 2026-06-20: Slice 2 done (2f8f2461). Teaching layer: concepts (from glossary),
  howtos (from topic steps), 8 grounded plain-language FAQs (humanizer +
  third-grade-copy passed, FK ~3.6, no invented claims). AppHelpFaq schema +
  appHelpFaqs source + generator wiring + all artifacts regenerated. Teaching
  tests 12/12. Also fixed a pre-existing master-merge tsc error
  (reconciliation-routes fixture missing tenant_share_after_cap).
- 2026-06-20: Slice 3 done (ventora feat/ai-cs-teaching 70999d5). Rewrote
  ai-cs-worker buildSystemPrompt into a plain-language beginner teacher
  (answer-first, short sentences, use concepts/howtos/faqs, name exact
  screens/buttons/paths, never invent, data-not-orders injection guard).
  buildOpenRouterPayload: ZDR (provider.zdr) on primary + fallback,
  temperature 0.3, max_tokens 1500. New deterministic eval harness
  (teacher-prompt-eval.test.ts): 28 beginner asks matched against the
  embedded context region only, negative/abstention case, prompt-quality
  invariants. Worker 269/269 green, tsc clean, biome clean, coverage 98%.
  Opus review actioned: max_tokens 800->1500 (truncation), typed provider
  local, injection guard, eval scoped to context region + abstention case.
- 2026-06-20: Slice 4 done (BFF + embed). Backend: POST /api/v1/ai-cs/sign
  BFF mints short-lived HMAC client assertions so the browser never holds
  AI_CS_CLIENT_ASSERTION_SECRET; auth-gated, path-allowlisted (/v1/sessions,
  /v1/chat, /v1/escalations), bound to the actor (appId/userId checks). New
  env field + 20/20 ai-cs-routes tests, biome clean. Frontend: AiCsHelpWidget
  wraps @ventora/ai-cs@^1.0.1 AiCsWidget, signRequest -> /ai-cs/sign via
  authenticatedFetch, session stable per user with live currentPath, brand
  capveri, launcher "Questions?". Renders null unless VITE_AI_CS_BASE_URL set
  (App.test stays green). Frontend tsc clean, eslint clean, 6468/6468 tests,
  vite build clean. "Questions?" CTA kept per explicit user request (overrides
  the verb-start convention); clear, warm, beginner-friendly. Redesigned
  visuals ship in Slice 5 via a 1.x publish + repin (1.0.1 is API-identical).
- 2026-06-20: Slice 5 DONE — shipped to prod + merged to master (c86d99fb,
  pushed origin). Wiring: VITE_AI_CS_BASE_URL +
  https://ventora-ai-cs-worker.<account>.workers.dev in frontend
  wrangler.jsonc vars (baked into the bundle by cloudflare-env-runner's
  applyWranglerVars at build), plus that origin added to worker.ts CSP
  connect-src (+ regression test) — without it the browser blocks every
  widget fetch/SSE. Deployed + verified 100%: ventora-ai-cs-worker ceec99c8
  (code 15e7bb2, buffers answer -> single message.delta), capveri-api
  84b8aab1, capveri-app 7c67cc6c. Frontend deploy from the worktree needs
  .env.local + .env.production.local copied in (env runner requires
  VITE_SUPABASE_URL/ANON_KEY/TURNSTILE; wrangler vars can't supply them).
  Secrets rotated to fresh matching values on both workers (CapVeri is the
  sole CS consumer, no live traffic): AI_CS_CLIENT_ASSERTION_SECRET (browser
  layer) + AI_CS_CONTEXT_SECRET (worker->backend context layer). Live prod
  e2e PASS: real QA JWT -> BFF mint -> worker session 201 -> grounded SSE
  teacher answer (843 chars, "CAM... first create a property") -> tampered
  assertion 401 (fail-closed). Pre-merge Opus review: no Critical/Important.
  Gates on merged master green: knowledge sync gate, frontend lint,
  backend ai-cs+signing 32/32 (full frontend suite green modulo one
  pre-existing flaky LeaseDocumentUpload test this branch never touches).
  Merge handled a contested main tree: a competing uncommitted teaching-layer
  draft for public-knowledge.ts + ai-cs-routes.test.ts was preserved to
  git stash@{0} ("WIP competing ai-cs teaching-layer draft") before the
  3-way merge (ort, no conflicts), so no parallel work was lost.
- 2026-06-20: Slice 6 — REAL-BROWSER prod test ("test it more live") exposed
  that the Slice 5 "prod e2e PASS" was a FALSE POSITIVE. A live browser session
  on app.capveri.com (QA login -> open widget -> ask) returned 502
  app_context_unavailable on EVERY /v1/chat. Sign (200) + /v1/sessions (201)
  worked; only the chat context fetch failed. ROOT CAUSE: the BFF
  /api/v1/ai-cs/app-context requires a Bearer JWT (authMiddleware -> verified by
  unsigned probe returning 401 authorization_required), and the ai-cs-worker
  forwards whatever Authorization it received on /v1/chat to that endpoint. The
  embedded @ventora/ai-cs widget sent NO Authorization to the worker, so the
  worker forwarded none -> BFF 401 -> worker surfaces app_context_unavailable
  (502). The scripted harness (prod-ai-cs-smoke.mjs, now deleted) MANUALLY
  attached the QA JWT to its worker call, so it passed while the real widget
  failed — classic unit/harness coverage != runtime safety (same lesson as
  [[goal_ai_agents_e2e]]). FIX (e8edc198): added a custom `fetch` to
  AiCsApiConfig in AiCsHelpWidget.tsx that injects the live Supabase
  access_token (getSession, fetched fresh per call for rotation) as
  Authorization on every worker request, unless the caller already set it.
  Also re-synced AI_CS_CONTEXT_SECRET byte-identical on both workers and
  reset AI_CS_CONTEXT_ENDPOINTS={"capveri":"https://api.capveri.com/api/v1/
  ai-cs/app-context"} on the worker. Re-test in a real browser: all three
  /v1/chat -> 200 with grounded, plain-language streamed teacher answers (CAM
  defined plainly; "Add a property" steps name the real Properties screen).
  Deploys 100%: capveri-app 0c0faa97 (carries e8edc198), capveri-api fb4d2994,
  ventora-ai-cs-worker 979df640. Added the missing regression test (9a9f86ae):
  AiCsHelpWidget.test.tsx now asserts api.fetch injects the JWT, doesn't
  overwrite a caller header, and omits it with no session (14/14, tsc+eslint
  clean). LESSON: ship a REAL-BROWSER e2e for any embedded third-party widget;
  a CLI/script harness that hand-builds auth will hide a missing-auth wiring
  bug every time.
