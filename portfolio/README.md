# Portfolio

This folder is written for a reader evaluating the engineering, not for a future contributor.
Every claim in it traces to something checkable: a file in this tree, a number in
[METRICS.md](./METRICS.md) with the command that produced it, or a named decision. If a document
here asserts something you cannot verify against the repository, that is a defect: open an issue
against the claim, not against the code.

**If you read one thing:** [ORACLE.md](./ORACLE.md). CapVeri kept a second, non-deployed
implementation of the money math specifically to disagree with the one that shipped, and the
document that matters most is where that oracle caught the production engine being wrong, and the
one place ([ENGINEERING-LOG.md #6](./ENGINEERING-LOG.md#6-the-status-mappers-default-branch-handed-out-free-access))
where it didn't, because both engines shared the same bug.

## Documents

| Document | Length | Covers |
|---|---:|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 185 lines | Four Cloudflare Workers, queues, Durable Objects, R2, data model |
| [METRICS.md](./METRICS.md) | 331 lines | Every number quoted anywhere in this portfolio, with the command that produced it |
| [TESTING.md](./TESTING.md) | 151 lines | Test layers, why bespoke harnesses sit alongside Playwright, CI posture, Worker coverage limits |
| [ENGINEERING-LOG.md](./ENGINEERING-LOG.md) | 399 lines | Eleven production defects in depth, root cause to fix |
| [SECURITY.md](./SECURITY.md) | 204 lines | Multi-tenancy, default-deny routing, and the cross-tenant leak |
| [ORACLE.md](./ORACLE.md) | 187 lines | The Python reference implementation kept as an executable specification, and where it diverges from the TypeScript that shipped |
| [RECONCILIATION-ENGINE.md](./RECONCILIATION-ENGINE.md) | 213 lines | The money math: BigInt integer cents, rounding, caps, gross-ups |
| [AI-PIPELINE.md](./AI-PIPELINE.md) | 181 lines | Dual-extract, judge, and the human-review quarantine gate |
| [PROD-STRESS-PROGRAM.md](./PROD-STRESS-PROGRAM.md) | 152 lines | 104 scenario scripts driving the live API with penny-exact offline expectations |
| [SCHEMA-HISTORY.md](./SCHEMA-HISTORY.md) | 194 lines | What 142 migrations remember about getting the database wrong |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | 207 lines | Railway and Vercel, and the move to Cloudflare |
| [SEO.md](./SEO.md) | 206 lines | The marketing site's build-time page generation and retirement system |
| [WALKTHROUGH.md](./WALKTHROUGH.md) | 259 lines | One reconciliation, screen by screen, with the code behind each step |
| [PRD.md](./PRD.md) | 145 lines | Domain primer: what CAM reconciliation is, and the product gallery |

## What this folder contains

`portfolio/screenshots/` holds the 13 captures referenced throughout these documents, taken from a
local run of the real application against seeded data. `portfolio/runs/` holds the raw stdout of
every test suite run cited in [METRICS.md](./METRICS.md) and [TESTING.md](./TESTING.md). Two
documents under `docs/`, [`Architecture for CapVeri.md`](../docs/Architecture%20for%20CapVeri.md)
and [`Data Architecture for CapVeri.md`](../docs/Data%20Architecture%20for%20CapVeri.md), are
earlier working drafts covering the same subject as [ARCHITECTURE.md](./ARCHITECTURE.md); this
folder's version is the authoritative, current one, and where the two disagree, this folder wins.
