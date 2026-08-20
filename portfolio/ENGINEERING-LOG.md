# Engineering log

Eleven defects found and fixed, selected from 93 audit cycles. Each is real and each shipped.

Two security defects (the cross-tenant `audit_log` leak and the XLSX sparse-grid DoS) are written
up in [SECURITY.md](./SECURITY.md) instead, and summarized at the bottom of this page.

> [!NOTE]
> **How to check these.** Every entry ends with a **Where it lives** line pointing at the file and
> line in this tree. That is the citation you can open. The commit SHA beside it refers to the
> private development history and will not resolve here; it is quoted because the working ledgers
> under `docs/goal-*/` cite the same SHAs. See [METRICS.md](./METRICS.md#provenance).

---

## 1. The engine silently ignored configured pool splits

**Symptom.** None. Correct-looking invoices with wrong totals.

**Root cause.** A landlord could configure a `pool_allocations` split ("route 40% of CAM-Shared
into Parking"), and the UI saved it, the database stored it, and the reconciliation engine **never
loaded it**. The Worker read `pool_mappings` and stopped there.

**Why it was invisible.** No error, no warning, no null. The calculation ran to completion and
produced a plausible number. Only a landlord who independently recomputed their own reconciliation
would have noticed.

**Blast radius.** Not cosmetic relabeling. Real dollars, because the destination pool may be
excluded by the lease. A 40% split of a $1,000 entry into a pool the lease excludes should reduce
recovery to **$600**. The engine billed **$1,000**.

**The fix.** Ported the reference implementation's split fan-out, including largest-remainder penny
pinning so the slices sum exactly to the source entry.

**What prevents recurrence.** Five regression tests, **RED-proven**: temporarily forcing
`poolAllocations = []` made three of them fail with `1000.00 != 600.00`. A test that has never been
observed failing is not yet evidence.

**Where it lives.** Allocations load in
[`adapters/db/reconciliation.ts:1009`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1009)
(`loadCalculationPoolAllocations`) and fan out in
[`domain/reconciliation/calculator.ts:584`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L584),
with the sign guard at line 604. Commit `10614134e`.

---

## 2. `parseMoney` was fail-open, and `NaN` reached the database

**Symptom.** Found in **live production**, not in a test.

**Root cause.** `billing-parser.ts parseMoney` called `new Decimal(normalized)` with no numeric
contract. `Decimal` happily accepts a range of literals that are not money.

**Why it was invisible.** The guard immediately after was `amount.lte(0)`, and **every comparison
with `NaN` is false**, so `NaN` passed the "must be positive" check. Postgres then accepts
`'NaN'::numeric` as a legitimate value. Two systems each behaved reasonably; the composition was a
hole.

**Reproduced over production HTTP, with read-back:**

| Input | Result |
|---|---|
| `billed_amount: "NaN"` | **HTTP 200**, echoed and **persisted** as `NaN` |
| `"1e3"` | accepted as `1000.00` |
| `"0x10"` | accepted as `16.00` |
| `"0b101"` | accepted as `5.00` |
| `"Infinity"` | HTTP 500 |

**Blast radius.** A persisted `NaN` poisons every downstream aggregate: billed totals, variance
comparisons, reconciliation deltas. `NaN` propagates rather than erroring, so the corruption
spreads silently. The same gap in `rent-roll/parser.ts decimalValue` poisoned the **pro-rata
denominator**, which scales every tenant's share of every pool.

**The fix.** Strip decoration and sign, require `/^\d+(\.\d+)?$/` (mirroring the GL parser's
`cleanCurrency`, which already had it right), then re-apply the sign. Handles bare `-` and
parenthesis-negatives. A follow-up cycle closed a remaining parity gap on the Unicode minus sign
(U+2212).

**What prevents recurrence.** `parser-money-integrity.test.ts`, 16 cases. The engine's own
[`money.ts`](../cloudflare-backend/src/domain/reconciliation/money.ts) already enforced this
contract; the bug was that a second, older parser did not.

**Where it lives.** The guard is
[`actual-billed/billing-parser.ts:355`](../cloudflare-backend/src/domain/actual-billed/billing-parser.ts#L355),
enforced at line 378, and
[`rent-roll/parser.ts:573`](../cloudflare-backend/src/domain/rent-roll/parser.ts#L573). The
U+2212 normalization added later sits at line 366 and line 564 of the same two files. Commits
`f1e78e047` and `8b2318a29`.

---

## 3. Rounding each slice separately manufactured a cent per GL entry

**Symptom.** Totals off by small amounts that grew with file size.

**Root cause.** When two pool mappings on one GL account summed to less than 100% (say 50% and 30%),
each slice was rounded independently:

```text
round(5¢ × 0.50) + round(5¢ × 0.30) = 3¢ + 2¢ = 5¢
round(5¢ × 0.80)                    = 4¢          ← correct
```

A same-signed phantom cent, created **per GL entry**.

**Why it was invisible.** One cent looks like a rounding artifact. The error accumulates linearly:
500 small entries produce **$5.00 of operating expense that does not exist**, which then flows
through gross-up, then pro-rata, then into tenant recovery, amplified at each step.

**The fix.** Restructured `aggregatePools` into two phases: compute `target = round(entry × Σalloc)`
first, then pin the final slice to `target − Σprior`. Added a sign guard so a misconfigured >100%
split cannot manufacture an opposite-sign pool. Proven byte-identical for the full-split case, so
existing correct data was unaffected.

**Where it lives.**
[`domain/reconciliation/calculator.ts:429`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L429)
(`aggregatePools`). The target is computed at line 567, the final slice pinned at line 574, and the
sign guard runs at lines 575-580. Commit `77eb5572e`.

---

## 4. An impossible date rolled forward and changed the money: Cycle 4C

**Symptom.** `period_start=2025-02-30` returned **HTTP 202**, the job completed, and the period was
silently stored as `2025-03-02`.

**Root cause.** Three reconciliation schemas validated dates with a shape-only regex,
`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, which accepts `2025-02-30`, `2025-04-31`, and
`2025-13-01`. JavaScript's `new Date("2025-02-30")` rolls forward two days before the value reaches
the `$3::date` bind.

**Why it mattered.** Period start and end are the denominator for every proration and occupancy
day-count in the calculation. A two-day shift changes every day-weighted figure: wrong dollars,
returned with a 202 and no error.

**The disproof step.** The obvious explanation was Postgres coercion, so that was tested directly:
`SELECT '2025-02-30'::date` **errors**. Postgres was innocent. `new Date("2025-02-30")` returns
exactly `2025-03-02`, matching the observed value. The mechanism was pinned rather than assumed.

Also surfaced: `2025-13-01` was being rejected only *incidentally*, by a lexicographic
`.refine(end > start)` that happened to catch it. Nothing validated the month.

**The fix.** `z.string().date()`, which the lease schemas in the same codebase already used
correctly. Filed as a decision-gated change rather than hot-patched, because it alters which
requests are accepted.

**Where it lives.** One shared definition at
[`http/reconciliation-routes.ts:78`](../cloudflare-backend/src/http/reconciliation-routes.ts#L78),
consumed by all three schemas at lines 82, 97, and 103. Commit `a681f2af5`.

---

## 5. Out-of-order Stripe webhooks permanently canceled paying customers

**Symptom.** Rare, unreproducible loss of subscription access.

**Root cause.** Stripe delivers webhooks **at least once with no ordering guarantee**. All four
subscription-mutating writes did an unconditional
`UPDATE … WHERE stripe_subscription_id = $1`. A redelivered, stale `subscription.deleted` arriving
after a newer `active` overwrote the good state.

**Blast radius, both directions.** A paying customer permanently canceled: lost revenue and a
support incident. The inverse, a stale `active` after a real cancellation, resurrects a canceled
subscription. Unpaid access.

**The fix, migration-first.** Added a nullable `subscriptions.stripe_event_ts timestamptz` (a
metadata-only `ADD COLUMN`, no table rewrite, no lock, inherits existing RLS). Threaded Stripe's
`event.created` through as a **high-water mark** and guarded each write:

```sql
and (stripe_event_ts is null
     or $N::timestamptz is null
     or $N::timestamptz >= stripe_event_ts)
```

Only the `on conflict do update` branch is guarded, so checkout INSERTs always apply.

**Verified against live Postgres** with a predicate probe covering all four cases: stale skips,
newer applies, equal applies, null fails open, plus a temp-table replay of an out-of-order
sequence.

**Where it lives.** The column is added in
[`supabase/migrations/20260629000000_add_subscription_stripe_event_ts.sql`](../supabase/migrations/20260629000000_add_subscription_stripe_event_ts.sql).
The guard appears four times in
[`adapters/db/stripe-webhooks.ts`](../cloudflare-backend/src/adapters/db/stripe-webhooks.ts#L121):
lines 121, 148, 181, and 199, once per subscription-mutating write. Commit `74275663a`.

---

## 6. The status mapper's `default` branch handed out free access

**Symptom.** A live paywall bypass.

**Root cause.** `mapSubscriptionStatus` ended with `default: return "active"`. Stripe's
`incomplete` status (a subscription whose payment is pending 3-D Secure) therefore granted full
premium access, as did `incomplete_expired`, as would any status Stripe adds in future.

**Live trigger.** A checkout that fails 3-D Secure creates the subscription with
`status=incomplete` and fires `customer.subscription.created`. A user who abandoned payment got the
product.

**Why this one is the most interesting.** **The Python reference implementation has the identical
`default → active` bug, and still does.** Parity was perfect. Both were wrong. Matching the
reference would have preserved the vulnerability, which is exactly the failure mode the project's
stated mandate warns about (see [ORACLE.md](./ORACLE.md)). It was left in place deliberately: the
Python side is not deployed, and an oracle edited to agree with the implementation it is supposed
to check is worth nothing. You can read the two side by side.

**The fix.** Each status researched individually rather than mapped by analogy. `incomplete` is
*recoverable*, so it maps to `past_due` (denies access, stays recoverable). `incomplete_expired` is
terminal, so it maps to `canceled`. Anything unrecognized **fails closed** to `past_due`.

**Where it lives.** Fixed:
[`http/stripe-webhook-routes.ts:1336`](../cloudflare-backend/src/http/stripe-webhook-routes.ts#L1336),
`incomplete` at line 1346, `incomplete_expired` at line 1352, and the fail-closed `default` at line
1356. Still fail-open, by design:
[`backend/app/api/routes/webhooks.py:998`](../backend/app/api/routes/webhooks.py#L998), whose
`status_map` has no `incomplete` key at all, so line 1008 returns `"active"` for it. Commit
`35d96fec9`.

---

## 7. Telemetry ordering could drop queued jobs

**Symptom.** Five pre-existing test failures on a clean checkout.

**Root cause.** A prior commit had sequenced best-effort Sentry reporting
(`executionContext.waitUntil(captureWorkerException(...))`) **before** `rawMessage.retry()` in the
queue consumer's catch block. On a durable job queue, a throwing `waitUntil` would skip the retry
*and* escape the consumer, aborting the remainder of the batch and dropping every job in it.

**How it was found.** Five `extraction-workflow.test.ts` failures existed on clean `HEAD`, verified
by `git stash`. The tests were right; the code was wrong.

**The fix.** Retry first, telemetry second and wrapped in its own `try`/`catch`, with the reasoning
committed as a comment at the call site: see
[`queues/consumers.ts`](../cloudflare-backend/src/queues/consumers.ts).

**What prevents recurrence.** The five pre-existing tests now serve as resilience regressions, plus
two new ones.

**Where it lives.**
[`queues/consumers.ts:192`](../cloudflare-backend/src/queues/consumers.ts#L192) is the comment;
the retry it protects is the next statement, at line 197, with the telemetry after it inside its own
`try`/`catch`. Commit `04e6dffe0`.

---

## 8. A `Date` where a string was declared silently dropped a customer email

**Symptom.** Landlords stopped receiving reconciliation-complete notifications. Nothing logged.

**Root cause.** `getSnapshot` used a bare `select *` with no `::text` cast, so the `porsager/postgres`
driver decoded `date` and `timestamptz` columns into JavaScript `Date` objects, violating the
`ReconciliationSnapshotRecord` type, which declares them as `string`. TypeScript could not catch it:
the type was a lie told at the driver boundary.

**Two consequences, one silent.** The finalize handler calls `period_start_date.slice(0, 4)` to
build the email URL. `.slice` on a `Date` throws a `TypeError`, which the handler's `swallow()`
discarded. **The notification was dropped with no trace.** Separately, the snapshot detail endpoint
serialized `"2026-01-01T00:00:00.000Z"` instead of the contract's `"2026-01-01"`.

**The fix.** Coerce the four fields in `normalizeSnapshotJsonFields`, gated on `value instanceof
Date` so it is idempotent. Scope was bounded accurately: the export and PDF read paths already
`::text`-cast and never had the bug.

**What prevents recurrence.** The class was swept exhaustively across three later cycles
(`::text` casts on GL amounts, the comparison repository, and cap-bank `tenant_share_before_cap`),
and the engine's own `dayString()` helper is the permanent in-engine backstop. That helper predates
this fix, which is the point worth noticing: the engine layer was already defended, and the bug lived
one layer out, in the repository that fed it.

**Where it lives.** The coercion is
[`adapters/db/reconciliation.ts:1628`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1628)
(`normalizeSnapshotJsonFields`), four fields at lines 1643-1652. The backstop is
[`domain/reconciliation/calculator.ts:1660`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L1660).
Commit `bcfcb9eb6`.

---

## 9. Closing the opaque-500-on-hostile-input class: Cycles 8-10

Not one bug. A four-cycle arc that closed a **class** of defect at three separate SQLSTATEs, each
fixed at both the parse boundary and the database boundary.

| SQLSTATE | Trigger | Fix |
|---|---|---|
| **22003** numeric overflow | An amount larger than `NUMERIC(14,2)` returned 500 | Parse-time guards (`domain/core-data/numeric-14-2.ts`) **plus** a DB-boundary net (`adapters/db/numeric-overflow-error.ts` → 422), so columns with no per-field guard are covered too |
| **22P02** invalid text | `z.coerce.number().int().min(0)` accepts floats ≥ 1e21; `String(1e21)` is `"1e+21"`, which the driver passes verbatim into `OFFSET` and Postgres rejects | `.max(Number.MAX_SAFE_INTEGER)` on every offset param, with the arithmetic shown: `(MSI−1) × 100 ≈ 9.0e17 < int8max`, so the `(page−1) × size` product is safe too |
| **22001** string truncation | Over-length GL text 500'd the entire import | DB net (`StringTooLongError` → 422), plus a parse-time GL guard whose widths are read **from the migration**, naming the exact row and field before any write |

Only the exponent-notation band produced the 22P02: values in `[int8max+1, <1e21)` stringify
plainly and were already caught as 22003. That distinction was worked out rather than guessed.

Proven live, each with a control: `base_year_amount = 9999999999999.99` on a route with **no** parse
guard returned **422 `numeric_out_of_range`** while a control `125000.00` returned 201; a 51-char
`account_code` returned **422 `gl_field_too_long`** while an exactly-50-char control passed.

A shared `readMultipartForm` guard was applied to all 8 upload call sites, since
`c.req.formData()` throws a `TypeError` on a JSON body: previously a 500, now a 400.

**Documented caveat, recorded rather than hidden:** a future *in-SQL* arithmetic overflow would be a
genuine server bug wrongly downgraded to 422, and would skip Sentry. The note says to revisit before
adding computed-numeric writes.

**Where it lives.** This one is an arc, not a commit, so it has four:

| Piece | Location | Commit |
|---|---|---|
| Parse-time `NUMERIC(14,2)` guard | [`domain/core-data/numeric-14-2.ts:27`](../cloudflare-backend/src/domain/core-data/numeric-14-2.ts#L27) | `61d05a1fd` |
| 22003 net, and its HTTP mapping | [`adapters/db/numeric-overflow-error.ts:22`](../cloudflare-backend/src/adapters/db/numeric-overflow-error.ts#L22) → [`http/errors.ts:58`](../cloudflare-backend/src/http/errors.ts#L58) | `61d05a1fd` |
| 22P02 offset cap, with the arithmetic in the comment above it | [`http/reconciliation-routes.ts:91`](../cloudflare-backend/src/http/reconciliation-routes.ts#L91), and three sibling route files | `d318259b6` |
| 22001 net and the shared multipart guard | [`adapters/db/string-truncation-error.ts:24`](../cloudflare-backend/src/adapters/db/string-truncation-error.ts#L24), [`http/multipart.ts:13`](../cloudflare-backend/src/http/multipart.ts#L13) | `0e4253265` |

The caveat itself is [`adapters/db/postgres.ts:68`](../cloudflare-backend/src/adapters/db/postgres.ts#L68).

---

## 10. A local copy of a shared rule drifted and opened the paywall

**Root cause.** `hasTaxProtestAccess` used a **file-local** `effectiveSubscriptionStatus` helper
that returned `"trialing"` for any trialing row, ignoring whether `stripe_subscription_id` was
null. An expired card-less trial (`status=trialing`, `stripe_subscription_id=null`,
`current_period_end` in the past) therefore bypassed the paywall on `POST /tax-protest/generate`.

The local copy had also acquired a non-canonical 7-day `past_due` grace period that no other gate
honoured. Two gates, two different definitions of "paying customer."

**The fix.** Mirrored the canonical logic from `billing.ts` and `exports.ts` verbatim, including
the driver's `string | Date | null` decode branch (see #8, the same footgun).

**What prevents recurrence.** Less than it should, and this is the weakest entry on the page. A
parity note sits at the gate that broke, naming the other two as canonical. The other two carry no
reciprocal note, so someone editing `billing.ts` still has nothing pointing at the copy in
`tax-protest.ts`. Documentation as a guard rail is already weaker than a shared function; a note
that only points one way is weaker again. Extracting a single shared helper was the correct fix and
was not done.

**Where it lives.** The gate is
[`adapters/db/tax-protest.ts:388`](../cloudflare-backend/src/adapters/db/tax-protest.ts#L388)
and its parity note is at line 431. The canonical implementations it now mirrors are
[`adapters/db/billing.ts:1083`](../cloudflare-backend/src/adapters/db/billing.ts#L1083) and
[`adapters/db/exports.ts:715`](../cloudflare-backend/src/adapters/db/exports.ts#L715). Commit
`6e725510c`.

---

## 11. One rounding mode out of step, one cent low

**Root cause.** `calculateDependentTotalRecovery` recomputed `total_recovery` after a manual cell
override using `ROUND_HALF_EVEN`, while the entire calculation and billing layer uses
`ROUND_HALF_UP`.

**Why it was reachable.** `cellUpdateSchema` validates with `/^\d+(\.\d+)?$/`, which accepts **any**
number of decimal places. A sub-cent override can land exactly on a half-cent (the one input where
the two rounding modes disagree), and `HALF_EVEN` stored a total **one cent below** the engine's
convention, under-billing the landlord.

**How "correct" was decided.** This is a TypeScript-only feature with no counterpart in the Python
reference, so there was no oracle to consult. Correctness was defined as consistency with the
engine's own documented convention.

**Verification.** Review confirmed every remaining `HALF_EVEN` in the codebase is either display/PDF
formatting or deliberate pandas-parity in ingestion, different layers with different, correct
conventions.

**Where it lives.**
[`adapters/db/reconciliation.ts:1196`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1196)
(`calculateDependentTotalRecovery`); the rounding mode is line 1229, with the reasoning in the
comment above it. Commit `caa82298e`.

---

## Also fixed

| Defect | Commit |
|---|---|
| Cross-tenant `audit_log` leak, `audit_requests` twin, and 42P17 recursion → [SECURITY.md](./SECURITY.md) | `666a0d914` |
| XLSX sparse-grid DoS, CWE-400 → [SECURITY.md](./SECURITY.md) | `95e529165` |
| CSV/XLSX formula injection (CWE-1236) across every export surface | `74c391ec1` |
| Rent-roll parser accepted a bad row at preview, then 400'd the whole file at import | `e8697cab8` |
| A missing ZDR provider config on one LLM call site | `ece55989c` |
| PDF exports blanked the calculation trace across **three** call sites: a two-of-three fix would have shipped the tenant PDF still broken | `94c9f97db` |
| GL file-hash dedupe scoped to org instead of property, blocking a legitimate second import | `2904624a5` |
| A NUL byte in an uploaded filename 500'd `POST /documents/upload` | `61d05a1fd` |
| `DELETE /export/history/:id` used a party-only guard, admitting the read-only `viewer` role to a destructive delete that also removed the R2 object | Cycle 9B |

---

## What the pattern says

Nine of these eleven produced **no error at all**. No exception, no log line, no failing assertion:
a plausible number, a 200 response, a missing email. The defects that cost real money in a financial
system are not the ones that crash.

That is the argument for the two techniques this project leaned on hardest: a
[second implementation to disagree with](./ORACLE.md), and
[adversarial scenarios run against production state](./PROD-STRESS-PROGRAM.md). Neither is cheap.
Both find things that a green test suite cannot.
