# Incident Response Playbook

Procedures for handling production incidents in CapVeri.

## Severity Levels

| Level | Description | Examples | Response Time |
|-------|-------------|----------|---------------|
| **P1** | Complete outage | Site down, data loss | Immediate |
| **P2** | Major feature broken | Cannot create reconciliations | < 1 hour |
| **P3** | Degraded performance | Slow response, partial failures | < 4 hours |
| **P4** | Minor issue | UI bug, cosmetic issues | Next business day |

## Incident Response Flow

```
Detection → Acknowledge → Assess → Communicate → Fix → Verify → Post-mortem
```

## Phase 1: Detection

### Alert Sources

- Uptime monitoring (UptimeRobot)
- Error tracking (Sentry/logs)
- User reports
- Team observation

### Initial Triage

1. What is the symptom?
2. When did it start?
3. Who is affected?
4. What is the scope?

## Phase 2: Acknowledge

### P1/P2 Incidents

1. Acknowledge in monitoring tool
2. Notify team (Slack/call)
3. Assign incident commander
4. Start incident log

### Incident Log Template

```markdown
## Incident: [Title]
**Started**: 2024-01-15 10:00 UTC
**Severity**: P1
**Status**: Investigating

### Timeline
- 10:00 - Alert fired: API health check failed
- 10:05 - [Name] acknowledged, investigating
- ...

### Current Status
Investigating root cause.

### Actions Taken
1. Checked Railway logs
2. Verified database connection
```

## Phase 3: Assess

### Quick Checks

```bash
# Is the site up?
curl -I https://app.capveri.com

# Is the API up?
curl https://api.capveri.com/health

# Check logs
railway logs --filter "ERROR" | head -50
```

### Common Root Causes

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| 502/503 errors | Service crashed | Railway logs |
| Slow responses | Database issue | Supabase dashboard |
| Auth failures | Token/config issue | Supabase Auth logs |
| CORS errors | Config mismatch | FRONTEND_URL env var |

### Recent Changes

Check if related to recent deployments:
1. Railway deployment history
2. Vercel deployment history
3. Supabase migration history
4. Config changes

## Phase 4: Communicate

### Internal Communication

**Slack template**:
```
🚨 INCIDENT: [Title]
Severity: P1
Status: Investigating
Impact: [Who is affected]
Lead: [Name]
Thread: [Link to incident channel]
```

### External Communication

**Status page update**:
```
Investigating - We are aware of issues affecting [service].
We are actively investigating and will provide updates.
```

**User notification** (if needed):
```
Subject: Service Disruption Notice

We are experiencing issues with [feature].
Our team is working to resolve this.
We will update you when service is restored.
```

## Phase 5: Fix

### Rollback Decision

**Rollback if**:
- Issue started after deployment
- Fix is not immediately clear
- Impact is high

**Railway rollback**:
1. Go to Deployments
2. Find last working deployment
3. Click "Redeploy"

**Vercel rollback**:
1. Go to Deployments
2. Find last working deployment
3. Click "..." > "Promote to Production"

### Hotfix Process

1. Create fix branch from main
2. Make minimal fix
3. Test locally
4. Deploy via PR or direct push
5. Monitor for resolution

### Database Fixes

```sql
-- Only for critical fixes, document everything
BEGIN;

-- Your fix here
UPDATE table SET column = value WHERE condition;

-- Verify
SELECT * FROM table WHERE condition;

COMMIT; -- or ROLLBACK if wrong
```

## Phase 6: Verify

### Confirm Resolution

1. Check health endpoint
2. Test affected feature
3. Monitor error rates
4. Check user reports

### Update Status

```
Resolved - The issue affecting [service] has been resolved.
We apologize for any inconvenience.
```

### Close Incident

1. Update incident log with resolution
2. Mark incident as resolved
3. Send all-clear to team

## Phase 7: Post-Mortem

### Schedule

- P1: Within 24 hours
- P2: Within 3 days
- P3/P4: Weekly review

### Post-Mortem Template

```markdown
## Incident Post-Mortem: [Title]

**Date**: 2024-01-15
**Duration**: 2 hours
**Severity**: P1
**Author**: [Name]

### Summary
Brief description of what happened and impact.

### Timeline
- 10:00 - Symptom first observed
- 10:15 - Alert triggered
- 10:20 - Investigation started
- 11:00 - Root cause identified
- 11:30 - Fix deployed
- 12:00 - Incident resolved

### Root Cause
Detailed explanation of why it happened.

### Impact
- Users affected: ~100
- Duration: 2 hours
- Data loss: None

### What Went Well
- Alert triggered quickly
- Team responded promptly

### What Could Be Improved
- Need better monitoring for X
- Runbook didn't cover this scenario

### Action Items
1. [ ] Add monitoring for X - [Owner] - Due: [Date]
2. [ ] Update runbook - [Owner] - Due: [Date]
3. [ ] Add regression test - [Owner] - Due: [Date]
```

## On-Call

### Responsibilities

- Monitor alerts
- Acknowledge within 15 minutes
- Escalate if needed
- Document actions

### Escalation Path

1. Primary on-call
2. Secondary on-call
3. Team lead
4. CTO/Founder

### Handoff

At shift end:
1. Document ongoing issues
2. Brief incoming on-call
3. Transfer any open incidents

## Quick Reference

### Emergency Contacts

| Role | Contact |
|------|---------|
| Primary On-Call | [contact] |
| Secondary | [contact] |
| Supabase Support | support@supabase.io |
| Railway Support | In-app chat |
| AWS Support | Console |

### Key URLs

| Service | URL |
|---------|-----|
| Railway Dashboard | railway.app |
| Vercel Dashboard | vercel.com |
| Supabase Dashboard | supabase.com/dashboard |
| Status Page | status.capveri.com |

## Next Steps

- [Scaling Guide](./04-scaling-guide.md)
- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
