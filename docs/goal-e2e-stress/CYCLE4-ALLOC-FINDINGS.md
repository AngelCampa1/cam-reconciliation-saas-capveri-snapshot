# Cycle 4 — Pool Allocation & Gross-Up Penny-Parity Findings

Scope: largest-remainder penny distribution + pool gross-up only.
Oracle (read-only source of truth):
- `backend/app/services/calculation/pool_allocation.py`
- `backend/app/services/calculation/occupancy.py`, `gross_up.py`
TS under test: `cloudflare-backend/src/domain/reconciliation/calculator.ts`
Scratch specs (left in place): `cloudflare-backend/src/test/_scratch_c4_alloc_*.test.ts`

---

## CONFIRMED DIVERGENCE #1 — `pool_breakdowns` can contain NEGATIVE per-pool recovery (HIGH)

**Severity:** HIGH (financial correctness — a per-pool recovery line goes negative,
i.e. the engine reports a *credit* on a pool that actually incurred positive
recoverable expense; the oracle never does this).

**TS file:line:** `cloudflare-backend/src/domain/reconciliation/calculator.ts:657-692`
(`allocatePoolBreakdowns`, specifically the last-pool remainder at lines 676-678:
`index === recoverablePools.length - 1 ? totalRecovery.toCents() - allocatedCents : divideRounded(...)`).

**Oracle file:line:** `backend/app/services/calculation/pool_allocation.py:76-104`
(`_largest_remainder`) as used by `allocate_pool_recoveries` (96-104, 180, 206-223),
wired into the snapshot's `pool_breakdowns` via
`backend/app/services/calculation/tenant_share.py:744-751`.

**Exact input (reproduced through the real engine `calculateReconciliationSnapshots`):**
- 8 expense pools, each booked $1.00 (operating, not gross-up-applicable), equal weight.
- Lease: `pro_rata_share = 0.00000125`, `admin_fee_percentage = 0`, `cap_type = none`,
  no exclusions → `total_recovery = $0.05` (5 cents) spread across 8 equal pools.

**Oracle expected (arithmetic):** `_largest_remainder(5, [w,w,...8x])`:
floor of `5*1/8 = 0.625` → `0` for every pool; `remainder = 5 - 0 = 5`; the 5
leftover cents go to the 5 largest fractional remainders (all equal → lowest
indices) → parts `[1,1,1,1,1,0,0,0]`. **Every part ≥ 0**, sum = 5. ✓

**TS actual (from run of `_scratch_c4_alloc_adversarial.test.ts`):**
```
n=8 targetCents=5 actualTotal=5 parts=[1,1,1,1,1,1,1,-2] sum=5
```
Each of the first 7 pools rounds its `5*1/8 = 0.625¢` share half-up to `1¢`
(7¢ allocated); the last pool absorbs `5 - 7 = -2¢` → **negative recovery**.
More cases (all confirmed in the same run):
```
n=5  targetCents=3 parts=[1,1,1,1,-1]
n=12 targetCents=7 parts=[1,1,1,1,1,1,1,1,1,1,1,-4]
n=16 targetCents=9 parts=[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,-6]
```

**Root cause:** `allocatePoolBreakdowns` distributes `total_recovery` with
`divideRounded` (round-half-up) per pool and makes the **last pool absorb the
running remainder**. When many pools each round UP, the cumulative over-allocation
exceeds the total and the last pool eats a negative remainder. The Python oracle
deliberately avoids this with the largest-remainder method (floor every part, then
hand out leftover cents to the largest fractional remainders) so **no part is ever
driven below its floor of 0**. The oracle's own `_reduce_pools_to_cap` docstring
(`tenant_share.py:218-224`) calls out this exact failure mode of a "last pool
absorbs the remainder" split. The sum invariant still holds in TS (parts sum to
`total_recovery`), so this is not a lost/created penny — it is a sign/non-negativity
divergence in the per-pool attribution that the oracle guarantees against.

**Note on shape:** beyond non-negativity, the two allocators differ structurally —
the oracle splits `share_after_cap` and `admin_fee` separately and attributes the
cap reduction to controllable pools only (`pool_allocation.py:151-204`), while TS
splits a single `total_recovery` proportionally to gross pool amount. The
demonstrable, unambiguous defect is the negative per-pool value above.

---

## NO DIVERGENCE — `largestRemainder` (TS) vs `_largest_remainder` (oracle)

`cloudflare-backend/src/domain/reconciliation/calculator.ts:385-426` vs
`backend/app/services/calculation/pool_allocation.py:76-104`.

Confirmed equivalent in `_scratch_c4_alloc_lr.test.ts`:
- 10 hand-traced scenarios (incl. `$100/3` → `[33.34,33.33,33.33]` equivalent,
  zero-weights even split, all-weight-one-pool, near-equal 333/333/334,
  $1000 across 10, odd totals, 1¢/5, 7¢/3) — exact match, both conserve pennies.
- 8000-trial fuzz (1–11 pools, totals up to $20,000, weights up to 1e6): TS always
  conserves pennies AND matches the exact-rational oracle on every distribution.

The oracle uses a 28-significant-digit `Decimal` division then `int()` truncation;
TS uses exact integer floor + exact integer remainder. For all realistic inputs
(total ≤ ~1e9 cents, totalWeight ≤ ~1e7) the quotient has far fewer than 28
significant figures, so `int(e)` equals the exact floor and the fractional-remainder
ranking (same denominator) is order-identical to comparing integer remainders.
Tie-break (largest remainder desc, then lowest index) matches exactly. Negative
totals cannot reach either implementation on this path (cap floored at 0).

## NO DIVERGENCE — `capManagementFeePools` multi-pool reduction

`calculator.ts:442-524` vs `tenant_share.py:210-385` (`_reduce_pools_to_cap` /
`_apply_management_fee_cap`). `_scratch_c4_alloc_engine.test.ts` sweeps 400 cap
values with two "Management Fee" pools booked above the cap: the reduced fees sum
**exactly to the cap** and stay non-negative in every case. Name-sorted tie-break
order matches the oracle's `sorted(pool_names)`; dollars-vs-cents weights are
proportionally identical; the `bookedFee <= cap` early-return matches the oracle's
`current_total <= cap or <= 0` guard (cap is always ≥ 0). The only intentional gap
is the oracle's "skip when pool_types unavailable" branch, which has no TS analogue
(every TS PoolTotal always carries a type) — documented in-code, not reachable in
production data.

## NO DIVERGENCE (within documented tolerance) — gross-up safety valve

`grossUpPools` (`calculator.ts:342-372`) vs `gross_up.py` `apply_safety_valve`
(160-235). `_scratch_c4_alloc_adversarial.test.ts` sweeps occupancy 0.01–0.94
(step ~0.0037) × amounts {$0.07, $100, $123.45, $999.99, $1000.03}, hand-computing
the oracle's `quantize4(0.95/occ)` factor and `quantize6(amount/occ)` full-occupancy
cap. No divergence exceeded 1¢ — consistent with the engine's documented
"cents-native vs oracle 6dp, at most sub-cent at the boundary" note
(`calculator.ts:350-354`). Near-vacant (occupancy ≤ 0.0001) keeps the original
amount in both.

---

## Coverage summary

| Area | Method | Result |
|------|--------|--------|
| `largestRemainder` floor + remainder ranking + tie-break | 10 traced cases + 8000 fuzz | MATCH |
| Penny conservation (largest-remainder) | 8000 fuzz | always conserves |
| Pool-breakdown sum invariant | engine sweep n=2..6 × 1500 totals | sum == total_recovery ✓ |
| Pool-breakdown **non-negativity** | engine adversarial | **FAILS — negative last pool (Finding #1)** |
| Mgmt-fee multi-pool cap reduction | engine sweep 400 caps | sums to cap, non-negative |
| Gross-up safety valve | occ × amount sweep | within sub-cent tolerance |
