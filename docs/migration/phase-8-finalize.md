# Phase 8: Finalize — Regenerate, Sweep, Verify

**Depends on**: All phases 1–7 complete
**Blocks**: Nothing (this is the last phase)
**Est. time**: 1–2 hours

## Goal

Regenerate all auto-generated files, run a full codebase sweep for any remaining
`camaudit` occurrences, run the complete test suite, and verify the application
works end-to-end under the new brand.

---

## Step 1: Regenerate Auto-Generated Files

### 1a. Design Tokens
```bash
cd frontend && npm run tokens
```
This writes two files:
- `frontend/src/generated/tokens.css`
- `backend/app/services/email/tokens.py`

Verify both files no longer contain `camaudit` (they shouldn't, since `design-tokens.json`
shouldn't have brand strings — but confirm).

### 1b. Frontend API Client (OpenAPI-generated)
If the project uses OpenAPI codegen (check `frontend/package.json` for a `generate` script):
```bash
cd frontend && npm run generate
# or
cd frontend && npm run openapi
```
The generated client in `frontend/src/api/generated/` should now reference `capveri` in
any brand strings if the OpenAPI spec title was updated in Phase 2.

### 1c. Sitemap (if dynamically generated)
If `marketing` generates a sitemap via `next-sitemap` or similar:
```bash
cd marketing && npm run build
# sitemap.xml is generated during build
```

---

## Step 2: Full Codebase Sweep

Run these sweeps to find any remaining `camaudit` occurrences missed in earlier phases:

```bash
# Sweep 1: Source files (highest priority)
grep -r "camaudit" \
  backend/app/ \
  frontend/src/ \
  marketing/src/ \
  marketing/content/ \
  --include="*.py" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.mdx"

# Sweep 2: Config files
grep -r "camaudit" \
  backend/pyproject.toml \
  frontend/package.json \
  marketing/package.json \
  frontend/vite.config.ts \
  frontend/vercel.json \
  marketing/vercel.json \
  frontend/index.html

# Sweep 3: Test files
grep -r "camaudit" \
  backend/tests/ \
  frontend/e2e/ \
  marketing/e2e/ \
  --include="*.py" --include="*.ts"

# Sweep 4: Infrastructure
grep -r "camaudit" \
  supabase/ \
  scripts/ \
  gtm/ \
  tools/ \
  .github/ \
  --include="*.sql" --include="*.toml" --include="*.py" --include="*.yml" --include="*.sh"

# Sweep 5: Docs (excluding known exceptions)
grep -r "camaudit" docs/ --include="*.md" | grep -v "Operation Sovereign Wedge"

# Sweep 6: Root files
grep -ri "camaudit" CLAUDE.md README.md AGENTS.MD .env.example
```

For each hit: apply the appropriate rule from the [global replacement rules](./README.md#global-replacement-rules-ordered-to-avoid-conflicts), then re-run the sweep.

---

## Step 3: Delete Stale Cache

```bash
# Delete firecrawl cache (will be re-crawled after DNS cutover)
rm -rf .firecrawl/
```

---

## Step 4: Run Full Test Suite

Run ALL tests, in order, sequentially:

```bash
# Backend tests
cd backend && pytest --tb=short

# Backend coverage
cd backend && pytest --cov=app --cov-fail-under=95

# Backend formatting (confirm no issues)
cd backend && python -m black app tests && python -m isort app tests --profile black && python -m ruff check app tests

# Frontend type check
cd frontend && npm run typecheck

# Frontend tests
cd frontend && npm test

# Frontend formatting
cd frontend && npm run format && npm run lint:fix

# Marketing type check
cd marketing && npm run typecheck

# Marketing formatting
cd marketing && npm run format && npm run lint:fix
```

All checks must pass before proceeding to commit.

---

## Step 5: Commit

Stage and commit all changes:

```bash
git add -A
git status  # Review staged files

git commit -m "rebrand: rename CAMAudit → CapVeri across entire codebase

- Update brand name, domains, email addresses, package names
- Update all configuration, source code, tests, docs, and infrastructure
- Preserve CAM reconciliation domain terminology unchanged
- Keep Operation Sovereign Wedge codename unchanged
- Regenerate design tokens and API client

New domains: capveri.com, app.capveri.com, api.capveri.com"
```

---

## Step 6: Push and Deploy

```bash
git push origin master
```

All three services will auto-deploy when they detect changes in their folders:
- `marketing/` → Vercel (www.capveri.com)
- `frontend/` → Vercel (app.capveri.com)
- `backend/` → Railway (api.capveri.com)

---

## Step 7: Post-Deploy Verification

After DNS cutover and deploy, verify end-to-end:

### DNS & Domain Check
```bash
# Check new domains resolve correctly
curl -I https://www.capveri.com
curl -I https://app.capveri.com
curl -I https://api.capveri.com/health

# Check old domains redirect (if 301 redirects are configured)
curl -I https://www.capveri.com     # Should → 301 www.capveri.com
curl -I https://app.capveri.com     # Should → 301 app.capveri.com
```

### App Smoke Test
```bash
# Use playwright-cli for quick E2E smoke test
playwright-cli open https://www.capveri.com --headed
playwright-cli snapshot   # Verify brand shows "CapVeri"
playwright-cli close

playwright-cli open https://app.capveri.com --headed
playwright-cli snapshot   # Verify login page shows "CapVeri"
playwright-cli close
```

### API Health Check
```bash
curl https://api.capveri.com/health
# Expected: {"status": "ok", ...}
```

### Email Test
Send a test email through the system to verify:
1. `from:` address shows `noreply@capveri.com`
2. Email body links point to `capveri.com` domains
3. Footer shows `CapVeri` brand

---

## Step 8: Manual Actions Follow-Up

Confirm all manual actions from the README were completed:

- [ ] `capveri.com` domain registered
- [ ] Vercel projects pointing to new domains
- [ ] Railway custom domain `api.capveri.com` set
- [ ] AWS S3 bucket `capveri-documents` created and data migrated
- [ ] Apple Developer portal Service ID updated to `com.capveri.auth`
- [ ] Stripe dashboard product names updated to `CapVeri *`
- [ ] Resend sending domain updated to `capveri.com`
- [ ] Supabase Auth redirect URLs updated to `*.capveri.com`
- [ ] Google Search Console and Analytics properties updated
- [ ] New sitemap submitted to search engines
- [ ] Old domain (`capveri.com`) configured with 301 redirects to `capveri.com`
- [ ] `.firecrawl/` re-crawled for new domain

---

## Rollback Plan

If a critical issue is found post-deploy:

1. Revert the git commit: `git revert HEAD`
2. Push the revert: `git push origin master`
3. All three services will redeploy to the previous version
4. DNS changes cannot be instantly reverted — keep old domain active for at least 30 days

---

## Done

When all sweeps return zero hits, all tests pass, and the smoke test shows `CapVeri`
in the UI — the rebrand is complete.
