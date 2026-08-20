# Security Checklist

Pre-launch security verification checklist for CapVeri.

## Authentication Security

### JWT Configuration
- [ ] JWT expiration set appropriately (default: 1 hour)
- [ ] Refresh tokens enabled
- [ ] Secure cookie settings in production

### Password Requirements
- [ ] Minimum 8 characters enforced
- [ ] Email confirmation enabled
- [ ] Password reset flow works

### Rate Limiting
- [ ] Login rate limiting active (5 attempts / 15 min)
- [ ] API rate limiting configured
- [ ] Verify with failed login attempts

```bash
# Test rate limiting (should block after 5 failures)
for i in {1..6}; do
  curl -X POST https://api.capveri.com/api/v1/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}' \
    -H "Content-Type: application/json"
done
```

### OAuth Providers
- [ ] Google OAuth configured correctly
- [ ] Google Sign In configured correctly
- [ ] Redirect URLs match production domains

## Authorization Security

### Row Level Security (RLS)
- [ ] All tables have RLS enabled
- [ ] Cross-tenant access blocked
- [ ] Admin-only operations restricted
- [ ] See [RLS Verification Guide](./02-supabase-rls-verification.md)

### Role-Based Access Control
- [ ] Owner, Admin, Member, Viewer roles defined
- [ ] Permission matrix documented
- [ ] Role checks in API endpoints

### Immutability
- [ ] Finalized snapshots cannot be modified
- [ ] Audit log entries are append-only

## Data Protection

### Encryption at Rest
- [ ] Supabase PostgreSQL encrypted (automatic)
- [ ] S3 bucket encryption enabled (SSE-S3)
- [ ] No sensitive data in logs

### Encryption in Transit
- [ ] HTTPS enforced on frontend
- [ ] HTTPS enforced on backend
- [ ] HTTPS for all API calls

### Data Handling
- [ ] PII identified and protected
- [ ] No sensitive data in URLs
- [ ] Secure error messages (no stack traces to users)

## API Security

### Security Headers
Verify these headers are present:

```bash
curl -I https://api.capveri.com/health
```

- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 1; mode=block`
- [ ] `Strict-Transport-Security: max-age=31536000`

### Input Validation
- [ ] All inputs validated via Pydantic
- [ ] File uploads validated (type, size)
- [ ] SQL injection prevented (parameterized queries)

### CORS Configuration
- [ ] Only production domains allowed
- [ ] No wildcard origins in production
- [ ] Credentials properly handled

## External Services

### API Keys
- [ ] All API keys rotated from development
- [ ] Keys stored in environment variables
- [ ] No keys in source code

### Zero Data Retention
- [ ] Anthropic API usage reviewed
- [ ] ZDR considered if needed for compliance

### Webhook Security
- [ ] Stripe webhook signature verified
- [ ] Webhook endpoints not publicly discoverable
- [ ] Replay attacks prevented

## Infrastructure Security

### Environment Variables
- [ ] No secrets in source code
- [ ] Production secrets different from dev
- [ ] Service role key not exposed

### Network Security
- [ ] Database not publicly accessible
- [ ] S3 bucket not public
- [ ] Storage buckets have RLS

### Logging
- [ ] Sensitive data not logged
- [ ] Correlation IDs enabled
- [ ] Log retention configured

## Verification Commands

### Test RLS

```sql
-- In Supabase SQL Editor, verify cross-tenant blocked
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'user-from-org-a';
SELECT * FROM properties WHERE organization_id = 'org-b-uuid';
-- Should return 0 rows
```

### Test Security Headers

```bash
curl -I https://api.capveri.com/api/v1/properties | grep -E "X-|Strict"
```

### Test Rate Limiting

```bash
# Should get 429 after multiple failures
curl -X POST https://api.capveri.com/api/v1/auth/login \
  -d '{"email":"test@test.com","password":"wrong"}' \
  -H "Content-Type: application/json" \
  -w "%{http_code}"
```

### Test CORS

```bash
curl -X OPTIONS https://api.capveri.com/api/v1/properties \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: GET" \
  -I
# Should NOT return Access-Control-Allow-Origin
```

## Compliance Considerations

### Data Privacy
- [ ] Privacy policy published
- [ ] Cookie consent implemented (if applicable)
- [ ] Data deletion process documented

### Audit Trail
- [ ] All changes logged
- [ ] Logs retained appropriately
- [ ] Access to logs restricted

## Next Steps

After completing this checklist:
1. [RLS Verification](./02-supabase-rls-verification.md) - Detailed RLS testing
2. [Secrets Management](./03-secrets-management.md) - Key rotation
3. [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md) - Final verification
