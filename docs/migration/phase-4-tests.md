# Phase 4: Test Files

**Depends on**: Phases 2 and 3 (source code settled)
**Blocks**: Phase 8 (finalize)
**Can run in parallel with**: Phase 7
**Est. files**: ~42
**Est. occurrences**: ~150

## Goal

Update all test fixtures, mock data, seed scripts, and E2E test files so that
email addresses, domain URLs, and brand strings in test data match the new brand.
Tests must continue to pass — this is a string replacement, not a logic change.

---

## Critical Rule: Test Emails

The most common pattern across all test files is email addresses used as fake user identifiers:

```python
# OLD
user = {"email": "landlord@capveri.com", "role": "admin"}
# NEW
user = {"email": "landlord@capveri.com", "role": "admin"}
```

Apply global rule #8 (`@capveri.com` → `@capveri.com`) across all test files.

> **Do NOT** change CAM-concept strings. Only change `camaudit` brand strings and `@capveri.com` email domains.

---

## Backend Test Files

### `backend/tests/conftest.py` (main conftest)
**What to change**:
- Fixture email addresses using `@capveri.com`
- Any `APP_URL` or domain constants used in fixtures
- Organization or tenant fixtures with brand name

**Replacement rules**: 1–3, 8, 4–8, 14–15.

---

### `backend/tests/conftest_e2e.py`
**What to change**:
- E2E test user email addresses
- Any base URL fixtures pointing to `app.capveri.com` or `api.capveri.com`
- Organization fixture names

**Replacement rules**: 1–8.

---

### `backend/tests/seed_e2e_data.py`
**What to change**:
- Seed user email addresses
- Organization names containing brand
- Any portal URL strings in seed data

**Replacement rules**: 1–8, 14–15.

---

### `backend/tests/create_test_auth_user.py`
**What to change**:
- Test user email address
- Brand name in user metadata

**Replacement rules**: 1–3, 8.

---

### `backend/tests/unit/services/test_admin_notifications.py`
**What to change**:
- Mock email recipient addresses (`@capveri.com`)
- Expected email subject strings with brand name
- Expected `from` addresses

**Replacement rules**: 1–8, 14–15.

---

### `backend/tests/unit/billing/test_webhooks_subscription_created.py`
**What to change**:
- Mock webhook payload user emails
- Expected notification email addresses in assertions
- Brand name in Stripe metadata fixtures

**Replacement rules**: 1–8, 14–15.

---

### `backend/tests/services/email/test_resend_service.py`
**What to change**:
- Mock `from` address assertions: `noreply@capveri.com` → `noreply@capveri.com`
- Mock recipient addresses in test data
- Expected domain in email footers if tested

**Replacement rules**: 1–8.

---

### `backend/tests/services/email/test_email_renderer.py`
**What to change**:
- Expected rendered content containing old domain URLs
- Brand name in expected rendered strings
- Support email in expected footer content

**Replacement rules**: 1–8, 14–15.

---

### `backend/tests/api/v1/test_auth.py` (and other test_*.py files)
**What to change**:
- Fixture email addresses throughout
- Expected redirect URL assertions
- Expected response body strings with brand

**Replacement rules**: 1–8.

---

### `backend/tests/api/v1/` — Full Sweep

Run this grep and update every file returned:

```bash
grep -r "camaudit" backend/tests/ --include="*.py" -l
```

For each file: apply global rules 1–8 and 14–15. The vast majority of changes will be
email address fixtures.

---

### `backend/tests/integration/test_extraction_queue_e2e.py`
**What to change**:
- Test organization and user fixtures
- Portal URL in any callback assertions

**Replacement rules**: 4–8, 1–3.

---

## Frontend E2E Tests

### `frontend/e2e/*.spec.ts` (all Playwright E2E tests)
**What to change**:
- Test user email addresses: `@capveri.com` → `@capveri.com`
- Base URL constants: `app.capveri.com` → `app.capveri.com`
- Any `page.goto()` calls with hardcoded old domain
- Screenshot or snapshot comparison strings (if they contain domain)

**Replacement rules**: 1–8.

---

## Marketing E2E Tests

### `marketing/e2e/*.spec.ts` (all Playwright E2E tests)
**What to change**:
- Base URL constants: `www.capveri.com` → `www.capveri.com`
- Test assertions for page title or meta content containing brand
- Link `href` assertions with old domain

**Replacement rules**: 4–8, 14–15.

---

## Playwright Config

### `frontend/playwright.config.ts` (if exists)
**What to change**:
- `baseURL`: `https://app.capveri.com` → `https://app.capveri.com`
- Any test project names with brand

### `marketing/playwright.config.ts` (if exists)
**What to change**:
- `baseURL`: `https://www.capveri.com` → `https://www.capveri.com`

---

## Edge Cases

1. **Snapshot tests**: If any frontend tests use `toMatchSnapshot()` with rendered HTML containing the old domain, the snapshots will need to be updated. Run tests with `--update-snapshots` after making the string replacements.

2. **Recorded HAR files**: If E2E tests use HAR recordings with old domain requests, these need to be re-recorded after DNS cutover.

3. **Test database seeds**: `supabase/seeds/*.sql` files are covered in Phase 6. If backend tests directly import or reference those seeds, ensure Phase 6 completes before running Phase 4 verification.

4. **CI environment variables**: If test workflows (`backend/tests/conftest.py`) read env vars that contain old domains, ensure the CI/CD environment variables are updated in parallel (manual action in GitHub Actions / Railway).

---

## Verification

```bash
# Check no camaudit remains in test files
grep -r "camaudit" backend/tests/ frontend/e2e/ marketing/e2e/ --include="*.py" --include="*.ts"

# Run all backend tests
cd backend && pytest --tb=short

# Run backend coverage
cd backend && pytest --cov=app --cov-fail-under=95

# Run frontend tests
cd frontend && npm test

# Optional: update snapshots if needed
cd frontend && npm test -- --update-snapshots
```

Expected: zero `camaudit` hits in test files; all tests pass; coverage ≥ 95%.
