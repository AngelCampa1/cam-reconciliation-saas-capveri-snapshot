# The correctness oracle

The most unusual decision in this codebase: after migrating the reconciliation engine from Python
to TypeScript, the Python implementation was **not deleted**. It was kept, maintained, and
continuously tested as a reference implementation: an executable specification the production
engine is asserted against.

[`backend/`](../backend/) was never deployed after the migration. It exists to be right, and to
prove the thing that *is* deployed is right too.

---

## Why keep it

Rewriting a financial engine across languages has a failure mode that ordinary testing does not
catch. Unit tests written alongside a rewrite encode the author's understanding of the
requirements. If that understanding is wrong, the tests agree with the bug. The suite is green and
the bills are wrong.

A reference implementation breaks that loop. It was written earlier, from the same lease documents,
by a process that had already been exercised against real reconciliations. When the two
implementations disagree on a randomly generated input, exactly one of three things is true:

1. The TypeScript is wrong.
2. The Python is wrong.
3. The specification is ambiguous and both are defensible.

All three are worth knowing. None of them surface from a suite that only tests one implementation
against its own author's expectations.

The cost is real: a second full implementation to keep alive, and a test suite that takes minutes
rather than seconds. For money that a landlord bills to a tenant and a tenant may dispute in court,
that was judged worth paying.

---

## The mandate

The discipline is written down, in [`docs/goal-e2e-stress/HANDOFF.md`](../docs/goal-e2e-stress/HANDOFF.md),
and it cuts both ways:

> **Matching the Python oracle is NOT automatically correct, AND diverging from it is NOT
> automatically a bug.** Adversarially verify every finding against real source before fixing. A
> finder's claim is not auto-true; an oracle divergence is not auto-a-bug.

This is the part that makes the technique useful rather than superstitious. A reference
implementation that is treated as infallible is just a second place for the same bug to live. Each
divergence had to be *adjudicated* (researched against lease language, accounting practice, and
what the number would actually do to a bill), and the ruling written down with its reasoning.

---

## How parity is enforced

21 property-based suites under
[`backend/tests/stress/`](../backend/tests/stress/), all named `*_oracle_stress.py`, built on
Hypothesis. Each generates inputs across a domain and asserts the two implementations agree to the
penny.

```text
test_admin_fee_cap_oracle_stress.py             test_orchestrator_gross_up_factor_oracle_stress.py
test_admin_fee_ti_exclusion_oracle_stress.py    test_orchestrator_total_recovery_oracle_stress.py
test_billing_parser_precision_oracle_stress.py  test_pool_aggregator_persisted_splits_oracle_stress.py
test_cap_bank_ledger_oracle_stress.py           test_pool_aggregator_splits_oracle_stress.py
test_denominator_change_impact_oracle_stress.py test_pool_allocation_admin_fee_oracle_stress.py
test_denominator_rsf_percent_oracle_stress.py   test_pool_allocation_cap_spill_oracle_stress.py
test_expense_stop_orchestrator_oracle_stress.py test_proration_pool_allocation_oracle_stress.py
test_fixed_cam_modeler_oracle_stress.py         test_tenant_share_base_year_oracle_stress.py
test_hcad_tax_normalizer_oracle_stress.py       test_tenant_share_cap_pool_oracle_stress.py
test_leakage_breakdown_pct_oracle_stress.py     test_tenant_share_multipool_oracle_stress.py
test_management_fee_cap_oracle_stress.py
```

Property-based testing is the right tool here because the interesting failures live at boundaries
nobody writes an example for: a half-cent, a zero base, a lease that starts on December 31, a
repeating-decimal pro-rata share, a pool that nets negative. Hypothesis finds those and shrinks
them to a minimal reproduction.

> [!NOTE]
> This is differential testing against a reference implementation. It is **not** formal
> verification, and this repo does not claim to be verified.

---

## The adjudicated divergences

Cases where the TypeScript deliberately disagrees with the reference. Each is annotated in the
engine source with the reference implementation's file and line, and the financial consequence.

### 1. A reported total that actually ties out

[`calculator.ts:305`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L305)

The reference implementation stores `grossed_up_expenses` as the figure *before* the management-fee
cap is applied, but bills off the post-cap base. Its own statement therefore does not reconcile: it
reports `115,000 × 0.10 = 11,500` while billing `10,700`. A tenant checking the landlord's
arithmetic finds a discrepancy that is not actually an overcharge, which is worse than useless,
because it triggers a dispute over a correct bill.

CapVeri reports the post-cap recoverable, so `grossed_up_expenses × pro_rata == tenant_share_before_cap`
holds. **Only the reported field diverges. Recovery dollars are penny-identical.**

**Ruling: TypeScript is correct.** A statement line item that does not tie to the amount billed is
a defect in the statement.

### 2. Integer-rational admin-fee ratio

[`calculator.ts:1019`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L1019)

When pools are excluded from the admin-fee base, the fee is scaled by an inclusion ratio. The
reference computes it as `Decimal(str(included / total))`: a **Python float division** truncated to
~17 significant digits, then rounded again when applied. Two roundings, the first in binary
floating point.

CapVeri does the arithmetic in exact integer cents:

```text
round_half_up(share_cents × included_cents / total_cents)
```

In roughly one in 10^5 exclusion cases the reference lands a cent low.

**Ruling: TypeScript is correct.** The reference introduces a float where none is needed.

### 3. Property-level gross-up target

[`calculator.ts:197`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L197)

A landlord can configure `properties.target_occupancy`. Neither implementation originally honoured
it, for two different reasons:

- The earlier Worker code took the alphabetically-first pool's `gross_up_target` and applied it to
  every pool, silently overriding a configured 0.90 with an auto-stamped 0.95.
- The reference reads `property_data.get("gross_up_target", "0.95")`: a column that lives on
  `expense_pools`, not on the property. The lookup always misses and always falls back to the
  default.

A 30-line comment documents both. The Worker now honours the configured property-level target.

**Ruling: both implementations were wrong; TypeScript was fixed.**

### 4. Stripe status mapping: where the reference carries the same bug

The clearest demonstration of why "matching the oracle" is not the goal.

`mapSubscriptionStatus` had a `default` branch returning `"active"`, so Stripe's `incomplete`
status (a subscription whose payment is pending 3-D Secure) granted full premium access. So did
`incomplete_expired`, and so would any status Stripe adds in future.

**The Python implementation has the identical `default → active` bug.** Parity was perfect. The
behaviour was wrong in both.

Each status was researched individually rather than mapped by symmetry: `incomplete` is
*recoverable*, so it maps to `past_due` (denies access, stays recoverable); `incomplete_expired` is
terminal, so it maps to `canceled`; anything unknown **fails closed** to `past_due`.

**Ruling: diverge. The reference was not matched.** Full write-up in
[ENGINEERING-LOG.md](./ENGINEERING-LOG.md).

### 5. Gross-up exemption by pool type

Tax, insurance, and capital pools are never grossed up in the TypeScript engine, regardless of the
`is_gross_up_applicable` flag stored on the row. The reference honours the flag.

The divergence exists because three separate Worker write paths default that flag to `true` with no
coupling to pool type. Honouring it faithfully would over-bill on mis-flagged data. Guarding by
pool type in the engine fixes every existing row without a data migration.

**Ruling: diverge, with the reasoning recorded at the guard.**

---

## What this bought

Two things that are hard to get any other way.

**Bugs that unit tests structurally cannot find.** The phantom-cent GL split and the ignored
`pool_allocations` splits both produced *plausible* numbers. No assertion failed, no error was
raised, no invariant was obviously violated. They were found because a second implementation
produced a different number for the same input.

**A documented reason for every place the two disagree.** When a divergence is adjudicated and the
ruling is written at the call site with the reference's file and line, the next person to read that
code does not have to re-derive the decision, or worse, "fix" it back.

The reference implementation is still in this repository, still tested, still disagreeing in
exactly five documented places.
