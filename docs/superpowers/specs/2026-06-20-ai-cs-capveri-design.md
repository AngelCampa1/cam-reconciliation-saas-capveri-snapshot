# AI-CS for CapVeri — Design Spec

Date: 2026-06-20
Owner: Angel (founder)
Status: Approved (design locked; iterative build)

## Goal

Make AI-CS a world-class in-product expert + teacher for CapVeri. An 80-year-old who has
never used software should open the chat, ask a question, and learn to use CapVeri
effectively. Plain words, fast answers, zero lies, beautiful UI, and **impossible to drift
out of sync** with the product as it changes.

## Critical reframe (research finding)

AI-CS chat is **not embedded in CapVeri today** — only the `crm.ventoralabs.com`
feedback-button is mounted (separate system, repo `ventora-crm`, no AI-CS path).
CapVeri's backend *does* serve signed app-context and the ventora `ai-cs-worker` *is*
configured for `appId=capveri`, but no client mounts the chat. So this is a **net-new embed +
deep knowledge/communication/sync/design overhaul**, not a tune-up.

## Architecture map

- **Brain:** `ventora-platform/packages/ai-cs-worker` — Cloudflare Worker, OpenRouter
  (minimax/minimax-m3 primary, openai/gpt-5.4-nano fallback). `buildSystemPrompt` has no
  persona/teaching/length/no-lies contract today.
- **Widget:** `ventora-platform/packages/ai-cs/src/react/AiCsWidget.tsx` (React) +
  `styles.ts` (brand map, all CSS) + `markdown.tsx`. Launcher CTA defaults "Need help?".
- **Contract:** `ventora-platform/packages/ai-cs-contracts/src/index.ts` — `AiCsAppContext`
  has no first-class teaching field (concept/howto/faq). Worker `minimizeAppContext` caps
  sources to 8 / excerpts 600 chars.
- **CapVeri provider:** `cloudflare-backend/src/domain/ai-context/public-knowledge.ts`
  `buildAiCsAppContext()` forwards only thin nav + 3 sources + workflow labels; drops the
  authored glossary, step bodies, fieldHelp, FAQ explainers.
- **CapVeri served data:** `cloudflare-backend/src/generated/public-knowledge.json` —
  hand-copied, NOT in the generator output list, NOT in the drift gate.
- **Knowledge source of truth:** `knowledge/source/app-help.ts` (+ product.ts,
  marketing-faqs.ts, plan-tiers.json) → `scripts/generate-public-knowledge.mjs` →
  generated artifacts; gate `scripts/check-public-knowledge.mjs`.

## Decisions (user-approved 2026-06-20)

1. Embed via the **React component** in CapVeri's frontend (full design control, screen-aware
   `currentPath`, matches the design system).
2. **Rearchitect the shared contract** with first-class teaching fields (concepts/howtos/faqs).
3. **Improve the shared ventora infra** product-agnostically (teacher prompt, design,
   contract); keep other products' (camaudit/grantpipe/lextract) tests green. Domain
   knowledge stays per-product.

## Knowledge model (contract extension)

Add to `AiCsAppContext` (all optional, back-compat):
- `concepts?: { term: string; plainDefinition: string; whyItMatters?: string; path?: string }[]`
- `howtos?: { id: string; goal: string; prerequisites?: string[]; steps: { n: number; instruction: string; screen?: string; button?: string; path?: string }[] }[]`
- `faqs?: { question: string; answer: string; path?: string }[]`

Worker `minimizeAppContext` forwards these with sane caps (e.g. ≤24 concepts, ≤24 howtos,
≤30 faqs, per-field length limits) and injects them into the system context JSON. CapVeri's
`buildAiCsAppContext()` populates them from the already-authored `app-help.ts` glossary,
topic steps, fieldHelp, and marketing FAQ explainers, expanded to cover **every**
authenticated route.

## Communication brain (system prompt, product-agnostic)

Rewrite `buildSystemPrompt` to a teacher persona with a hard contract:
- Explain like the user has never seen a computer; third-grade reading level; short sentences.
- Numbered steps naming the exact screen + exact button label + path from signed context.
- **Never invent** features/paths/claims not in signed context (no-lies). The signed context
  is the single source of truth.
- Define any needed jargon in one plain line before using it.
- Answer the question first, then offer the single next step, then stop. Concise; length cap.
- Don't push human support unless asked or genuinely required.
Canned/fallback copy passes `humanizer` then `third-grade-copy`. Pressure-test against a
25+ question beginner test set.

## Sync guarantee (make drift impossible)

1. Add `cloudflare-backend/src/generated/public-knowledge.json` to BOTH
   `generate-public-knowledge.mjs` outputs and `check-public-knowledge.mjs` checked files →
   CI fails on stale AI-CS knowledge.
2. Add a **route-coverage test**: every authenticated landlord/tenant nav path in
   `frontend/src/config/navigation.ts` must map to ≥1 how-to/topic, else CI fails. New
   feature without teaching material → red build.

## Widget embed + design + CTA

- Mount `@ventora/ai-cs/react` in CapVeri frontend (like `CrmFeedbackWidget`): `appId=capveri`,
  signed-request BFF (browser never holds the HMAC secret), `currentPath`, `userId`, brand.
- Launcher CTA → **"Questions?"** via per-mount `copy` override.
- Redesign the shared widget to look genuinely great (refined launcher/panel/bubbles, pill
  geometry per canon, accessible, dark-mode, reduced-motion); CapVeri brand tokens. All
  products gain the design.

## Testing strategy

- Local: contract/worker/widget unit tests; real-Chromium e2e harness pointed at
  `appId=capveri` against CapVeri's **real** local signed context; beginner Q&A eval harness
  (real OpenRouter) scoring accuracy / no-lies / reading level / "taught the next step".
- Recursive review/fix cycles until clean (sub-agent review each cycle's diff).
- Then deploy ventora worker + capveri-api + capveri frontend; re-verify e2e in prod.

## Sequencing (iterative slices; each shippable + reviewed)

1. **Sync gate** — close the drift hole (generator + drift gate + route-coverage test).
2. **Knowledge contract + CapVeri depth** — concepts/howtos/faqs, full route coverage.
3. **Communication brain** — teacher system prompt + eval harness.
4. **Embed + design + "Questions?" CTA.**
5. **Exhaustive local e2e + review cycles → prod.**

## Non-goals

- No changes to `ventora-crm` (feedback button is unrelated).
- No API integrations with ERPs (anti-integration stands).
- No LLM-computed financial numbers.

## Risks

- Shared-infra edits affect other products → run their suites before merge.
- Shared/contested main trees across machines → isolate work, verify commits via git log.
- Prod deploy verification must reach 100% current version on impacted Workers.
