# Documentation

> **Start here:** [`portfolio/`](../portfolio/): the engineering write-ups. Everything else in this
> tree is working documentation produced during development and preserved as-is.

## Portfolio documentation

Written after the project closed, for a reader evaluating the engineering. Every claim links to
code or to a commit.

| Document | What it covers |
|---|---|
| [METRICS.md](../portfolio/METRICS.md) | Every number quoted anywhere, with the command that produced it |
| [ARCHITECTURE.md](../portfolio/ARCHITECTURE.md) | Four Workers, queues, Durable Objects, R2, the data model |
| [RECONCILIATION-ENGINE.md](../portfolio/RECONCILIATION-ENGINE.md) | The money math: BigInt cents, the calculation waterfall, cap banks |
| [ORACLE.md](../portfolio/ORACLE.md) | The non-deployed reference implementation and the adjudicated divergences |
| [ENGINEERING-LOG.md](../portfolio/ENGINEERING-LOG.md) | Eleven production defects, with root cause and blast radius |
| [SECURITY.md](../portfolio/SECURITY.md) | Multi-tenancy, default-deny routing, the cross-tenant leak |
| [AI-PIPELINE.md](../portfolio/AI-PIPELINE.md) | Dual-extract plus judge, and the human-review quarantine |
| [SCHEMA-HISTORY.md](../portfolio/SCHEMA-HISTORY.md) | 142 migrations read as a record of what went wrong, including a fabricated date prefix |
| [INFRASTRUCTURE.md](../portfolio/INFRASTRUCTURE.md) | The Railway and Vercel years, the deploy-cap outage, and the move to Cloudflare |
| [SEO.md](../portfolio/SEO.md) | The marketing site as a build system: 729 pages, and a governance file that retires them |
| [TESTING.md](../portfolio/TESTING.md) | Test layers, parallelization work, CI posture, known gaps |
| [PROD-STRESS-PROGRAM.md](../portfolio/PROD-STRESS-PROGRAM.md) | 104 adversarial scenarios and the discipline behind them |
| [WALKTHROUGH.md](../portfolio/WALKTHROUGH.md) | One reconciliation from login to tenant statement, each step tied to its code |
| [PRD.md](../portfolio/PRD.md) | What CAM reconciliation is, and the interface |

## Working with the code

| Document | What it covers |
|---|---|
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Local stack, tests, generated artifacts, troubleshooting |
| [guides/agent-operations.md](./guides/agent-operations.md) | Commands, deploy runbook, API conventions, project structure |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution conventions |
| [design-tokens.md](./design-tokens.md) | The token pipeline feeding both the app and transactional email |
| [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md) | Manual test walkthrough against seeded data |

## Architecture and design

- [architecture/](./architecture/): 18 design documents, including
  [dual-extraction.md](./architecture/dual-extraction.md)
- [Architecture for CapVeri.md](./Architecture%20for%20CapVeri.md) and
  [Data Architecture for CapVeri.md](./Data%20Architecture%20for%20CapVeri.md), early design notes
- [migration/](./migration/), the phased Railway to Cloudflare Workers migration plan
- [feature-inventory/](./feature-inventory/): what shipped, kept in sync by a git hook

## Engineering ledgers

Raw working logs from long-running quality efforts. These are development artifacts, not polished
documentation. They are verbose, they contain dead ends, and they are the source material the
portfolio write-ups were distilled from.

- [goal-e2e-stress/](./goal-e2e-stress/): 82 audit cycles. `HANDOFF.md` states the oracle mandate.
- [goal-prod-e2e-stress/](./goal-prod-e2e-stress/) (11 production stress cycles)
- [goal-finops-correctness/](./goal-finops-correctness/), financial correctness work, including the
  pytest parallelization
- [goal-pristine-2026/](./goal-pristine-2026/) and [goal-pristine-coherent/](./goal-pristine-coherent/):
  UI/UX consistency sweeps
- [goal-frontend-audit/](./goal-frontend-audit/) (frontend audit progress)

> **Commit SHAs inside these ledgers refer to the private development history**, so they do not
> resolve in this snapshot. Same for the SHAs in the portfolio documents: the two sets line up with
> each other. See [METRICS.md](../portfolio/METRICS.md#provenance).

## Other

- [stories/](./stories/), 316 development story files
- [qa/](./qa/), [testing/](./testing/), [audits/](./audits/): QA plans and audit output
- [seo/](./seo/), [content/](./content/), [marketing/](./marketing/) (content and SEO working notes)
- [compliance/](./compliance/), AI transparency and data handling notes
- [operations/](./operations/): operational records, including the sunset teardown
- [archive/](./archive/) (superseded documents)

---

Some documents in this tree reference infrastructure that no longer exists, or paths this snapshot
excludes. They are kept because they record what was actually done at the time.
