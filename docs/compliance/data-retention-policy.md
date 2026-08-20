# Data Retention Policy

**Effective date:** February 2026
**Contact:** angel.campa@capveri.com

---

## Why this exists

The IRS requires commercial real estate financial records to be kept for at least 7 years (§ 6001) — and Rev. Proc. 98-25 extends that to electronic records too. GAAP has its own retention requirements, and state tenancy laws add another layer on lease-related documents.

We retain financial records for **10 years** — three years beyond the IRS minimum — to give customers a safety margin for audits and disputes that can drag on.

Not everything lives that long. Job queue entries, sent-email logs, and read notifications are short-lived operational data. We purge those on a weekly schedule, automatically.

---

## The three tiers

### Tier 1 — Financial records (10 years)

These records document real transactions. They stay.

| Table | What it holds |
|---|---|
| `organizations` | Customer account records |
| `users` | User accounts and role assignments |
| `properties` | Property definitions |
| `units` | Unit inventory |
| `leases` | Lease terms and tenant assignments |
| `import_batches` | Audit trail for all imported GL data |
| `gl_entries` | The actual general ledger data |
| `reconciliation_snapshots` | Calculated CAM reconciliation results |
| `actual_billed_amounts` | What tenants were actually charged |
| `expense_pools` | CAM pool configurations |
| `pool_mappings` | GL account-to-pool assignments |
| `pool_allocations` | Calculated tenant allocations |
| `pool_templates` | Reusable pool configurations |
| `subscriptions` | Billing subscription records |
| `invoices` | Invoice history |
| `audit_log` | System audit trail |
| `disputes` | CAM charge disputes |
| `dispute_comments` | Correspondence on disputes |
| `dispute_attachments` | Supporting documents for disputes |
| `audit_requests` | Third-party audit requests |
| `column_mappings` | Import format mappings (Rev. Proc. 98-25) |

**Legal basis:** IRS § 6001, Rev. Proc. 98-25, GAAP, state tenancy law
**Period:** 10 years from record creation
**Automated purge:** No — these are never deleted automatically

---

### Tier 2 — Operational records (2–3 years)

Records tied to the active life of a customer relationship. Retained while the relationship is active, then removed during offboarding.

| Table | Retention | What it holds |
|---|---|---|
| `tenant_users` | 3 years | Tenant portal user accounts |
| `tenant_lease_links` | 3 years | Tenant-to-lease access grants |
| `tenant_invitations` | 3 years | Tenant portal invite records |
| `team_member_invitations` | 3 years | Staff invite records |
| `tenant_email_preferences` | 3 years | Email preference settings |
| `promotions` | 3 years | Promotional campaign records |
| `promotion_redemptions` | 3 years | Redemption history |
| `feedback` | 3 years | Product feedback submissions |
| `ocr_results` | 2 years | Raw OCR output from PDF processing |
| `content_leads` | 3 years | Marketing lead capture records |

**Legal basis:** Business necessity, state tenancy law, CAN-SPAM
**Automated purge:** No — removed during account offboarding

Note on `ocr_results`: raw OCR text is operational data. The underlying financial figures extracted from it live in `gl_entries` (Tier 1) and stay for 10 years.

---

### Tier 3 — Transient data (days to 1 year)

Short-lived operational data with no financial significance. Purged automatically every Sunday at 02:00 UTC.

| Table | Purge window | Condition |
|---|---|---|
| `tenant_email_logs` | 48 hours | All rows older than 48 hours (uses `sent_at`) |
| `extraction_jobs` | 90 days | Completed or failed jobs only — in-progress rows are never touched |
| `calculation_jobs` | 90 days | Completed or failed jobs only — in-progress rows are never touched |
| `tenant_notifications` | 90 days | Read notifications only — unread notifications are never purged |
| `stripe_webhook_events` | 90 days | All rows (outcomes mirrored to `invoices` / `subscriptions`) |
| `auth_events` | 365 days | All rows (uses `timestamp` column) |

**Legal basis:** Operational necessity, SOC 2 lookback (auth events)
**Automated purge:** Yes — `run_retention_purge()` via pg_cron every Sunday 02:00 UTC

---

## Automated enforcement

The `run_retention_purge()` function runs weekly via pg_cron. It deletes rows from the six transient tables according to the conditions above and returns a JSON summary of how many rows were removed per table.

The function is `SECURITY DEFINER` and is revoked from all non-superuser roles. It runs only in the pg_cron context (superuser) or via the service role on explicit platform admin request.

To verify the schedule is active:

```sql
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'capveri-retention-purge';
```

To run a manual purge (service role only):

```sql
SELECT public.run_retention_purge();
```

---

## AI / LLM data handling

CapVeri uses Claude (Anthropic) for PDF document extraction. Anthropic does not use API inputs to train their models. Lease document text sent to the API is subject to Anthropic's standard API data handling policy. See the [AI Transparency Statement](./ai-transparency-statement.md) for full detail.

Financial calculations are performed entirely by deterministic Python code. No AI model is used for math.

---

## Account deletion and offboarding

When a customer closes their account:

1. **Personal data** (names, email addresses, contact information) is anonymized within 30 days.
2. **Tier 2 operational records** are removed during the offboarding process.
3. **Tier 1 financial records** are retained for the remainder of the 10-year period from their creation date. This is not optional — IRS § 6001 requires it.

We do not delete financial ledger data on request if it falls within the statutory retention window. We will tell you exactly what we hold and why.

---

## Questions

Email angel.campa@capveri.com. We'll reply with specifics, not boilerplate.
