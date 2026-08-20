# Goal: Page-tailored exit-intent popup + nurture sequence

**Set:** 2026-06-09 · **Branch:** `feature/exit-intent-tailored` · **Worktree:** `.worktrees/feature-exit-intent-tailored`

## Goal (verbatim intent)
Exit-intent popup that: (1) email-only capture → lead magnet, (2) silently enrolls
into a genuinely helpful nurture sequence moving them toward signup (NEVER mention the
sequence to the person), (3) protected by Turnstile, (4) lead magnet tailored to the
specific page being viewed.

## Current state (verified 2026-06-09)
- Popup EXISTS + renders: `marketing/src/components/lead-capture/LeadMagnetExitIntentPopup.tsx`, mounted `marketing/src/app/layout.tsx`.
- Email-only + Turnstile already working (`LeadCaptureForm` emailOnly + `TurnstileWidget`).
- Backend `POST /api/v1/leads/content-download` (`backend/app/api/v1/leads.py`): verifies Turnstile, delivers signed R2 URL via Resend, enrolls in sequencer (`backend/app/services/sequencer.py`) — currently hardcoded `capveri-nurture-value-1`.
- Sequencer = separate repo `sequencer` (Cloudflare Workers). Enroll API `POST /api/v1/enrollments`. CapVeri sequences exist; only 1 lead magnet wired.
- GAP #4: popup shows the SAME 3 magnets on every page — no page tailoring. ← primary work.

## Decisions (from user)
1. UX: tailored default + 2-3 choices (auto-select page best-fit, keep alternatives).
2. Mapping: by topic/page-type cluster + sensible fallback.
3. Sequence: author an improved exit-intent nurture in `sequencer` (value-first, never mention the sequence, drive toward signup).
4. Verify it fires live.

## Slug contract (all repos must agree)
- New sequence slug: `capveri-exit-intent-nurture`
- Routing: backend enrolls `source == "exit_intent_popup"` leads into the new sequence; other sources keep `capveri-nurture-value-1`.
- Eligible exit-intent magnets: deliverable files only (`pdf`/`xlsx`), present in BOTH `marketing/src/lib/lead-magnets/registry.ts` AND `backend/app/services/leads/asset_registry.py`.

## Workstreams
- [ ] M — Marketing: page→magnet tailoring module + popup edit + tests
- [ ] S — Sequencer: author `capveri-exit-intent-nurture` + email templates + compile
- [ ] B — Backend: source-based sequence routing + tests
- [ ] Copy gates: humanizer + third-grade-copy + marketing-copy-gate on all reader-facing copy (popup promises, emails)
- [ ] Review cycle(s) until clean
- [ ] Live verify popup fires
- [ ] Merge to master

## Log
- 2026-06-09: explored, decisions captured, worktree + ledger created.
- 2026-06-09: M/B/S implemented (parallel).
  - M: page-tailoring.ts + popup edit + 67 tests; typecheck/lint/copy-gate green.
  - B: source-based routing in leads.py + 2 tests; impacted tests pass; formatted.
  - S: branch feature/capveri-exit-intent-nurture in sequencer; exit-intent-nurture.yaml (7 touches d1/4/7/10/13/20/27, repo cadence policy) + templates; `pnpm seq compile` 149 seq 0 errors; copy passed humanizer+third-grade. Pre-existing unrelated packages/db journal test failure (not ours).
- Next: review cycles (camaudit + sequencer), live verify popup, then merge.
