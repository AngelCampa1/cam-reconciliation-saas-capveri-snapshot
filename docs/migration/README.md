# CAMAudit → CapVeri Rebrand Migration

## Overview

This directory contains phased migration documentation for rebranding **CAMAudit** to **CapVeri**.
Each phase doc is a self-contained work order an agent can pick up and execute independently.

- **Total files to update**: ~480 files
- **Total occurrences**: ~3,500+
- **New brand**: CapVeri
- **New domains**: capveri.com, app.capveri.com, api.capveri.com

---

## Domain Mapping

| Old | New |
|-----|-----|
| `www.capveri.com` | `www.capveri.com` |
| `app.capveri.com` | `app.capveri.com` |
| `api.capveri.com` | `api.capveri.com` |
| `staging.capveri.com` | `staging.capveri.com` |
| `capveri.com` | `capveri.com` |

---

## Brand String Inventory

| Old String | New String | Notes |
|-----------|------------|-------|
| `CapVeri` | `CapVeri` | Primary brand name (drop .io suffix) |
| `CAMAudit` | `CapVeri` | All case variations |
| `camaudit` | `capveri` | Lowercase (package names, slugs, IDs) |
| `CAMAUDIT` | `CAPVERI` | Uppercase (env var prefixes) |
| `CAM Audit` | `CapVeri` | Spaced variant |
| `cam-audit` | `capveri` | Hyphenated variant |
| `camaudit-frontend` | `capveri-frontend` | Package name |
| `camaudit-backend` | `capveri-backend` | Package name |
| `camaudit-marketing` | `capveri-marketing` | Package name |
| `camaudit-documents` | `capveri-documents` | S3 bucket name |
| `com.camaudit.auth` | `com.capveri.auth` | Apple Service ID |
| `@capveri.com` | `@capveri.com` | Email addresses |
| `angel.campa@capveri.com` | `angel.campa@capveri.com` | Admin email |
| `noreply@capveri.com` | `noreply@capveri.com` | Transactional email |
| `Operation Sovereign Wedge` | `Operation Sovereign Wedge` | **KEEP**, internal codename, do not change |

> **IMPORTANT**: "CAM" as an abbreviation for **Common Area Maintenance** must NOT be changed.
> Only change "CAM" when it is clearly part of "CAMAudit" (e.g., `CAMAudit`, `camaudit`, package names).
> Context check: if "CAM" appears in a financial/lease context, leave it alone.

---

## Global Replacement Rules (Ordered to Avoid Conflicts)

Apply substitutions in this exact order to prevent partial matches from corrupting later replacements:

1. `angel.campa@capveri.com` → `angel.campa@capveri.com`
2. `noreply@capveri.com` → `noreply@capveri.com`
3. `@capveri.com` → `@capveri.com`  _(catches any remaining email addresses)_
4. `app.capveri.com` → `app.capveri.com`
5. `api.capveri.com` → `api.capveri.com`
6. `www.capveri.com` → `www.capveri.com`
7. `staging.capveri.com` → `staging.capveri.com`
8. `capveri.com` → `capveri.com`  _(bare domain, catch-all)_
9. `camaudit-frontend` → `capveri-frontend`
10. `camaudit-backend` → `capveri-backend`
11. `camaudit-marketing` → `capveri-marketing`
12. `camaudit-documents` → `capveri-documents`
13. `com.camaudit.auth` → `com.capveri.auth`
14. `CapVeri` → `CapVeri`
15. `CAMAudit` → `CapVeri`
16. `camaudit` → `capveri`  _(lowercase, catches remaining slugs/IDs)_

> **Do NOT** run a blanket `s/CAM/CapVeri/g`: that will corrupt CAM reconciliation terminology.

---

## Phase Dependency Graph

```
Phase 1 (Config)        ← Start here. No dependencies.
    │
    ▼
Phase 2 (Backend)       ← Depends on Phase 1 env vars being settled
    │
    ▼
Phase 3 (Frontend)      ← Can run in parallel with Phase 2
    │
Phase 5 (Marketing)     ← Can run in parallel with Phases 2 & 3
    │
Phase 6 (Infra)         ← Can run in parallel with Phases 2, 3, 5
    │
    ▼
Phase 4 (Tests)         ← Run after Phases 2+3 so fixture domains match code
    │
    ▼
Phase 7 (Docs)          ← Run after all code phases; docs reference final domain/brand
    │
    ▼
Phase 8 (Finalize)      ← Always last: regenerate, sweep, verify
```

**Safe parallel batches:**
- Batch A: Phase 1
- Batch B: Phases 2, 3, 5, 6 (after Batch A)
- Batch C: Phase 4 (after Batch B)
- Batch D: Phase 7 (after Batch B)
- Batch E: Phase 8 (after Batches C + D)

---

## Edge Cases (Global)

### 1. "CAM" as Domain Terminology: Do NOT Change
The codebase extensively uses "CAM" to mean Common Area Maintenance (the financial concept):
- `CAM reconciliation`, `CAM charges`, `CAM pool`, `CAM caps`, `CAM expenses`
- Column headers: `cam_total`, `cam_share`, `cam_expense_type`
- DB column names: `cam_charges`, `cam_reconciliation_id`
- Python classes: `CAMReconciliation`, `CAMPool`, `CAMExpense`

**Rule**: Only change `camaudit` (no space, lowercase), `CAMAudit` (camelcase brand), or explicit domain references.

### 2. CLAUDE.md: Keep Codename
`CLAUDE.md` references "Operation Sovereign Wedge" as the internal codename. Keep it. It's not public-facing.

### 3. Git History
Do NOT rewrite git history. The migration changes files going forward only.

### 4. Supabase Project Slug
The Supabase project slug (in `supabase/config.toml` and the project URL) may need to be changed via the Supabase dashboard, not just in files. Flag this for manual action.

### 5. Stripe Product Names
Stripe product/price names shown to customers (e.g., "CAMAudit Pro") need to be updated in the Stripe dashboard as well as in code. Flag for manual action.

### 6. Apple Service ID
`com.camaudit.auth` is used for Sign in with Apple. Changing this requires updating the Apple Developer portal as well. Flag for manual action.

### 7. AWS S3 Bucket
`camaudit-documents` bucket name cannot be renamed: AWS does not support bucket renaming. A new bucket `capveri-documents` must be created and data migrated. Flag for manual action.

### 8. Vercel Project Names
Vercel project names (e.g., `camaudit-frontend`, `camaudit-marketing`) are set in the Vercel dashboard. The `vercel.json` files only need domain rule updates. Flag project renames for manual action.

### 9. `.firecrawl/` Cache
The `.firecrawl/` directory contains cached crawl output for the old domain. These files should be deleted and re-crawled after the new domain is live, not manually edited.

### 10. MDX Content: "CAM" in Educational Content
Marketing blog and resource MDX files discuss "CAM charges", "CAM reconciliation" as educational content. Do NOT replace "CAM" in these contexts. Only replace `CAMAudit` brand references.

---

## Phase Index

| Phase | File | Scope | Est. Files |
|-------|------|-------|-----------|
| 1 | [phase-1-config.md](./phase-1-config.md) | Runtime-critical config | ~10 |
| 2 | [phase-2-backend.md](./phase-2-backend.md) | Backend source code | ~35 |
| 3 | [phase-3-frontend.md](./phase-3-frontend.md) | Frontend source code | ~30 |
| 4 | [phase-4-tests.md](./phase-4-tests.md) | All test files | ~42 |
| 5 | [phase-5-marketing.md](./phase-5-marketing.md) | Marketing site | ~100 |
| 6 | [phase-6-infra.md](./phase-6-infra.md) | Supabase, Docker, scripts | ~25 |
| 7 | [phase-7-docs.md](./phase-7-docs.md) | Docs & agent config | ~240 |
| 8 | [phase-8-finalize.md](./phase-8-finalize.md) | Regenerate, sweep, verify | N/A |
| 9 | [phase-9-go-live.md](./phase-9-go-live.md) | DNS cutover & infrastructure setup | N/A |

---

## Manual Actions Required (Before or After Migration)

These cannot be done via file edits alone:

| Action | Owner | When |
|--------|-------|------|
| Register `capveri.com` domain | DevOps | Before Phase 1 |
| Create Vercel project aliases for `capveri.com` domains | DevOps | Before Phase 1 |
| Create Railway custom domain `api.capveri.com` | DevOps | Before Phase 1 |
| Create new S3 bucket `capveri-documents` and migrate data | DevOps | Before Phase 2 |
| Update Apple Developer portal Service ID | DevOps | Before Phase 2 |
| Update Stripe product names and dashboard branding | Business | After Phase 8 |
| Update Resend sending domain to `capveri.com` | DevOps | Before Phase 2 |
| Update Supabase project display name | DevOps | Any time |
| Re-crawl site with firecrawl after new domain is live | Marketing | After Phase 8 |
| Update Google Search Console, Analytics properties | Marketing | After Phase 8 |
| Submit new sitemap to search engines | Marketing | After Phase 8 |
