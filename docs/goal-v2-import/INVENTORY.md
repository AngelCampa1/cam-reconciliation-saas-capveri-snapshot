# Import Inventory: camaudit-v2 → camaudit

Built 2026-06-01 from 4 parallel exploration agents. Ranked into batches.
Each item: status is one of TODO / IN-PROGRESS / DONE / SKIP / DEFERRED.

> **Key finding:** Target is NOT on Claude 3.5 Sonnet for extraction. Target
> `backend/app/config.py` already uses OpenRouter + Gemini (primary
> `google/gemini-3.1-flash-lite-preview`, sibling `google/gemini-3-flash-preview`,
> judge `z-ai/glm-5.1`). The root CLAUDE.md "Claude 3.5 Sonnet" line is stale docs.
> So "update the models" = adopt v2's model roles/naming + remove residual Anthropic.

---

## BATCH 1 — Docs & model-config truth-up (LOW risk, high value, user-requested)
- [ ] B1.1 Fix stale CLAUDE.md model/infra references (Claude 3.5 Sonnet → OpenRouter/Gemini; "document reader" → real stack). **TODO**
- [ ] B1.2 Remove residual Anthropic dependency from `backend/pyproject.toml` (`anthropic>=0.40.0`) + `.env.example` `ANTHROPIC_*` lines (verify no imports first). **TODO**
- [ ] B1.3 Bump deps to match v2 where safe: `openai>=1.50.0`, `stripe>=11.0.0`. **TODO** (verify no breakage)
- [ ] B1.4 Port `backend/app/core/pricing.py` (standalone MODEL_COSTS + compute_llm_cost_cents). Additive, zero-regression. **TODO**
- [ ] B1.5 Adopt v2 dual-extract pool default: both agents = `google/gemini-3.1-flash-lite-preview` (the "Gemini Flash 3.1 Lite" the user named). Verify target dual orchestrator wiring first. **TODO**

## BATCH 2 — Process rules into CLAUDE.md / AGENTS.md (LOW risk)
- [ ] B2.1 Windows PowerShell + Worktree Safety rules (v2 AGENTS.md). **TODO**
- [ ] B2.2 Worktree cleanup procedure (prune vs remove). **TODO**
- [ ] B2.3 Database migration-first rule. **TODO**
- [ ] B2.4 TDD mandatory + per-file 95% coverage. **TODO**
- [ ] B2.5 Git discipline: explicit staging, no `git add -A`. **TODO**
- [ ] B2.6 Zero-tolerance list (`any`, `# type: ignore` w/o reason). **TODO**
- [ ] B2.7 Code-review-before-commit mandatory step. **TODO**
- [ ] B2.8 Design-token UI origin rule (start from design-tokens.json). **TODO**
- [ ] B2.9 content-quality skill Pass 5 (Sources & Citations). **TODO**

## BATCH 3 — Knowledge/learning docs (LOW risk, additive files) — DONE (commit pending)
- [x] B3.1 docs/bugs/mgmt-fee-alias-misrouting.md (overcharge calibration learning). **DONE** — ported w/ port-status banner (fix is Batch 4.3 spec, absent in target).
- [x] B3.2 docs/real-world-scan-report.md (8 root causes / total-cap lesson). **DONE** — ported w/ port-status banner (fixes are Batch 4 spec).
- [x] B3.3 docs/runbooks/public-form-abuse-hardening.md + audit target forms. **DONE** — adapted to real target paths (turnstile.py, company_website honeypot, per-endpoint limits, Vercel).
- [x] B3.4 docs/guides/supabase-email-templates.md. **DONE** — rebranded CapVeri, port 54324, status note (templates not yet in target).
- [x] B3.5 docs/local-stack-supervisor.md + docs/docker-compose.md. **DONE** — status notes (tooling not present in target), adapted to 3-workspace layout.
- [x] B3.6 memory/people/angel.md founder voice guard. **DONE** — created memory/people/, rebranded.
- [x] B3.7 docs/architecture/llm-models.md (document target AI pipeline). **DONE** — written against target config.py; all model IDs/fallbacks verified; token-usage (not pricing.py) corrected by orchestrator.

## BATCH 4 — Backend correctness/calibration ports (MED risk — verify against target)
> **RESCOPED 2026-06-01 after diff pass (Explore agent, opus).** CRITICAL
> architectural divergence: TARGET has **no `detection/` rules engine, no
> `StatementExtraction` model, no numbered rules**. TARGET's analog is
> LLM-driven cross-doc analysis (`extraction/cross_doc_orchestrator.py` →
> `CrossDocFinding`; rules are free-text in `cross_doc_prompt.py`; cross_doc_model
> = `z-ai/glm-5.1` via OpenRouter). So B4.1/B4.2/B4.4 are NOT field-by-field
> ports — they presuppose the SOURCE detection engine and collapse into the
> DEFERRED **D1** sprint (port-engine-or-stay-LLM is the gating design decision).
> Only B4.5 + B4.6 are safe additive ports.
- [ ] B4.1 Total-cap enforcement (`_enforce_total_cap` + `estimates_billed`). **DEFERRED→D1** — ABSENT; no detection engine / statement model in target. Needs-design.
- [ ] B4.2 Rule 10/Rule 4 false-positive downgrades. **DEFERRED→D1** — ABSENT; no numbered rule engine (findings are LLM `FindingCategory`/`FindingSeverity` enums). Closest lever = prompt-tune `cross_doc_prompt.py` (different mechanism).
- [ ] B4.3 mgmt-fee vs admin-fee alias routing. **NEEDS-DESIGN** — ABSENT; target has only `admin_fee_percentage` (no `management_fee_percentage`), consumed in `calculation/tenant_share.py:408`. Adding a field = schema + 13-file calc change (`lease_recovery_profile`, `lease_term_version`, etc). Decide: add sibling field vs broaden prompt alias to map "administrative and overhead"→existing admin_fee. Defer to its own worktree.
- [x] B4.5 extraction validation re-prompt loop (reflexion-lite). **DONE** — merged to master `d5ac2859`. New `extraction/validation_reprompt.py` + `validation_reprompt_prompts.py` wired into `processor.py` after gap-fill: validate merged JSON against `validation.py`, and on a consistency ERROR re-prompt native-PDF `extract_pdf` to reconcile the coupled cap pair (cap_type↔cap_rate) as a group, ≤2 attempts, fail-open. This also wires the previously-dead validator into the pipeline. Config: `validation_reprompt_model`+fallbacks, `extraction_validation_max_attempts=2`. Suite 6683 passed / 95.25% cov, no regressions.
- [x] B4.6 openrouter_client hardening. **DONE** — merged to master `0604fdf1`. Added `asyncio.wait_for` timeout guard (180s, `settings.extraction_request_timeout_seconds`) on text `extract()` → hung upstream surfaces as `ServiceUnavailableError`; added `"sort": "latency"` to `DEFAULT_PROVIDER_CONFIG` (allow-list unchanged). Used builtin `TimeoutError` except (asyncio alias on 3.11+) rather than touching the tenacity predicate (text path has no tenacity retry). Suite 6669 passed / 95.23% cov, no regressions.

## BATCH 5 — Frontend PLG/analytics quick wins (LOW-MED risk)
- [ ] B5.1 Engagement tracking hooks (scroll depth, time-on-page, section visible). **TODO**
- [ ] B5.2 PostHog unified event taxonomy merge + AI referrer detection + ICP segment. **TODO**
- [ ] B5.3 UTM cookie persistence in marketing middleware. **TODO**
- [ ] B5.4 marketing-route-intent.ts audience library (prereq for above). **TODO**
- [ ] B5.5 Gamified processing UI + use-simulated-progress (needs framer-motion). **TODO**
- [ ] B5.6 Mobile sticky CTA bar; welcome page; inline calculator; OG image convention. **TODO**
- [ ] B5.7 AuthQuerySync + anonymous session cache invalidation (correctness). **TODO**

## BATCH 6 — Marketing pages (copy-heavy → MUST pass humanizer + third-grade-copy)
- [ ] B6.1 PersonaHubLayout + PersonaHubCallout components. **TODO**
- [ ] B6.2 Persona pages (for-franchisees, for-lease-admins, +4). **TODO**
- [ ] B6.3 Service pages (outsourced, white-label, for-cpas). **TODO**
- [ ] B6.4 Referral program marketing page + UI components. **TODO**
- [ ] B6.5 Exit-intent multi-choice + partner split; site promo banner. **TODO**

## BIG FEATURE SPRINTS — DEFERRED (large, interconnected, need their own planning)
- [ ] D1 Detection engine full port (20 structured rules) — **now also absorbs B4.1/B4.2/B4.4.** GATING DECISION: port SOURCE's deterministic `detection/` engine (engine.py/pipeline.py/rules/ + a `StatementExtraction` model) wholesale, OR keep target's LLM `cross_doc` approach and re-express the prepayment-cap / tax-advisory / double-scaling guards as prompt + post-processing logic. These are NOT reconcilable field-by-field. **DEFERRED**
- [ ] D2 Classification service (line_item_classifier). **DEFERRED**
- [ ] D3 Adversarial dual-agent engine. **DEFERRED**
- [ ] D4 GL pipeline + GL API + multi-year API. **DEFERRED**
- [ ] D5 Demand-letter service expansion (state_legal, tone, export). **DEFERRED**
- [ ] D6 Partner portal app + backend + RLS. **DEFERRED**
- [ ] D7 Benchmarking service (EDGAR). **DEFERRED**
- [ ] D8 Tailwind v3→v4 migration. **DEFERRED**
- [ ] D9 Dispute-letter rich editor (Tiptap). **DEFERRED**
- [ ] D10 Format-aware routing (spreadsheet/docx parsers) + R2 storage cutover. **DEFERRED**

## SKIP (do not apply to target)
- Cloudflare KV cache removal (target uses Vercel).
- v2 redis_url consolidation unless we also adopt v2 Celery config (risky, low value now).

## Sequencing note
Batches 1–3 are safe, additive, mostly docs/config — do these first to bank
value with near-zero regression risk. Batch 4 needs careful diffing (some fixes
may already exist in target). Batches 5–6 and the DEFERRED sprints are large and
should each get their own worktree + review cycle in later sessions.
