# CapVeri — Disaster Recovery Runbook

**Version:** 1.0
**Last reviewed:** 2026-02-23
**Owner:** Engineering Lead

> Cross-references: [Incident Playbook](../guides/operations/03-incident-response-playbook.md) · [Backup & Recovery](../guides/operations/02-database-backup-and-recovery.md) · [Uptime Monitoring](../guides/monitoring/03-uptime-monitoring.md)

---

## 1. Overview

### Purpose

This runbook documents the procedures for recovering CapVeri after a service outage or data loss event. It is the single authoritative reference for on-call engineers during an incident.

### Scope

All production components: Supabase (database), Railway (backend API), Vercel (frontend), AWS S3/document reader, Stripe, Anthropic, and Resend.

### Recovery Targets

| Target | Value | Notes |
|--------|-------|-------|
| **RTO** (Recovery Time Objective) | **4 hours** | Maximum tolerable downtime before SLA breach |
| **RPO** (Recovery Point Objective) | **1 hour** | Maximum acceptable data loss |
| RPO (without Supabase Pro PITR) | 24 hours | Daily backup window only |

> **Critical context:** Year-end CAM reconciliation cycles mean a 4-hour outage constitutes a material SLA breach for enterprise customers. Activate this runbook immediately for any P1 incident.

---

## 2. Severity Levels

| Level | Name | Definition | SLA Response | Example |
|-------|------|------------|--------------|---------|
| **P1** | Critical | Complete service unavailability or data corruption | 15 min acknowledgement, 4 hr resolution | Database down, all users locked out |
| **P2** | High | Partial outage affecting core features | 30 min acknowledgement, 8 hr resolution | Document extraction unavailable, billing failing |
| **P3** | Medium | Performance degradation, non-critical feature broken | 2 hr acknowledgement, 24 hr resolution | Slow queries, email delays |
| **P4** | Low | Cosmetic issues, minor UX bugs | Next business day | Styling broken, non-critical UI errors |

---

## 3. System Components & Failure Impact

| Component | Provider | Failure Impact | Fallback Behaviour |
|-----------|----------|---------------|-------------------|
| **Database** | Supabase (PostgreSQL) | Complete outage — no data reads/writes | None; triggers P1 |
| **Backend API** | Railway | All API calls fail | Frontend shows error states; retry after redeploy |
| **Frontend** | Vercel | Web app inaccessible | Direct API still reachable for integrations |
| **Object Storage** | AWS S3 | Document uploads/downloads fail | Queue uploads client-side; retry when restored |
| **OCR / document reader** | document reader | PDF extraction unavailable | Manual data entry workflow; degraded service |
| **AI Extraction** | Anthropic Claude | AI-assisted lease extraction fails | Manual review queue; core CAM calculations unaffected |
| **Payments** | Stripe | Subscription billing fails | Webhooks replay automatically; idempotency table prevents double-billing |
| **Transactional Email** | Resend | Notification emails not sent | Users can still log in; no data loss |

---

## 4. Pre-Incident Preparation

### Contact List Template

Maintain a private document (e.g. 1Password secure note) with:

```
Engineering Lead:   [name] — [phone] — [email]
On-call Engineer:   [name] — [phone] — [email]
Supabase Support:   support@supabase.io  (Pro plan: priority queue)
Railway Support:    help@railway.app
Stripe Support:     https://support.stripe.com (Dashboard → Help)
AWS Support:        [account-specific support URL]
```

### Runbook Access

This file is checked into the repository at `docs/operations/disaster-recovery-runbook.md`. Ensure the engineering team has a printed/offline copy or access via GitHub during an outage.

### Credentials Location

All production credentials are stored in:
- Railway environment variables (backend)
- Vercel environment variables (frontend)
- 1Password vault: "CapVeri Production" (shared with engineering team)

> Never store secrets in this document or any file tracked by git.

---

## 5. Detection & Alerting

### Health Endpoint

```
GET https://api.capveri.com/health
```

Returns:
- `200 healthy` — all systems operational
- `200 degraded` — external services using test credentials (development only)
- `503 unhealthy` — database unavailable

Checks: `database`, `storage`, `ai_extraction`, `payments`, `email`

### Monitoring Configuration

**UptimeRobot / BetterStack recommended setup:**

| Monitor | URL | Interval | Alert threshold |
|---------|-----|----------|----------------|
| API health | `https://api.capveri.com/health` | 1 min | 2 consecutive failures |
| Frontend | `https://app.capveri.com` | 1 min | 2 consecutive failures |
| Auth | `https://api.capveri.com/api/v1/auth/health` | 5 min | 1 failure |

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|---------|
| Response time | > 2 s | > 10 s |
| Error rate (5xx) | > 1% | > 5% |
| Health check failures | 1 consecutive | 2 consecutive |

---

## 6. Incident Response Procedure

### Phase 1 — Detect

- Alert triggered by monitoring (UptimeRobot/BetterStack), customer report, or `/health` returns non-200
- Confirm the incident is real (not a transient flap)

### Phase 2 — Acknowledge

- On-call engineer acknowledges within SLA window
- Open an incident channel: `#incident-YYYY-MM-DD` in team Slack
- Assign Incident Commander (IC) for P1/P2

### Phase 3 — Triage

```bash
# Check health endpoint
curl -s https://api.capveri.com/health | jq .

# Review Railway logs
railway logs --tail 100

# Check Supabase dashboard
# → Database → Logs → API Logs
```

Identify the failing component from `/health` response `checks` field.

### Phase 4 — Communicate

For P1/P2: post customer-facing update within 30 minutes (see Section 9).

### Phase 5 — Remediate

Follow the applicable playbook in Section 7.

### Phase 6 — Verify

```bash
# Confirm health returns 200 healthy
curl -s https://api.capveri.com/health | jq '.status'

# Smoke test key user flows
# 1. Login
# 2. Property list loads
# 3. Document upload (if storage was affected)
# 4. Reconciliation calculation
```

### Phase 7 — Post-Mortem

Complete within 5 business days (see Section 10).

---

## 7. Recovery Playbooks

### 7.1 Database Failure / Data Corruption

**Symptom:** `/health` returns `"database": {"status": "unhealthy"}` or data is missing/corrupted.

**Steps:**

1. **Assess scope** — Is this a connection failure or data corruption?
   - Connection failure: check Railway ↔ Supabase network, check Supabase status page
   - Data corruption: proceed to PITR restore

2. **Supabase PITR restore (Pro plan):**
   ```
   Supabase Dashboard → Project → Database → Backups → Point-in-Time Recovery
   Select timestamp just before incident
   Confirm restore (creates new database — downtime required)
   Update DATABASE_URL in Railway env vars if endpoint changes
   ```

3. **Verify restore:**
   ```sql
   -- Connect to restored DB and verify key tables
   SELECT COUNT(*) FROM organizations;
   SELECT COUNT(*) FROM leases;
   SELECT MAX(created_at) FROM reconciliation_snapshots;
   ```

4. **Redeploy backend** to pick up any connection changes:
   ```bash
   railway redeploy
   ```

> Reference: [Database Backup and Recovery Guide](../guides/operations/02-database-backup-and-recovery.md)

---

### 7.2 Backend API Down (Railway)

**Symptom:** Frontend returns API errors; `/health` unreachable.

**Steps:**

1. Check Railway dashboard for deployment status and error logs
2. If recent deployment caused regression:
   ```bash
   # Roll back via Railway CLI
   railway rollback
   # Or via Railway Dashboard → Deployments → select last working → Rollback
   ```
3. If Railway infrastructure issue, check Railway status page: `https://status.railway.app`
4. After recovery:
   ```bash
   curl -s https://api.capveri.com/health | jq .
   ```

---

### 7.3 Frontend Down (Vercel)

**Symptom:** `https://app.capveri.com` returns 500/503 or is unreachable.

**Steps:**

1. Check Vercel dashboard → Deployments for build/runtime errors
2. To roll back:
   ```
   Vercel Dashboard → Project → Deployments
   Find last successful deployment → "..." menu → Redeploy
   ```
3. Check Vercel status: `https://vercel-status.com`

---

### 7.4 Stripe Webhook Failure

**Symptom:** Subscriptions not activating; billing events not processing.

**Steps:**

1. Check Stripe Dashboard → Developers → Webhooks → recent events
2. Identify failed events (HTTP 4xx/5xx responses)
3. Replay failed events:
   ```
   Stripe Dashboard → Webhooks → [endpoint] → Recent deliveries → Resend
   ```
4. Verify idempotency — our `stripe_webhook_events` table prevents double-processing:
   ```sql
   SELECT stripe_event_id, processed_at FROM stripe_webhook_events
   ORDER BY processed_at DESC LIMIT 20;
   ```

---

### 7.5 AWS Outage (S3 / document reader)

**Symptom:** `/health` returns `"storage": {"status": "degraded/unhealthy"}`. Document uploads or OCR fail.

**Steps:**

1. Check AWS Health Dashboard: `https://health.aws.amazon.com/health/status`
2. **Core platform continues to function** — CAM calculations, lease data, reporting are unaffected
3. Document uploads queue client-side; notify affected users
4. After AWS recovery, retry any failed document reader jobs:
   ```python
   # Re-trigger extraction for failed batches via admin endpoint
   POST /api/v1/extraction/retry-failed
   ```

---

### 7.6 Anthropic API Outage

**Symptom:** AI lease extraction fails; `/health` shows `"ai_extraction": {"status": "degraded/unhealthy"}`.

**Steps:**

1. Check Anthropic status: `https://status.anthropic.com`
2. AI extraction is non-blocking — users can manually enter lease data
3. Notify affected users that AI extraction is temporarily unavailable
4. After recovery, existing pending extraction jobs retry automatically

> **Important:** CAM financial calculations never use LLMs. Core reconciliation accuracy is unaffected.

---

### 7.7 Complete Data Loss

**Symptom:** Database is empty or inaccessible with no PITR available.

**Steps:**

1. Activate P1 incident procedure immediately
2. Identify most recent backup:
   - Supabase Pro: PITR up to 7 days (see 7.1)
   - Supabase Free: daily snapshots (24 hr RPO)
3. Contact Supabase support for emergency restore assistance
4. Assess data since last backup — check S3 for uploaded documents as secondary source
5. Communicate data loss scope to affected customers before restoring access

---

## 8. Backup Verification Schedule

Run monthly to confirm backup viability before you need it:

```bash
# Monthly backup verification procedure

# 1. Create a test Supabase project (or use staging)
# 2. Restore from latest backup to test project
# 3. Verify key data is present:
#    - Organizations count matches production
#    - Recent leases present
#    - Reconciliation snapshots present
# 4. Test a CAM calculation on restored data
# 5. Document result in backup verification log
# 6. Destroy test project
```

**Verification log location:** `docs/operations/backup-verification-log.md` (private, not in git)

---

## 9. Communication Templates

### Customer-Facing Status Update (P1/P2)

**Initial notification (within 30 minutes):**

```
Subject: [CapVeri] Service Disruption — [Date]

We are currently experiencing an issue affecting [describe impact].
Our engineering team is actively investigating and working to restore service.

Impact: [what users cannot do]
Started: [time] UTC
Current status: Investigating

We will provide an update within [1 hour / 30 minutes].

We apologize for the inconvenience.
— CapVeri Engineering Team
```

**Update (every 30-60 minutes during P1):**

```
Subject: [CapVeri] Service Update — [Date] [Time]

Update on the service disruption:

Status: [Investigating / Identified / Monitoring / Resolved]
Root cause: [brief description once known]
Next update: [time] UTC

[Any workarounds available]
```

**Resolution notice:**

```
Subject: [CapVeri] Service Restored — [Date]

The service disruption has been resolved as of [time] UTC.

Duration: [X hours Y minutes]
Root cause: [brief description]
Actions taken: [what was done]
Prevention: [what we're doing to prevent recurrence]

We apologize for the disruption. A full post-mortem will be available within 5 business days.

If you experienced data issues or have questions, please contact angel.campa@capveri.com
```

---

## 10. Post-Mortem Template

Complete within 5 business days of incident resolution. Blameless — focus on systems and processes, not individuals.

```markdown
# Post-Mortem: [Incident Title]

**Date:** [YYYY-MM-DD]
**Duration:** [X hours Y minutes]
**Severity:** P[1-4]
**Author:** [name]
**Reviewers:** [names]

## Summary
[2-3 sentence description of what happened, impact, and resolution]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | Incident began |
| HH:MM | Alert fired |
| HH:MM | Engineer acknowledged |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |
| HH:MM | Incident closed |

## Root Cause
[Detailed technical description of what caused the incident]

## Contributing Factors
- [Factor 1]
- [Factor 2]

## What Went Well
- [e.g. monitoring alerted quickly]
- [e.g. rollback procedure worked as designed]

## Action Items
| Action | Owner | Due Date | Priority |
|--------|-------|----------|---------|
| [Fix X] | [@engineer] | [date] | P1 |
| [Add monitoring for Y] | [@engineer] | [date] | P2 |
```

---

## 11. Key Credentials & Runbook Locations

> This section lists **where** credentials are stored — never the credentials themselves.

| Secret | Location |
|--------|----------|
| Supabase URL + keys | Railway environment variables + 1Password |
| Stripe API keys | Railway environment variables + 1Password |
| Anthropic API key | Railway environment variables + 1Password |
| AWS credentials | Railway environment variables + 1Password |
| Resend API key | Railway environment variables + 1Password |
| This runbook | `docs/operations/disaster-recovery-runbook.md` (git) |
| Backup verification log | 1Password secure note (private) |
| Contact list | 1Password secure note (private) |
