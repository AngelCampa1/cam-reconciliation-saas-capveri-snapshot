# Pre-Launch Checklist

Final verification checklist before launching CapVeri to production.

## Infrastructure

### External Services

- [ ] **AWS**
  - [ ] S3 bucket created and configured
  - [ ] document reader permissions verified
  - [ ] IAM user with least privilege
  - [ ] Credentials saved securely

- [ ] **Anthropic**
  - [ ] API key created
  - [ ] Model access verified
  - [ ] Billing set up

- [ ] **Stripe**
  - [ ] Products and prices created
  - [ ] Webhook endpoint configured
  - [ ] Webhook secret saved
  - [ ] Test transaction successful

- [ ] **Resend**
  - [ ] Domain verified (SPF, DKIM)
  - [ ] API key created
  - [ ] Test email sent successfully

### Platform Deployment

- [ ] **Supabase**
  - [ ] Project created
  - [ ] All migrations applied
  - [ ] RLS enabled on all tables
  - [ ] OAuth providers configured
  - [ ] Storage buckets created

- [ ] **Railway (Backend)**
  - [ ] Service deployed
  - [ ] All environment variables set
  - [ ] Health check passing
  - [ ] Custom domain configured

- [ ] **Vercel (Frontend)**
  - [ ] Project deployed
  - [ ] Environment variables set
  - [ ] Custom domain configured
  - [ ] Build successful

### Domains & SSL

- [ ] DNS records configured
  - [ ] `app.capveri.com` → Vercel
  - [ ] `api.capveri.com` → Railway
  - [ ] Email records (SPF, DKIM, DMARC)

- [ ] SSL certificates active
  - [ ] Frontend HTTPS working
  - [ ] Backend HTTPS working
  - [ ] No mixed content warnings

## Security

### Authentication

- [ ] Email/password login works
- [ ] Google OAuth works
- [ ] Google Sign In works
- [ ] Password reset works
- [ ] Rate limiting active (5 attempts/15 min)

### Authorization

- [ ] RLS policies verified
  - [ ] Cross-tenant access blocked
  - [ ] Admin operations restricted
  - [ ] Finalized snapshots immutable
- [ ] Role-based access works

### Configuration

- [ ] All API keys rotated from development
- [ ] Service role key not exposed
- [ ] Debug mode disabled
- [ ] Secure headers present
- [ ] CORS configured for production only

## Monitoring

### Uptime

- [ ] UptimeRobot/Better Uptime configured
  - [ ] Backend health monitor
  - [ ] Frontend monitor
  - [ ] Alert channels set up

### Logging

- [ ] JSON log format enabled
- [ ] Log level set to INFO
- [ ] Correlation IDs working

### Error Tracking

- [ ] Sentry configured (optional)
- [ ] Error alerts set up

## Operations

### Backup

- [ ] Backup strategy defined
- [ ] First backup created
- [ ] Restore tested

### Runbooks

- [ ] Common issues documented
- [ ] Incident response documented
- [ ] Escalation contacts documented

### Monitoring

- [ ] Database metrics reviewed
- [ ] Connection pooling enabled
- [ ] Performance baseline established

## Application

### Core Features

- [ ] User registration works
- [ ] Organization creation works
- [ ] Property CRUD works
- [ ] Lease CRUD works
- [ ] Document upload works
- [ ] OCR extraction works
- [ ] AI extraction works
- [ ] Reconciliation calculation works
- [ ] Snapshot finalization works

### Billing

- [ ] Checkout flow works
- [ ] Subscription updates
- [ ] Billing portal accessible
- [ ] Webhooks receiving events

### Email

- [ ] Tenant invitations send
- [ ] Statement notifications send
- [ ] Dispute updates send

## Testing

### End-to-End

- [ ] Complete user journey tested
  1. Sign up
  2. Create organization
  3. Create property
  4. Upload lease document
  5. Verify extraction
  6. Run reconciliation
  7. Finalize snapshot

### Cross-Browser

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### Mobile

- [ ] Responsive design works
- [ ] Touch interactions work

## Documentation

### User-Facing

- [ ] Privacy policy published
- [ ] Terms of service published

### Internal

- [ ] All guides completed
- [ ] Emergency contacts documented
- [ ] Runbooks accessible to team

## Final Checks

### 24 Hours Before

- [ ] Run full test suite
- [ ] Check all service dashboards
- [ ] Verify backup exists
- [ ] Notify team of launch time
- [ ] Prepare announcement

### 2 Hours Before

- [ ] Check all services healthy
- [ ] Open monitoring dashboards
- [ ] Have rollback plan ready
- [ ] Team available

### Go/No-Go Decision

| Criteria | Status |
|----------|--------|
| All infrastructure ✓ | |
| Security verified ✓ | |
| Monitoring active ✓ | |
| Core features work ✓ | |
| Team ready ✓ | |

**Decision**: [ ] GO / [ ] NO-GO

**Signed off by**: _________________ **Date**: _________

## Next Steps

If GO:
- [Launch Day Runbook](./01-launch-day-runbook.md)

If NO-GO:
- Document blockers
- Set new launch date
- Address issues
