# Phase 6: Infrastructure, Database & Scripts

**Depends on**: Phase 1 (config settled)
**Blocks**: Phase 4 (tests use seed data)
**Can run in parallel with**: Phases 2, 3, 5
**Est. files**: ~25
**Est. occurrences**: ~80

## Goal

Update Supabase migrations and seeds, Docker config, CI/CD configuration,
GTM tooling, and utility scripts. After this phase, all infrastructure-as-code
references the new brand and domain.

---

## Supabase

### `supabase/config.toml`
**What to change**:
- `project_id` or display name if it contains `camaudit`
- Any `site_url` or `additional_redirect_urls` containing old domain
- Email template overrides with old domain in URLs

**Replacement rules**: 4–8, 14–15.

**Edge case**: The Supabase project slug (`project_id`) cannot be renamed via the dashboard after creation. The `config.toml` `project_id` field is used by the Supabase CLI to target the correct project — if the slug is `camaudit`, it stays as-is in the CLI config. Only update display-name and URL fields.

---

### `supabase/migrations/*.sql` (all migration files, ~20+ files)
**What to change**:
- SQL comments containing brand name (e.g., `-- CAMAudit schema setup`)
- Any hardcoded domain URLs in migration comments or seeded data
- Email addresses in any `INSERT` statements within migrations (rare but check)

**Do NOT change**:
- Column names like `cam_charges`, `cam_reconciliation_id` — these are domain terminology
- Function names with `cam_` prefix — domain terminology
- Table names — established schema, do not rename

```bash
grep -r "camaudit" supabase/migrations/ --include="*.sql"
```

Update only the lines returned. Most will be in SQL comments.

---

### `supabase/seeds/*.sql` (all seed files, ~10 files)
**What to change**:
- Test user email addresses: `*@capveri.com` → `*@capveri.com`
- Organization name values containing brand: `'CAMAudit Demo Org'` → `'CapVeri Demo Org'`
- Any hardcoded URL strings in seed data

**Replacement rules**: 1–8, 14–15.

---

## Docker

### `docker-compose.test.yml` (root)
**What to change**:
- Container names containing `camaudit` (if any)
- Environment variable values with old domain
- Volume names containing brand

**Replacement rules**: 4–8, 14–16.

---

### `docker-compose.yml` (root, if exists)
**What to change**:
- Same patterns as `docker-compose.test.yml`

---

### `Dockerfile` files (backend or root, if they exist)
**What to change**:
- Any `LABEL` metadata with brand name
- `ENV` variable defaults with old domain

---

## CI/CD

### `.github/workflows/*.yml` (if GitHub Actions exist)
**What to change**:
- Workflow names containing brand: `name: CAMAudit CI` → `name: CapVeri CI`
- Environment variable values with old domain (but not secret names if they're referenced externally)
- Any `run:` step commands that hardcode old domain for health checks

**Replacement rules**: 4–8, 14–15.

**Edge case**: If GitHub Secrets are named `CAMAUDIT_*`, those names should stay as-is for now (renaming GitHub Secrets requires manual action in the repo settings and updating all references simultaneously). Document as a follow-up manual action.

---

## Scripts

### `scripts/new-worktree.ps1`
**What to change**:
- Any brand name in script help text or comments

**Replacement rules**: 14–15.

---

### `scripts/test_resend_live.py`
**What to change**:
- Portal URL in test data: `app.capveri.com` → `app.capveri.com`
- Test email addresses

**Replacement rules**: 1–8.

---

### `tools/build-assets/build_cam_calculator.py`
**What to change**:
- Domain in build metadata comments
- Brand name in output file headers

**Replacement rules**: 4–8, 14–15.

**Edge case**: `build_cam_calculator.py` — "cam" in the filename refers to CAM calculator (domain term), not the brand. Do NOT rename the file.

---

### GTM Scripts: `gtm/stages/warm/*.py` (all files)
**What to change**:
- Brand name in outreach copy/templates
- Domain URLs in email/messaging templates
- Any `@capveri.com` email addresses in reply-to or from fields

**Replacement rules**: 1–8, 14–15.

---

### `gtm/CONTEXT.md`
**What to change**:
- Brand name in GTM context header and description
- Domain references

**Replacement rules**: 4–8, 14–15.

---

## Agent Config

### `.claude/skills/gtm/SKILL.md`
**What to change**:
- Brand name in skill description
- Domain references

**Replacement rules**: 4–8, 14–15.

---

### `.claude/skills/gtm/prospects/*.md`
**What to change**:
- Brand name in prospect context
- Domain references

---

### `.claude/skills/business-advisor/SKILL.md`
**What to change**:
- Brand name in business context

**Replacement rules**: 14–15.

---

## Cached Files

### `.firecrawl/` (entire directory)
**Action**: Delete all files in this directory. They are cached crawls of the old domain.
After the new domain is live and redirects are set up, re-crawl with:

```bash
# (Do this AFTER DNS cutover in Phase 8)
# Re-crawl the new domain using the firecrawl tool
```

Do NOT manually edit `.firecrawl/` files — they are auto-generated cache.

---

## Manual Actions Required (Infrastructure)

These require action outside of file edits:

| Action | Platform | Notes |
|--------|----------|-------|
| Add `capveri.com` domain to Vercel projects | Vercel Dashboard | Before DNS cutover |
| Add `api.capveri.com` custom domain to Railway | Railway Dashboard | Before DNS cutover |
| Update DNS A/CNAME records | Domain Registrar | Coordinate with Vercel/Railway |
| Create new S3 bucket `capveri-documents` | AWS Console | Migrate data from `camaudit-documents` |
| Update Resend sending domain | Resend Dashboard | Requires DNS TXT/CNAME records for `capveri.com` |
| Update Supabase Auth redirect URLs | Supabase Dashboard | Add `*.capveri.com` to allowed redirects |
| Rename GitHub Secrets if desired | GitHub Settings | Optional, coordinate with CI update |

---

## Verification

```bash
# Check no camaudit in supabase files (excluding project slug if kept)
grep -r "camaudit" supabase/ --include="*.sql" --include="*.toml"

# Check no camaudit in Docker and CI files
grep -r "camaudit" docker-compose*.yml .github/ --include="*.yml" 2>/dev/null

# Check no camaudit in scripts
grep -r "camaudit" scripts/ gtm/ tools/ --include="*.py" --include="*.ps1" --include="*.sh"

# Check no camaudit in agent config
grep -r "camaudit" .claude/ --include="*.md"
```

Expected: zero hits (excluding Supabase project slug if intentionally kept).
