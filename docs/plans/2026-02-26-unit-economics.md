# Unit Economics: Annual Package Model

*Created: 2026-02-26*
*Updated: 2026-06-02 - Replaced retired per-building and credit-pack assumptions with annual-only package pricing.*
*Status: Pre-revenue estimates - no live customer data yet.*

---

## Current Pricing Inputs

CapVeri self-serve pricing is annual only. Customers get a 30-day free trial with no credit card required, and the first annual payment has a 30-day money-back guarantee.

| Package | Annual list price | 80OFF first-year price | Included capacity |
|---------|-------------------|-----------------------|-------------------|
| Reconcile | $4,990/year | $998/year | Up to 50 active rentable units |
| Control | $4,990/year | $998/year | Up to 250 active rentable units |
| Defend | $4,990/year | $998/year | Up to 500 active rentable units |
| Enterprise | Custom | Custom | Above 500 active rentable units or 50 buildings |

Enterprise is excluded from these estimates until deal data exists.

---

## Working LTV Formula

```text
ARPA = weighted average annual contract value
Gross margin = ARPA - annualized variable cost
Retention-adjusted LTV = gross margin x expected retained years
```

Monthly churn can still be tracked as a retention metric, but it is not a billing option and should not be used to describe customer-facing pricing.

---

## Pre-Revenue Scenarios

| Scenario | Tier mix assumption | 80OFF first-year ARPA | Expected retained years | Estimated LTV before expansion |
|----------|---------------------|---------------|-------------------------|--------------------------------|
| Conservative | 80% Reconcile, 20% Control | $4,944/year | 1.7 years | $8,405 |
| Base | 50% Reconcile, 40% Control, 10% Defend | $7,870/year | 2.5 years | $19,675 |
| Upside | 25% Reconcile, 50% Control, 25% Defend | $10,932/year | 3.5 years | $38,262 |

These estimates are placeholders for planning. Replace them with actual cohort data after launch.

---

## Metrics To Track

| Metric | Why it matters |
|--------|----------------|
| Trial-to-paid conversion rate | Proves whether the 30-day trial shows enough value. |
| Refund rate during guarantee window | Measures whether the money-back guarantee is being used as expected. |
| Tier mix | Shows whether customers cluster by selected Reconcile unit count. |
| Logo retention by cohort | Separates seasonal CAM usage from true cancellation risk. |
| Expansion from package upgrades | Tracks movement into larger Reconcile unit counts. |
| Time to first reconciliation | Measures whether customers reach value before the trial ends. |

---

## Revision Triggers

Update this model when any of these happen:

- 20 paying customers complete their first annual billing cycle.
- 80OFF ends or a new public offer replaces it.
- The included unit limits change in `plan-tiers.json`.
- Refund rate during the 30-day guarantee window exceeds 10%.
- Enterprise pricing becomes standardized enough to model.
