# Story 24.12: Performance, Security & Compliance Audit

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 5 hours
**Status**: `pending`
**Dependencies**: All epics (0-23)

---

## User Story

As a **platform administrator**,
I want to **verify that the platform meets performance benchmarks and has no security vulnerabilities**,
So that **the application is production-ready and compliant with security best practices**.

---

## Acceptance Criteria

### Performance Benchmarks
- [ ] Home page loads in <2 seconds
- [ ] Reconciliation grid renders 10,000 rows in <3 seconds
- [ ] Calculate reconciliation (1,000 GL entries, 10 tenants) completes in <5 seconds
- [ ] File upload (5MB CSV) processes in <5 seconds
- [ ] Database queries have appropriate indexes (no table scans)
- [ ] API response times are <500ms for 95th percentile
- [ ] Frontend bundle size is <500KB (gzipped)

### Security Audit
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] No CSRF vulnerabilities
- [ ] RLS policies prevent all cross-tenant access
- [ ] Secrets are not committed to git
- [ ] API endpoints require authentication
- [ ] Passwords are hashed with bcrypt
- [ ] JWT tokens expire after 1 hour
- [ ] Refresh tokens expire after 30 days
- [ ] HTTPS is enforced
- [ ] CORS headers are correctly configured

### Code Quality
- [ ] Test coverage is ≥95% (backend and frontend)
- [ ] No TODO, FIXME, or NotImplementedError in production code
- [ ] All linters pass with 0 errors
- [ ] All type checkers pass with 0 errors
- [ ] No console.log statements in production code

### Compliance
- [ ] Financial calculations are deterministic (audit trail exists)
- [ ] Finalized snapshots are immutable
- [ ] Audit log captures all data changes
- [ ] Zero Data Retention (ZDR) configured for LLM API

---

## Technical Specifications

### Performance Tests

```bash
# Backend performance
cd backend
pytest backend/tests/test_performance.py -v

# Expected results:
# - Reconciliation calculation (1000 entries, 10 tenants): <5s
# - GL entry batch insert (5000 rows): <2s
# - Database query with index: <100ms
```

```typescript
// Frontend performance
// frontend/tests/performance.test.ts
import { test, expect } from '@playwright/test';

test('Frontend performance benchmarks', async ({ page }) => {
  // Test home page load time
  const homeStart = Date.now();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const homeDuration = Date.now() - homeStart;
  expect(homeDuration).toBeLessThan(2000); // <2s

  // Test reconciliation grid render time
  await page.goto('/reconciliation/large-dataset');
  const gridStart = Date.now();
  await expect(page.locator('.reconciliation-grid')).toBeVisible();
  const gridDuration = Date.now() - gridStart;
  expect(gridDuration).toBeLessThan(3000); // <3s

  // Test API response time
  const apiStart = Date.now();
  const response = await page.request.get('/api/v1/properties');
  const apiDuration = Date.now() - apiStart;
  expect(apiDuration).toBeLessThan(500); // <500ms
});
```

### Security Audit

```bash
# SQL Injection Test
# Try to inject SQL via API endpoints
curl -X POST http://localhost:8000/api/v1/properties \
  -H "Content-Type: application/json" \
  -d '{"name": "Test'; DROP TABLE properties;--", "address": "123 Main St"}'

# Should return validation error, not execute SQL

# XSS Test
# Try to inject script via form inputs
curl -X POST http://localhost:8000/api/v1/properties \
  -H "Content-Type: application/json" \
  -d '{"name": "<script>alert('XSS')</script>", "address": "123 Main St"}'

# Should escape or sanitize input

# Check for secrets in git
cd backend
git log -p | grep -i "password\|secret\|api_key\|token" | head -20
# Should find nothing

# Check HTTPS enforcement
curl http://localhost:8000/api/v1/properties
# Should redirect to HTTPS
```

```python
# backend/tests/test_security_audit.py
import pytest
from httpx import AsyncClient
from app.main import app

async def test_sql_injection_prevention():
    """Verify SQL injection is prevented."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/properties",
            headers=auth_headers,
            json={"name": "Test'; DROP TABLE properties;--", "address": "123 Main St"}
        )
        # Should return validation error or sanitize input
        assert response.status_code in [400, 422]

async def test_xss_prevention():
    """Verify XSS is prevented."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/properties",
            headers=auth_headers,
            json={"name": "<script>alert('XSS')</script>", "address": "123 Main St"}
        )
        # Should escape or sanitize input
        if response.status_code == 200:
            data = response.json()
            assert "<script>" not in data["data"]["name"]
            assert "&lt;script&gt;" in data["data"]["name"] or "script" not in data["data"]["name"]

async def test_authentication_required():
    """Verify all protected endpoints require authentication."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        endpoints = [
            "/api/v1/properties",
            "/api/v1/leases",
            "/api/v1/reconciliation/calculate",
            "/api/v1/billing/subscriptions",
        ]

        for endpoint in endpoints:
            response = await client.get(endpoint)
            assert response.status_code == 401, f"{endpoint} did not require authentication"

async def test_rls_prevents_cross_tenant_access():
    """Verify RLS blocks all cross-tenant access attempts."""
    # ... (covered in Story 24.2)
```

### Lighthouse Audit

```bash
# Run Lighthouse on production build
npm run build
npx serve -s build

# Run audit
npx lighthouse http://localhost:3000 --view

# Expected scores:
# - Performance: >90
# - Accessibility: >95
# - Best Practices: >90
# - SEO: >90
```

### Bundle Size Analysis

```bash
# Analyze frontend bundle size
cd frontend
npm run build

# Should see output like:
# dist/assets/index-abc123.js  234.5 KB  (gzipped: 78.2 KB)
# dist/assets/vendor-def456.js 421.3 KB  (gzipped: 142.6 KB)

# Total gzipped should be <500KB
```

### Code Coverage Report

```bash
# Backend coverage
cd backend
pytest --cov=app --cov-report=html --cov-fail-under=95

# Should pass with ≥95% coverage

# Frontend coverage
cd frontend
npm run test:coverage

# Should show ≥95% coverage
```

### Audit Log Verification

```sql
-- Verify audit log captures changes
SELECT * FROM audit_log
WHERE table_name = 'reconciliation_snapshots'
  AND operation = 'UPDATE'
ORDER BY timestamp DESC
LIMIT 10;

-- Should show all updates to finalized snapshots (should be 0 if immutability works)
```

### Immutability Test

```python
# backend/tests/test_immutability.py
import pytest
from app.core.database import get_supabase_client

async def test_finalized_snapshot_is_immutable():
    """Verify finalized snapshots cannot be modified."""
    client = get_supabase_client()

    # Create and finalize snapshot
    snapshot = await client.table("reconciliation_snapshots").insert({
        "property_id": "test_property",
        "period_start": "2024-01-01",
        "period_end": "2024-12-31",
        "is_finalized": True,
        "total_recoverable": 100000
    }).execute()

    snapshot_id = snapshot.data[0]["id"]

    # Try to update finalized snapshot
    with pytest.raises(Exception):  # Should raise PermissionError or similar
        await client.table("reconciliation_snapshots").update({
            "total_recoverable": 999999
        }).eq("id", snapshot_id).execute()
```

---

## Tools to Use

### Performance Tools
- **pytest-benchmark**: Backend performance testing
- **Lighthouse**: Frontend performance auditing
- **Chrome DevTools**: Network and performance profiling
- **webpack-bundle-analyzer**: Bundle size analysis

### Security Tools
- **Bandit**: Python security linter
- **ESLint Security Plugin**: TypeScript security linter
- **OWASP ZAP**: Security vulnerability scanner
- **Supabase RLS Tester**: Row-level security testing

### Code Quality Tools
- **pytest --cov**: Python test coverage
- **Vitest coverage**: TypeScript test coverage
- **mypy**: Python type checking
- **TypeScript**: Frontend type checking

---

## Definition of Done

- [ ] All performance benchmarks pass
- [ ] Security audit finds 0 critical vulnerabilities
- [ ] Test coverage is ≥95% (backend and frontend)
- [ ] Lighthouse scores: Performance >90, Accessibility >95
- [ ] Bundle size <500KB gzipped
- [ ] No secrets in git history
- [ ] RLS prevents all cross-tenant access
- [ ] Finalized snapshots are immutable
- [ ] Audit log captures all data changes
- [ ] Any performance or security issues are fixed

---

## Notes

- This story should be run **last** in Epic 24
- Security audit should be run by **experienced security engineer**
- Performance benchmarks should be run on **production-like infrastructure**
- Document any optimization opportunities
- Create GitHub issues for non-critical findings

---

*Created: 2025-12-30*
*Status: pending*
