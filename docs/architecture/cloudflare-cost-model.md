# Cloudflare Backend Cost Model

## Pricing Inputs

Official Cloudflare pricing checked on 2026-06-12:

- Workers Paid: minimum $5/month account charge. Included monthly usage is 10M requests and 30M CPU ms; overage is $0.30/M requests and $0.02/M CPU ms. Workers do not add egress or bandwidth charges.
- Worker CPU limit: default paid-plan max CPU is 30 seconds per invocation; it can be raised up to 5 minutes in Wrangler or the dashboard when a specific workload proves it needs the budget.
- Hyperdrive: included with Workers plans. Paid-plan Hyperdrive database queries are unlimited.
- Queues: 1M operations/month included on Workers Paid, then $0.40/M operations. A delivered message usually counts as at least three operations: write, read, and delete.
- R2 Standard: 10 GB-month, 1M Class A operations, and 10M Class B operations included monthly. Overage is $0.015/GB-month, $4.50/M Class A operations, and $0.36/M Class B operations. Internet egress is free.
- Workflows: billed as Workers requests and CPU, plus persisted state. Paid plan includes 1 GB-month of Workflow storage, then $0.20/GB-month.
- Neon/current Postgres: out of scope for this document until production provider and plan are verified. Track it separately from Cloudflare spend.
- OpenRouter, Stripe, Resend, Sentry, and PostHog are excluded from Cloudflare cost totals and need separate vendor budgets.

## Workload Unit Estimates

| Unit | Worker requests | CPU ms | Queue ops | Workflow instances | R2 Class A | R2 Class B | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| Login/session API day per active user | measure | measure | 0 | 0 | 0 | 0 | API/auth only; database provider cost tracked separately. |
| One lease extraction | measure | measure | measure | measure | measure | measure | Upload, workflow, R2 reads/writes, OpenRouter excluded. |
| One GL import | measure | measure | measure | measure | measure | measure | Upload, parse workflow, inserts, and row validation. |
| One reconciliation | measure | measure | measure | measure | measure | measure | Deterministic math, snapshots, and trace persistence. |
| One export packet | measure | measure | measure | measure | measure | measure | PDF/ZIP generation, R2 artifact write, and download. |
| One public lead/contact submission | measure | measure | measure | 0 | 0 | 0 | Turnstile, rate limit, DB write, and email queue. |
| One tenant dispute packet upload | measure | measure | measure | measure | measure | measure | R2 upload intent, metadata write, notification queue. |

## Budget Gates

- p95 API CPU per request target: under 50 ms for read routes and under 250 ms for ordinary writes.
- User-visible background work target: queue age under 5 minutes for extraction/import/reconciliation/export jobs that the UI is waiting on.
- Workflow failure alert: any production workflow failure rate above 1% over 15 minutes.
- R2 Class A/B alerts: 50%, 80%, and 100% of included monthly operations.
- R2 storage alerts: 50%, 80%, and 100% of included 10 GB-month, plus a separate alert for any accidental Infrequent Access usage.
- Worker CPU alerts: 50%, 80%, and 100% of included monthly CPU.
- Worker request alerts: 50%, 80%, and 100% of included monthly requests.
- Queue operation alerts: 50%, 80%, and 100% of included monthly operations.
- Workflow storage alert: 50%, 80%, and 100% of included 1 GB-month.
- Neon/Postgres alerts: connection pool saturation, p95 query latency over 250 ms for API queries, and p95 over 2 seconds for job queries.
- Vendor spend alerts: OpenRouter extraction spend, Resend email volume, and observability event volume must have separate monthly budgets before customer scale.

## Customer-Scale Formula

Use measured values from staging before cutover:

```text
monthly_worker_request_cost =
  max(0, requests - 10_000_000) / 1_000_000 * 0.30

monthly_worker_cpu_cost =
  max(0, cpu_ms - 30_000_000) / 1_000_000 * 0.02

monthly_queue_cost =
  max(0, queue_operations - 1_000_000) / 1_000_000 * 0.40

monthly_r2_storage_cost =
  max(0, gb_month - 10) * 0.015

monthly_r2_class_a_cost =
  max(0, class_a_operations - 1_000_000) / 1_000_000 * 4.50

monthly_r2_class_b_cost =
  max(0, class_b_operations - 10_000_000) / 1_000_000 * 0.36

estimated_cloudflare_backend_cost =
  5.00
  + monthly_worker_request_cost
  + monthly_worker_cpu_cost
  + monthly_queue_cost
  + monthly_r2_storage_cost
  + monthly_r2_class_a_cost
  + monthly_r2_class_b_cost
  + workflow_storage_overage
```

## Design Implications

- The fixed Cloudflare bill can stay near the Workers Paid floor while usage is low, provided R2 storage and Class A operations stay under the included tier.
- CPU-heavy parsing and export generation are the main scaling risk. They must be chunked, measured, and moved out of synchronous request paths.
- R2 Class A operations can become a hidden cost if uploads, metadata writes, multipart creation, or object listing are chatty. Prefer direct object keys and avoid list-heavy workflows.
- Queue costs are predictable if every logical job message is modeled as at least three operations.
- Hyperdrive removes per-query Cloudflare charges, but database plan limits still matter. Connection pooling and query latency are still production gates.
- OpenRouter is likely to dominate per-extraction variable cost before Cloudflare does. Treat LLM cost separately from infrastructure cost.

## Sources

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Hyperdrive pricing: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Cloudflare Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Workflows pricing: https://developers.cloudflare.com/workflows/reference/pricing/
