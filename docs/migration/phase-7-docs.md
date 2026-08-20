# Phase 7: Documentation & Agent Config

**Depends on**: Phases 2, 3, 5, 6 (all code phases complete)
**Blocks**: Phase 8 (finalize)
**Can run in parallel with**: Phase 4
**Est. files**: ~240
**Est. occurrences**: ~1,200

## Goal

Update all documentation files, story files, business docs, architecture diagrams,
guide files, and agent configuration so that no docs reference the old brand or domain.
This is the largest phase by file count; most changes are simple text replacements.

---

## CAM Rule for Docs

Documentation extensively discusses CAM reconciliation concepts. Apply the same rule:

- "CAM reconciliation", "CAM charges", "CAM pool", "CAM caps" → **do NOT change**
- `CAMAudit` (brand name), `capveri.com` (domain) → **change**

---

## Root-Level Docs

### `CLAUDE.md`
Already updated in Phase 1. Verify it's clean.

### `README.md`
Already updated in Phase 1. Verify it's clean.

### `AGENTS.MD` (root, if exists)
Already updated in Phase 1. Verify it's clean.

---

## Architecture Docs (`docs/architecture/`)

### `docs/architecture/system-architecture.md`
**What to change**:
- Architecture diagram domain labels: `app.capveri.com`, `api.capveri.com`, `www.capveri.com`
- Brand name in system description
- Service name labels

**Replacement rules**: 4–8, 14–15.

---

### `docs/architecture/tenant-portal-architecture.md`
**What to change**:
- Portal domain references
- Brand name in component descriptions

---

### `docs/architecture/billing-per-building-architecture.md`
**What to change**:
- Brand name in billing flow descriptions
- Domain in webhook URL examples

---

### `docs/architecture/reconciliation-architecture.md`
**What to change**:
- Brand name in architecture descriptions
- Domain in API examples

**Do NOT change**: CAM pool, CAM reconciliation terminology in diagrams.

---

### `docs/architecture/reconciliation-ux-flow.md`
**What to change**:
- Brand name in UX flow descriptions

---

### `docs/architecture/anomaly-detection.md`
**What to change**:
- Brand name in feature description

---

### `docs/architecture/rbac-permissions.md`
**What to change**:
- Brand name in permission context

---

## Guide Docs (`docs/guides/`)

### `docs/guides/coding-standards.md`
**What to change**:
- Brand name in doc header and references

### `docs/guides/domain-knowledge.md`
**What to change**:
- Brand name in context header
- **Do NOT change**: All CAM terminology throughout — this is the CAM domain guide

### `docs/guides/backend-testing.md`
**What to change**:
- Brand name in doc header
- Example email addresses in code snippets

### `docs/guides/story-workflow.md`
**What to change**:
- Brand name in doc header

---

### `docs/guides/01-infrastructure/*.md` (all files)
**What to change**:
- Brand name in guide headers
- Domain URLs in setup instructions

**Replacement rules**: 4–8, 14–15.

---

### `docs/guides/02-deployment/*.md` (all files)

#### `docs/guides/02-deployment/06-domain-and-ssl-configuration.md`
**What to change** (highest priority):
- Old domain names throughout: `capveri.com`, `app.capveri.com`, `api.capveri.com`
- SSL certificate domain values
- DNS record examples

**Replacement rules**: 4–8.

#### `docs/guides/02-deployment/04-frontend-deployment-vercel.md`
**What to change**:
- Domain names in Vercel deployment instructions
- Environment variable examples

**All other `02-deployment/` files**:
- Brand name in headers, domain in examples

---

## Architecture & Deployment Docs

### `docs/DEPLOYMENT.md`
**What to change**:
- All domain references in deployment overview
- Brand name in headers

**Replacement rules**: 4–8, 14–15.

---

### `docs/MANUAL_TESTING_GUIDE.md`
**What to change**:
- Domain references in test steps
- Brand name in guide headers

**Replacement rules**: 4–8, 14–15.

---

## Story Files (`docs/stories/`)

### `docs/stories/STORY_TRACKER.md`
**What to change**:
- Brand name in tracker header

### `docs/stories/**/*.md` (all story files, ~40+ files)
**What to change**:
- Brand name in story context sections
- Domain URLs in acceptance criteria or examples
- Email addresses in story example data

**Do NOT change**:
- Story IDs, story titles about CAM features (the feature concept remains)
- Technical specifications for CAM calculations

**Efficient approach**:
```bash
# Find all story files with camaudit
grep -rl "camaudit" docs/stories/ --include="*.md"
# For each: apply rules 1–8, 14–15
```

---

## Business Docs (`docs/business/`)

### `docs/business/Business Plan - CRE SaaS.md`
**What to change**:
- Brand name throughout (this is a strategic doc with many occurrences)
- Domain references
- Codename "Operation Sovereign Wedge" — **KEEP as-is**
- Product name in financial projections

**Replacement rules**: 1–8, 14–15 (skip codename).

### Other `docs/business/*.md` files
Same pattern — brand name in business context, domain in growth projections.

---

## Plans (`docs/plans/`)

### `docs/plans/*.md` (all plan files, ~10 files)
**What to change**:
- Brand name in plan headers and context
- Domain in technical plans

**Replacement rules**: 4–8, 14–15.

---

## Compliance (`docs/compliance/`)

### `docs/compliance/*.md` (all files, ~4 files)
**What to change**:
- Company name in compliance docs: `CAMAudit` → `CapVeri`
- Domain in data processing agreements
- Email addresses in compliance contacts

**Replacement rules**: 1–8, 14–15.

---

## Feature Inventory (`docs/feature-inventory/`)

### `docs/feature-inventory/*.md` (all files, ~4 files)
**What to change**:
- Brand name in feature headers
- Domain in feature links

---

## Content Docs (`docs/content/`)

### `docs/content/*.md` (all files, ~5 files)
**What to change**:
- Brand name in marketing content docs
- Domain URLs in content strategy docs

---

## GTM Tasks (`docs/01-FEB-GTM-Tasks/`)

### All `.md` files (~20+ files)
**What to change**:
- Brand name in task headers and context
- Domain in outreach templates
- Email addresses in contact examples

**Replacement rules**: 1–8, 14–15.

---

## Deep Research Docs (`docs/deep research/`)

### All `.md` files (~10+ files)
**What to change**:
- Brand name in research doc headers and conclusions
- Domain in research context

---

## Comprehensive Plan Docs

### `docs/Comprehensive SaaS Development Plan.md`
**What to change**:
- Brand name throughout
- Codename "Operation Sovereign Wedge" — **KEEP as-is**
- Domain references

---

## This Migration Directory (`docs/migration/`)

Once all phases are complete, update this README and phase docs to reflect any
corrections or lessons learned during execution. The phase docs themselves should be
updated to mark phases as "COMPLETE" after execution.

---

## Efficient Execution Strategy

Given ~240 files, use a bulk sweep approach:

```bash
# Step 1: Generate list of all docs files with camaudit refs
grep -rl "camaudit" docs/ --include="*.md" > /tmp/docs_to_update.txt
wc -l /tmp/docs_to_update.txt  # Confirm count

# Step 2: Apply replacements in correct order (see README global rules)
# Process each file — either use sed in sequence or a script

# Example sed sequence (run in order):
while IFS= read -r file; do
  sed -i \
    -e 's/angel\.campa@camaudit\.io/angel.campa@capveri.com/g' \
    -e 's/noreply@camaudit\.io/noreply@capveri.com/g' \
    -e 's/@camaudit\.io/@capveri.com/g' \
    -e 's/app\.camaudit\.io/app.capveri.com/g' \
    -e 's/api\.camaudit\.io/api.capveri.com/g' \
    -e 's/www\.camaudit\.io/www.capveri.com/g' \
    -e 's/staging\.camaudit\.io/staging.capveri.com/g' \
    -e 's/camaudit\.io/capveri.com/g' \
    -e 's/CAMAudit\.io/CapVeri/g' \
    -e 's/CAMAudit/CapVeri/g' \
    -e 's/camaudit/capveri/g' \
    "$file"
done < /tmp/docs_to_update.txt
```

> **WARNING**: The `camaudit` → `capveri` rule at the end is broad. After running,
> manually inspect any file that contained "cam audit" (space-separated) to ensure
> it wasn't accidentally caught.

---

## Edge Cases

1. **"Operation Sovereign Wedge"** appears in `CLAUDE.md`, `AGENTS.MD`, `Business Plan`, and `Comprehensive SaaS Development Plan.md`. Keep it as-is in all of them.

2. **Story titles about CAM features**: A story titled "Implement CAM Gross-Up Calculation" should remain unchanged — "CAM" here is the domain concept. Only change if the story title or body contains `CAMAudit` brand references.

3. **Code snippets in docs**: If docs contain Python or TypeScript code examples with `camaudit` strings (e.g., example API calls to `api.capveri.com`), update those code blocks too.

4. **External links**: If docs reference external URLs that are not under `capveri.com` (e.g., competitor sites, Stripe docs), do NOT change those. Only change `*.capveri.com` links.

---

## Verification

```bash
# Check no camaudit remains in docs (excluding known exceptions)
grep -r "camaudit" docs/ --include="*.md" | grep -v "Sovereign Wedge"

# Confirm key docs have correct brand
grep "CapVeri" docs/architecture/system-architecture.md
grep "capveri.com" docs/guides/02-deployment/06-domain-and-ssl-configuration.md
```

Expected: zero `camaudit` hits (excluding intentional codename keepas).
No build commands needed for this phase — docs only.
