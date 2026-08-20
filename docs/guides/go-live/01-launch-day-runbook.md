# Launch Day Runbook

Step-by-step guide for launch day execution.

## Pre-Launch (T-2 Hours)

### Team Preparation

- [ ] All team members available
- [ ] Communication channel open (Slack/Discord)
- [ ] Screen sharing ready for collaboration
- [ ] Coffee/snacks ready (it's going to be exciting!)

### System Checks

```bash
# Backend health
curl https://api.capveri.com/health

# Frontend loads
curl -I https://app.capveri.com

# Extraction services
curl https://api.capveri.com/api/v1/extraction/health
```

### Dashboard Setup

Open these in browser tabs:
- [ ] Railway dashboard (backend logs)
- [ ] Vercel dashboard (frontend)
- [ ] Supabase dashboard (database)
- [ ] UptimeRobot/monitoring
- [ ] Stripe dashboard (payments)

### Backup Verification

```bash
# Verify recent backup exists
# Supabase Dashboard > Database > Backups
```

## Launch (T-0)

### DNS Verification

```bash
# Verify DNS is resolving correctly
dig app.capveri.com
dig api.capveri.com

# Expected: Points to Vercel/Railway
```

### SSL Verification

```bash
# Check SSL certificates
curl -vI https://app.capveri.com 2>&1 | grep "SSL\|expire"
curl -vI https://api.capveri.com 2>&1 | grep "SSL\|expire"
```

### First User Test

1. Open `https://app.capveri.com` in incognito
2. Sign up with new account
3. Verify email (check Supabase Auth logs)
4. Complete onboarding
5. Create test property
6. Verify all features work

### Enable Traffic

If using staged rollout:
1. Start with team accounts
2. Then beta users
3. Then public launch

### Announce Launch

- [ ] Update status page to "Operational"
- [ ] Send announcement email
- [ ] Post on social media (if applicable)
- [ ] Update website/landing page

## Post-Launch Monitoring (T+0 to T+4 Hours)

### First Hour

Every 15 minutes:
- [ ] Check error rates in logs
- [ ] Monitor response times
- [ ] Check uptime alerts
- [ ] Review new user signups

### First 4 Hours

Every hour:
- [ ] Check database metrics
  - Connection count
  - Query performance
- [ ] Check external service health
  - document reader
  - Anthropic
  - Stripe webhooks
- [ ] Review user feedback channels
- [ ] Check billing/payments working

### Key Metrics to Watch

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Error rate | < 0.1% | 0.1-1% | > 1% |
| Response time | < 500ms | 500ms-2s | > 2s |
| DB connections | < 30 | 30-48 | > 48 |
| Memory usage | < 70% | 70-85% | > 85% |

## Issue Response

### If Issues Arise

1. **Don't panic** - You have a rollback plan
2. **Assess severity** - P1/P2/P3/P4
3. **Communicate** - Update team, status page
4. **Fix or rollback** - Based on severity

### Rollback Procedure

**Backend (Railway)**:
1. Go to Deployments
2. Find last stable deployment
3. Click "Redeploy"

**Frontend (Vercel)**:
1. Go to Deployments
2. Find last stable deployment
3. Click "Promote to Production"

**Database**:
- Only if critical data issue
- Restore from backup (see backup guide)

### Communication Templates

**Status Page - Investigating**:
```
We are aware of issues affecting [service].
Our team is actively investigating.
Updates will be posted here.
```

**Status Page - Resolved**:
```
The issue has been resolved.
All services are operating normally.
We apologize for any inconvenience.
```

**User Email (Major Issue)**:
```
Subject: Service Update

We experienced an issue with [feature] today.
The issue has been resolved as of [time].

[Brief explanation]

We apologize for any inconvenience.
Please contact support if you have questions.
```

## End of Launch Day

### Success Criteria

- [ ] Zero critical errors
- [ ] Response time < 2s
- [ ] All core features functional
- [ ] At least one successful end-to-end transaction
- [ ] Billing webhook received

### Documentation

- [ ] Document any issues encountered
- [ ] Note configuration changes made
- [ ] Update runbooks if needed

### Handoff

If continuing monitoring:
1. Brief next person on status
2. Share any ongoing concerns
3. Hand over monitoring tools access

### Celebration!

If successful:
- [ ] Congratulate team
- [ ] Take a screenshot for posterity
- [ ] Plan post-launch improvements

## Day 2+ Monitoring

### Daily Checks (First Week)

- [ ] Review error logs
- [ ] Check user signups
- [ ] Monitor database growth
- [ ] Review support requests
- [ ] Check billing/payments

### Weekly Review

- [ ] Performance metrics review
- [ ] Cost analysis
- [ ] User feedback summary
- [ ] Plan improvements

## Quick Reference

### Emergency Contacts

| Role | Contact |
|------|---------|
| Technical Lead | [Phone/Slack] |
| Supabase Support | support@supabase.io |
| Railway Support | In-app chat |
| AWS Support | Console |

### Key Commands

```bash
# Check backend
curl https://api.capveri.com/health

# Check logs (Railway)
railway logs --follow

# Check database (Supabase)
# Dashboard > Database > Reports
```

### Service URLs

| Service | URL |
|---------|-----|
| App | https://app.capveri.com |
| API | https://api.capveri.com |
| Railway | https://railway.app |
| Vercel | https://vercel.com |
| Supabase | https://supabase.com/dashboard |
| Status | https://status.capveri.com |

---

**Launch completed**: _______________

**Time**: _______________

**Signed off by**: _______________

**Notes**:
```
[Any notes from launch day]
```
