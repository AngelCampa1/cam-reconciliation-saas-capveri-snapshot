# Testing

The repository contains substantially more lines of test than of application source: 534,150
against 364,654, a ratio of 1.465 to 1. That is a consequence of the domain rather than a target:
this is software that computes money one party bills another, and a wrong number does not announce
itself.

All counts and measured run results are in [METRICS.md](./METRICS.md).

---

## The layers

| Layer | Location | What it is for |
|---|---|---|
| Unit / integration (pytest) | `backend/tests/` | The reference implementation, exercised as a specification |
| Property-based parity (Hypothesis) | `backend/tests/stress/` | 21 suites asserting the two engines agree to the penny. See [ORACLE.md](./ORACLE.md) |
| Worker unit / integration (Vitest) | `cloudflare-backend/src/test/` | The production API, run in a real `workerd` runtime |
| Frontend unit (Vitest + RTL) | `frontend/src/**` | Components, hooks, API layer |
| Marketing (Vitest) | `marketing/src/**` | Content pipeline, SEO generation, landing components |
| Browser E2E (Playwright) | `frontend/e2e/`, `marketing/e2e/` | 46 specs, including full-fidelity Yardi and MRI import journeys |
| Local Worker E2E | `cloudflare-backend/scripts/local-*-e2e.mjs` | 37 bespoke harnesses, one npm script each |
| Production scenarios | `frontend/scripts/prod-*.mjs` | 104 adversarial scenarios. See [PROD-STRESS-PROGRAM.md](./PROD-STRESS-PROGRAM.md) |

### Why bespoke harnesses alongside Playwright

Playwright drives a browser. A large share of what needed verifying had no browser in it: a queue
consumer's retry semantics, an R2 forensic write, a Stripe webhook arriving out of order, a
multipart upload with a NUL byte in the filename.

The `local-*-e2e.mjs` harnesses drive the Worker over HTTP against a real local Supabase, with full
control over the request bytes. They are how the API was tested as an API rather than as the thing
behind a UI.

### The Worker tests run in `workerd`

`cloudflare-backend` uses `@cloudflare/vitest-pool-workers`, so tests execute inside the actual
Workers runtime with real bindings, not Node with mocks. That is why the suite catches things a
Node-based mock never would. It is also why the suite has no coverage percentage:
`@vitest/coverage-v8` is not a declared dependency, because V8 coverage instrumentation is
unreliable under the `workerd` pool. Rather than install a provider to produce a number of doubtful
validity, that suite is reported by pass count only.

### What gets mocked

External boundaries only: Supabase, Stripe, AWS, OpenRouter. Never the function under test, and
never internal business logic. A test that mocks the calculator to assert the calculator's output
tests nothing.

Five suites deliberately hit the **real** OpenRouter API
(`openrouter-real-*.e2e.test.ts`), gated behind an environment flag, because the failure modes that
matter for an LLM integration (a provider returning a subtly different JSON shape, a fallback
silently engaging) do not reproduce against a mock.

---

## Making the suite fast enough to actually run

The Python gate took **~38 minutes** serially, which is long enough that people stop running it
before pushing.

Switching to `pytest -n 12 --dist loadscope` brought it to **6m19s**, roughly 6×. `loadscope`
rather than the default distribution because the suite has expensive module-scoped fixtures, and
scattering same-module tests across workers rebuilds them repeatedly.

**The negative result is the more useful half.** `-n auto` on this 32-core machine is *worse* on
both axes: it raises `MemoryError`, because each worker loads heavy PDF fixtures and 32 copies do
not fit, and it is also **slower** than `-n 12` even when it completes. More parallelism stopped
helping well before the core count.

The flag was deliberately kept **out** of `addopts`, so a developer running a single test with
`--pdb` still gets a serial, debuggable session. Speed for the full run, sanity for the single one.

Verification of that change also surfaced a latent `HealthCheck.too_slow` flake in a Hypothesis
suite, which was fixed rather than suppressed.

---

## CI, honestly

`.github/workflows/ci.yml` is **`workflow_dispatch` only**. The `pull_request` and `push` triggers
are present in the file, commented out, with a note saying how to re-enable them.

This was a solo project on a free tier, and the full gate is expensive. The suites were run locally
before merges instead. That is a real tradeoff with a real cost, and a green "build passing" badge
on this repository would misrepresent it. That is why [the README](../README.md) carries an
orange `CI: manual dispatch` badge instead.

The workflow itself is not a stub. Eight jobs:

```text
detect-changes ──┬── api-client-check ──┐
                 ├── frontend-tests     ├── ci-success
                 ├── marketing-tests    │
                 ├── backend-tests      │
                 └── performance-benchmarks
```

`detect-changes` diffs against the base SHA and emits five booleans, with a `shared_pattern` that
forces **everything** to run when `CLAUDE.md`, `design-tokens.json`, or the workflow itself changes,
because those affect every project. `ci-success` aggregates and treats `skipped` as passing,
which is the correct behaviour for a `needs`-based branch-protection gate when jobs are
conditionally skipped.

### The job worth copying: `api-client-check`

The frontend's API client is generated from the backend's OpenAPI spec. Generated code that can
drift from its source is a class of bug that reappears forever.

This job regenerates the client and **fails on any `git diff`** in
`frontend/src/api/generated/`. Its failure output is roughly 40 lines and distinguishes the three
causes: the backend changed and the spec was not regenerated; the spec changed and the client was
not regenerated; or someone hand-edited generated files. Each gets its own remediation command.

A check that says "generated files are out of date" wastes the reader's time. A check that says
which of three things happened and what to run does not.

---

## Gates beyond the test suites

Pre-commit (`.pre-commit-config.yaml`) is scoped by path: black, isort, and ruff on `^backend/`;
prettier, eslint, and a full `npm run build:dev` on `^frontend/src/`. A custom hook
(`.githooks/check-marketing-context.sh`) fires when product routes change, forcing the feature
inventory documentation to stay in step with what actually shipped.

Several standalone gate scripts in `scripts/` exit non-zero on violation:

- **`marketing-copy-gate.mjs`** blocks internal vocabulary from reader-visible copy. It is more
  careful than it needs to be: it deliberately does **not** scan `.ts`/`.tsx` for `tofu`/`mofu`/`bofu`,
  because those are legitimate SEO cluster identifiers in code, and it skips frontmatter taxonomy
  keys. A linter with false positives gets disabled.
- **`check-public-knowledge.mjs`** enforces that four generated artifacts match their source.
- **`generate-plan-tiers.mjs`** makes pricing single-source: one `plan-tiers.json` feeds backend
  billing, the frontend, and the marketing pricing page.
- **`cloudflare-env-runner.mjs`** refuses to build the frontend unless the production Vite variables
  are present, so a misconfigured build fails at build time rather than shipping a bundle pointed
  at the wrong API.
- Design tokens flow from one `design-tokens.json` into both `frontend/src/generated/tokens.css`
  **and** `backend/app/services/email/tokens.py`, so transactional email styling cannot drift from
  the application's.

---

## Fixing three time-dependent tests

Three tests asserted a promotional offer and a trial window that have since passed, and failed on a
fresh run in August 2026. They were fixed by pinning the clock (via the application's own
injectable `clock` dependency where one existed, and `vi.useFakeTimers()` where it did not) so they
keep exercising the live-offer path rather than silently flipping to assert the expiry path. The bug
was in the tests: the expiry behaviour they started asserting was correct.
