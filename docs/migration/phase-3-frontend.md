# Phase 3: Frontend Source Code

**Depends on**: Phase 1 (config settled)
**Blocks**: Phase 4 (tests)
**Can run in parallel with**: Phases 2, 5, 6
**Est. files**: ~30
**Est. occurrences**: ~250

## Goal

Update all TypeScript/TSX source files under `frontend/src/` — API config, routing,
SEO components, layout, landing pages, resource pages, tool pages, legal pages,
and utility files. After this phase, the app frontend at `app.capveri.com` should
reference the correct brand and domains throughout.

---

## File List

### Config & API

#### `frontend/index.html`
**What to change**:
- `<title>CAMAudit</title>` → `<title>CapVeri</title>`
- `<meta name="description">` content
- Any `<meta property="og:*">` tags with old brand/domain
- Favicon `href` if it's domain-specific

**Replacement rules**: 4–8, 14–15.

---

#### `frontend/vite.config.ts`
**What to change**:
- Error message string referencing `api.capveri.com` (proxy target help text)
- Any `define` constants with old domain

**Replacement rules**: 4–8.

---

#### `frontend/src/api/url.ts`
**What to change**:
- API base URL construction referencing `api.capveri.com`
- Any environment-specific domain strings
- Fallback URLs

**Replacement rules**: 4–8.

---

#### `frontend/src/lib/domainRouting.ts`
**What to change**:
- Domain string comparisons: `app.capveri.com`, `www.capveri.com`
- Routing logic that inspects `window.location.hostname`
- Any hardcoded domain arrays or maps

**Replacement rules**: 4–8.

---

### SEO & Metadata

#### `frontend/src/components/SEO.tsx`
**What to change**:
- Default `<title>` template with brand name
- Default `og:site_name`
- Default canonical URL domain
- Default `og:url` prefix

**Replacement rules**: 4–8, 14–15.

---

### Layout Components

#### `frontend/src/components/layout/Header.tsx` (or equivalent)
**What to change**:
- Logo alt text: `CAMAudit` → `CapVeri`
- Brand name in any text nodes
- Link `href` values pointing to `www.capveri.com`

**Replacement rules**: 4–8, 14–15.

---

#### `frontend/src/components/layout/Footer.tsx` (or equivalent)
**What to change**:
- Brand name in copyright notice: `© 2025 CAMAudit` → `© 2025 CapVeri`
- Footer links to `www.capveri.com`
- Support/contact email addresses
- Social media links if branded with old name

**Replacement rules**: 1–8, 14–15.

---

#### `frontend/src/components/layout/Sidebar.tsx` (or equivalent)
**What to change**:
- Brand name or logo alt text
- Any help/support links

**Replacement rules**: 14–15.

---

### Landing / Marketing Components (within frontend)

#### `frontend/src/components/landing/*.tsx` (all files)
**What to change**:
- All brand name occurrences in headings, body copy, CTAs
- Domain URLs in CTA buttons or links
- Email addresses in contact sections

**Replacement rules**: 1–8, 14–15.

**Edge case**: These components may contain CAM terminology in a financial context
(e.g., "CAM reconciliation"). Do NOT change those — only change `CAMAudit` brand references.

---

### Feature Modules

#### `frontend/src/features/onboarding/*.tsx` (all files)
**What to change**:
- Brand name in welcome steps, step descriptions
- App URL in any redirect logic
- Support email in help text

**Replacement rules**: 1–8, 14–15.

---

#### `frontend/src/features/plg/*.tsx` (all files)
**What to change**:
- Brand name in paywall copy, upgrade prompts
- Domain URLs in upgrade CTAs

**Replacement rules**: 4–8, 14–15.

---

#### `frontend/src/features/reconciliation/*.tsx` (all files)
**What to change**:
- Brand name in feature copy (but leave "CAM reconciliation" as-is)
- Any support/help URLs

**Replacement rules**: 14–15. Skip any "CAM" that is CAM-the-concept.

---

### Pages

#### `frontend/src/pages/DashboardPage.tsx`
**What to change**:
- Brand name in dashboard copy or empty state messages
- Any support links

**Replacement rules**: 14–15.

---

#### `frontend/src/pages/vs/*.tsx` (all competitor comparison pages)
**What to change**:
- Brand name throughout: headings, body copy, comparison tables
- Domain URLs in CTAs
- Email/contact links

**Replacement rules**: 1–8, 14–15.

**Edge case**: "CAM" in comparison copy may refer to CAM reconciliation features being compared — leave those alone.

---

#### `frontend/src/pages/resources/*.tsx` (all resource pages, ~12 files)
**What to change**:
- Brand name in page titles, headings, body copy
- Domain URLs in resource CTAs or download links
- Email in resource contact sections

**Replacement rules**: 1–8, 14–15.

**Edge case**: Resource pages heavily use "CAM" as a concept. Only change `CAMAudit` brand occurrences.

---

#### `frontend/src/pages/tools/*.tsx` (all tool pages, ~7 files)
**What to change**:
- Brand name in tool descriptions and headings
- Domain URLs in tool CTAs or share links
- Email in tool result sharing

**Replacement rules**: 1–8, 14–15.

**Edge case**: CAM calculator tool pages use "CAM" extensively as domain terminology. Only change brand references.

---

#### `frontend/src/pages/legal/*.tsx` (Terms, Privacy, Cookie)
**What to change**:
- Company name: `CAMAudit` → `CapVeri`
- Domain in legal text: `capveri.com` → `capveri.com`
- Contact/legal email addresses
- Effective dates — do NOT change; those are content decisions

**Replacement rules**: 1–8, 14–15.

---

#### `frontend/src/pages/company/*.tsx` (About, Contact, etc.)
**What to change**:
- Brand name in About copy
- Contact email addresses
- Domain in any self-referential links

**Replacement rules**: 1–8, 14–15.

---

### Remaining Source Scan

After updating the above, run a sweep to catch any remaining files:

```bash
grep -r "camaudit" frontend/src/ --include="*.ts" --include="*.tsx" -l
```

Update any files returned that were not already covered above.

---

## Edge Cases

1. **Generated API client** (`frontend/src/api/generated/`): This directory is auto-generated from the backend OpenAPI spec. Do NOT manually edit these files — they will be regenerated in Phase 8. If the OpenAPI spec title contains `CAMAudit`, fix it in `backend/app/main.py` (Phase 2), then regenerate.

2. **Design tokens** (`frontend/src/generated/tokens.css`): Auto-generated from `design-tokens.json`. Do not manually edit — regenerate in Phase 8 via `cd frontend && npm run tokens`.

3. **CAM terminology**: The word "CAM" appears hundreds of times in the frontend as a financial concept. The safe rule: only replace strings matching `CAMAudit`, `camaudit`, or a domain URL. Never do `s/CAM /CapVeri /g`.

4. **Logo/icon assets**: If logo SVG or PNG files reference the old brand in their `alt` attributes or filenames, update alt text in code. Actual image files will be replaced separately (design task).

---

## Verification

```bash
# Check no camaudit remains in frontend source
grep -r "camaudit" frontend/src/ frontend/index.html frontend/vite.config.ts --include="*.ts" --include="*.tsx" --include="*.html" --include="*.css"

# Run frontend type check
cd frontend && npm run typecheck

# Run frontend tests
cd frontend && npm test

# Run formatting and lint
cd frontend && npm run format && npm run lint:fix
```

Expected: zero `camaudit` hits in source; type check clean; all tests green.
