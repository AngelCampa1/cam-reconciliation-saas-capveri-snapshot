# The production stress program

[`frontend/scripts/`](../frontend/scripts/) holds **104 scenario scripts**. They are not smoke
tests. Each one is a self-contained adversarial experiment that drove the live production API,
created real records, asserted penny-exact expectations computed independently, and cleaned up
after itself.

The program ran for 93 audit cycles across two ledgers
([`docs/goal-e2e-stress/LEDGER.md`](../docs/goal-e2e-stress/LEDGER.md), 82 cycles, and
[`docs/goal-prod-e2e-stress/LEDGER.md`](../docs/goal-prod-e2e-stress/LEDGER.md), 11 cycles) before
converging on a documented "nothing new discoverable" state.

---

## Why production and not staging

A reconciliation engine has a specific property: the interesting bugs need real accumulated state.
A cumulative cap only binds when prior *finalized* snapshots exist. A pool allocation only misbehaves
when persisted splits exist. A date-decode bug only appears when the driver actually round-trips a
Postgres `date` column.

Staging with synthetic data reproduces the code path but not the state, and several of the defects
below were invisible until the scenario first ran and finalized a seed year to build the state the
bug needed.

The tradeoff is that a careless scenario corrupts real data. That is what the discipline rules are
for.

---

## The four discipline rules

### 1. Expected values are computed offline, never echoed

This is the rule that makes the whole program worth anything. A test that asserts
`response.total === response.total` passes forever while the engine is wrong.

Every money assertion is computed by an **independent re-implementation inside the scenario
script**: exact BigInt-cents arithmetic, hand-ported from the engine's own algorithm rather than
imported from it. The scenario knows what the answer should be before it makes the request.

`prod-stress-recon-cap-grossup-torture-scenario.mjs` is 1,294 lines, and a substantial fraction of
that is the offline re-implementation of `money.ts`, `calculator.ts`, and `cumulative-cap.ts`.

### 2. Everything created is marked and cleaned

Every record a scenario creates is prefixed `[PROD-TEST]`. Cleanup runs in a `finally` block and
re-verifies cascade deletion rather than assuming it.

### 3. Scenarios must be able to fail

A test that cannot fail is not evidence. Scenarios assert a control alongside the attack: the
over-length field is rejected **and** the exactly-at-limit field is accepted; the hostile value
422s **and** the valid value 201s. A rule that rejects everything is not a working guard.

### 4. Findings are adversarially disproved before they are reported

A scenario reporting a bug is a hypothesis, not a result. Before a finding was written up, the
program tried to prove it wrong.

---

## A worked example: the date that rolled

The clearest illustration of rule 4.

**The observation.** `POST /reconciliation/calculate` with `period_start=2025-02-30` (a date that
does not exist) returned **HTTP 202**. The job ran to COMPLETED. The stored period had silently
become `2025-03-02`.

Three reconciliation schemas validated dates with a shape-only regex,
`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, which happily accepts `2025-02-30`, `2025-04-31`, and
`2025-13-01`.

**Why it matters.** The period start and end define the denominator for every proration and
occupancy day count in the calculation. Shifting the period by two days shifts every day-weighted
figure. The result is wrong dollars, with a 202 and no error anywhere.

**The disproof attempt.** The obvious explanation is that Postgres coerced the date. So the
scenario tested that directly:

```sql
SELECT '2025-02-30'::date;   -- ERROR: date/time field value out of range
```

Postgres **rejects** it. So Postgres was not the culprit. The next candidate was the JavaScript
driver path before the `$3::date` bind:

```js
new Date("2025-02-30")   // → 2025-03-02
```

That matched the observed value exactly. The hypothesis survived an attempt to kill it, and the
mechanism was pinned to JS `Date` coercion rather than assumed.

**A second finding fell out.** `2025-13-01` was being caught, but only *incidentally*, by a
lexicographic `.refine(end > start)` comparison that happened to reject it. Nothing was validating
the month.

**The fix.** `z.string().date()`, which the lease schemas already used correctly. The bug was an
inconsistency between two parts of the same codebase, not a missing idea.

**It was not hot-patched.** Because the change alters which requests are accepted, it was filed as
a decision-gated item for the operator rather than shipped from the finding.

---

## The harness auditing itself

Cycle 7 found that `tamperJwt()` (the helper that produced "signature is invalid" test tokens)
flipped only the **trailing base64url character** of the signature. For a 64-byte ES256 signature,
that character can carry non-significant padding bits, so the "tampered token must return 401"
assertion could pass against a signature that was *never actually modified*.

A latent false negative in the security test itself. Fixed to XOR a real interior byte, with a
`Buffer.equals` guard that throws if the bytes come back unchanged, so the helper can no longer
silently no-op.

---

## What the scenarios covered

| Scenario | What it drove |
|---|---|
| `prod-stress-recon-cap-grossup-torture-scenario.mjs` (1,294 lines) | Mid-year proration at 260/365 inclusive days, a *binding* cumulative-compounding 5% cap requiring a finalized seed year, admin-fee pool exclusion through the integer-rational path, gross-up at 12.35%/26.59% occupancy against a 0.95 target, and a repeating-decimal pro-rata share to stress the 8-dp parser at every multiplication |
| `prod-stress-rls-authz-isolation-scenario.mjs` (834 lines) | Direct PostgREST probing with a real customer JWT, the path the application never takes, and where the cross-tenant `audit_log` leak was found |
| `prod-stress-cycle07b-export-authz-scenario.mjs` | Seeded a disjoint org B with a real finalized snapshot and R2 object, then probed every export endpoint with org A's JWT, including a **forged HMAC token for org B's real R2 key** |
| `prod-stress-export-formula-injection-scenario.mjs` | CSV/XLSX formula injection across all 8 export paths, byte-decoding the downloaded files |
| `prod-stress-jwt-lifecycle-scenario.mjs` | 10 JWT attacks: expired, `alg:none`, HS256 confusion, bit-flipped signature, forged `role`, forged `is_platform_admin`, swapped `sub`, garbage |
| `prod-stress-cycle10b-resource-exhaustion-scenario.mjs` | Pool exhaustion, numeric overflow, string truncation, oversized payloads |

---

## Convergence

The honest measure of a program like this is not how many bugs it found but whether it stopped
finding them.

Cycles 7 through 10 covered roughly a dozen fresh high-risk domains across four consecutive cycles
and surfaced **zero value-correctness or data-corruption defects**. Everything found was the same
family: an opaque 500 on hostile input where a 4xx belonged, plus one least-privilege gap. That
class was then closed systematically at both the parse boundary and the database boundary. See
[ENGINEERING-LOG.md](./ENGINEERING-LOG.md).

Cycle 3 of the production ledger ran three agents in parallel and came back completely clean:
18/18, 11/11, 12/12, and 49/49 checks, every money figure penny-exact against independent offline
re-implementations, with no value read back from the API.

The ledgers record the end state as *"diminishing returns: N consecutive CLEAN cycles plus a clean
decision-gated backlog"*, explicitly not "zero possible findings." Eighteen items were left open
as decision gates for the operator rather than being auto-resolved, because they were product
judgment calls rather than defects.
