# Phase 1: Runtime-Critical Config

**Depends on**: Nothing (start here)
**Blocks**: All other phases
**Est. files**: ~10
**Est. occurrences**: ~40

## Goal

Update all root-level and project-level configuration files that control runtime behavior:
environment variables, package names, Docker config, Apple/Stripe identifiers.
These must be done first because every other phase assumes the canonical new brand strings.

---

## File List

### 1. `.env.example` (root)
**What to change**:
- `APPLE_SERVICE_ID=com.camaudit.auth` → `com.capveri.auth`
- Any `capveri.com` domain URLs in callback/redirect configs
- Any `camaudit-documents` bucket reference

**Replacement rules**: Apply global rules 4–13 from README.

---

### 2. `backend/.env.example`
**What to change**:
- `ADMIN_NOTIFICATION_EMAIL=angel.campa@capveri.com` → `angel.campa@capveri.com`
- Any `ALLOWED_ORIGINS` or `CORS_ORIGINS` containing `capveri.com`
- `AWS_TEXTRACT_BUCKET=camaudit-documents` → `capveri-documents`
- Any `RESEND_FROM_EMAIL=noreply@capveri.com` → `noreply@capveri.com`
- Any Stripe webhook endpoint URLs containing `api.capveri.com`
- Any Sentry DSN or other service configs referencing the brand

**Replacement rules**: Apply global rules 1–13 from README.

**Edge cases**:
- `camaudit-documents` is the S3 bucket name — file edit is fine, but actual AWS bucket migration is a manual action (see README).

---

### 3. `backend/pyproject.toml`
**What to change**:
- `name = "camaudit-backend"` → `name = "capveri-backend"`
- `description = "CapVeri Backend API"` → `description = "CapVeri Backend API"`
- Any `url` or `homepage` fields pointing to `capveri.com`

**Replacement rules**: 10, 14, 15, 8.

---

### 4. `frontend/package.json`
**What to change**:
- `"name": "camaudit-frontend"` → `"name": "capveri-frontend"`
- Any `homepage` field
- Any repository URL containing `camaudit`

**Replacement rules**: 9.

---

### 5. `marketing/package.json`
**What to change**:
- `"name": "camaudit-marketing"` → `"name": "capveri-marketing"`
- Any `homepage` field

**Replacement rules**: 11.

---

### 6. `frontend/vercel.json`
**What to change**:
- All `capveri.com` domain references in headers, rewrites, redirects
- Environment variable references to old domains

**Replacement rules**: Apply global rules 4–8 from README.

---

### 7. `marketing/vercel.json`
**What to change**:
- All routing rules: `www.capveri.com` → `www.capveri.com`
- Redirects from bare `capveri.com` → `capveri.com`
- Redirect rules sending marketing paths to `app.capveri.com` → `app.capveri.com`
- All `destination` fields with old domains

**Note**: This file has 20+ domain references — be thorough.

**Replacement rules**: Apply global rules 4–8 from README.

---

### 8. `CLAUDE.md` (root)
**What to change**:
- Header: `CapVeri - CLAUDE.md` → `CapVeri - CLAUDE.md`
- Project overview text: `CapVeri` → `CapVeri`
- Any domain URLs in Quick Reference or examples

**Do NOT change**:
- `Operation Sovereign Wedge` codename — keep as-is
- "CAM" as Common Area Maintenance references in examples

**Replacement rules**: 14, 15, 4–8.

---

### 9. `AGENTS.MD` (root, if exists)
**What to change**:
- Brand name in project overview
- Any domain references

**Do NOT change**:
- `Operation Sovereign Wedge` codename

---

### 10. `README.md` (root)
**What to change**:
- Title: `# CapVeri` → `# CapVeri`
- Project description with brand name
- Architecture section domain references
- Any badges or links with old domain

**Replacement rules**: 14, 15, 4–8.

---

## Edge Cases

- **Apple Service ID** (`com.camaudit.auth`): File edit is safe; Apple Developer portal update is a separate manual action.
- **Vercel project names** are set in Vercel dashboard — the `vercel.json` files contain only routing rules, not the project name itself.
- The `backend/.env.example` is a template — actual secrets live in Railway/environment. File edit updates the template; real env vars must be updated in Railway dashboard separately.

---

## Verification

After completing this phase, run:

```bash
# Confirm no camaudit refs remain in config files
grep -ri "camaudit" \
  .env.example \
  backend/.env.example \
  backend/pyproject.toml \
  frontend/package.json \
  marketing/package.json \
  frontend/vercel.json \
  marketing/vercel.json \
  CLAUDE.md \
  README.md

# Confirm new brand appears correctly
grep -ri "capveri" frontend/package.json marketing/package.json backend/pyproject.toml
```

Expected: zero hits for `camaudit`, correct hits for `capveri`.

No tests to run for this phase (config files only). Move to Phase 2.
