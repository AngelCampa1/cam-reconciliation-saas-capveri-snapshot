# Cycle 4 — Caps & Cap-Bank-Ledger Penny-Parity Findings

Scope: CAPS and the CAP-BANK LEDGER only. Oracle = `backend/app/services/calculation/caps.py`
and `backend/app/services/calculation/cap_bank_ledger.py`. TS under test =
`cloudflare-backend/src/domain/reconciliation/{cumulative-cap.ts, cap-bank-ledger.ts, calculator.ts}`.

## Result: ZERO confirmed divergences.

After a genuine multi-year, half-cent-boundary, bank-accrue-then-drawdown sweep across all
cap modes — each scenario run on the live TS engine AND hand-traced through the Python oracle
source (re-verified by executing the oracle arithmetic in Python 3.13) — every value matched
penny-for-penny.

## What was covered

### Live money engine path (the one that actually caps reconciliation dollars)
`calculator.ts::applyCap` → `cumulativeEffectiveMaxMoney` in `cumulative-cap.ts`. This is the
SOLE live path for cumulative / cumulative_compounding caps (engine
`cloudflare-reconciliation-v1`). It deliberately does NOT reuse `simulateCapBank`.

**cumulative (linear), `calculate_cumulative_cap` caps.py:203-395**
- A: base 100000, 5%, priors [102000, 108000] (bank accrues 3k→2k, then year-4 cap). Oracle
  `q(100000*0.05)=5000`; running bank loop → 2000; `q(108000+5000+2000)=115000.00`. TS = `115000.00`. ✓
- B: base 12345.67, 5%, year 1. `q(12345.67*0.05)=q(617.2835)=617.28`; `q(12345.67+617.28)=12962.95`. TS = `12962.95`. ✓
- C: base 10000.05, 5%, priors [10300.00]. annual_increase `q(500.0025)=500.00`; bank 200.05;
  `q(10300+500.00+200.05)=11000.05`. TS = `11000.05`. ✓
- D: base 7777.77, 3%, priors [8000, 8200] (annual_increase quantized ONCE to 233.33, reused
  each year; bank 11.10→44.43). `q(8200+233.33+44.43)=8477.76`. TS = `8477.76`. ✓
- Linear running-bank carries a NEGATIVE through the loop (prior year overspends 115000 vs
  105000 cap, next year underspends) and floors only ONCE at the end (caps.py:319-323): priors
  [115000, 100000] → bank loop -10000 then +10000 → `max(10000,0)`; `q(100000+5000+10000)=115000.00`.
  TS = `115000.00`. ✓ (the per-year-floor footgun is correctly NOT present here)

**cumulative_compounding, `calculate_cumulative_compounding_cap` caps.py:398-574**
- A: base 100000, 5%, N3, priors [102000, 108000]. `q(100000*1.05^3)=115762.50`;
  cum_max_prior 105000+110250=215250 − actual 210000 → bank `q(5250)=5250.00`;
  `q(115762.50+5250.00)=121012.50`. TS = `121012.50`. ✓
- B: base 100000, 3.33%, N2, priors [101000]. `q(100000*1.0333^2)=q(106770.889)=106770.89`;
  bank `q(103330−101000)=2330.00`; `q=109100.89`. TS = `109100.89`. ✓
- C: base 33333.33, 5%, N3, priors [34000, 35000] — fractional powers SUMMED in full precision
  before the single quantize. cum_max_prior = 33333.33*1.05 + 33333.33*1.05^2 = 71749.992825
  (full precision); bank `q(71749.992825−69000)=2749.99`; `q(33333.33*1.157625)=38587.50`;
  effective `q(38587.50+2749.99)=41337.49`. TS = `41337.49`. ✓ (confirms the bank sum is
  accumulated at full precision and quantized once — the Rate-8dp trap is avoided)
- Single-floor vs per-year-floor (the KNOWN footgun): compounding bank floored ONCE
  (caps.py:521-522). Prior year overspends (115000 > 105000 cap, negative contribution), next
  year underspends: priors [115000, 100000], N3. cum_max_prior 215250 − actual 215000 → bank
  `q(250)=250.00`; effective `q(115762.50+250.00)=116012.50`. TS = `116012.50`. ✓

**non_cumulative, `calculate_non_cumulative_cap` caps.py:50-200**
`calculator.ts:644-654` uses `Money.parse(base).multiplyRate(Rate.one().add(capRate))`. This
fuses `base*(1+rate)` into a single cent-rounding step, whereas the oracle does
`prior + prior*rate` then a single quantize. Probed for divergence with a 9-decimal cap rate
(0.123456785) and cent-precision priors: both produce `112345.68`. They are mathematically
equivalent for cent-precision prior amounts (which is what `tenant_share_after_cap` always is in
the live path) and realistic cap rates. The FIX CAP-4 zero-base guard (return uncapped on a zero
or missing prior) is present in TS (`calculator.ts:650`) and matches caps.py:100-115. No
divergence.

### Ledger display path
`cap-bank-ledger.ts::simulateCapBank` is a faithful port of `simulate_cap_bank`
(cap_bank_ledger.py:24-134): per-year floor-to-zero for BOTH cap types, `running_reference`
advances on cumulative only, compounding keeps base, `annual_increase_limit` quantized once for
cumulative. The known per-year-floor vs single-floor divergence between the two oracle modules
(`simulate_cap_bank` floors per-year; `calculate_cumulative_*` floors once) is INTENTIONAL and
faithfully reproduced on BOTH TS sides — `cumulative-cap.ts` (single-floor, money path) and
`cap-bank-ledger.ts` (per-year-floor, display path) each mirror their Python counterpart. The
TS source comment at `cumulative-cap.ts:13-23` documents exactly this and the ports honor it.

## Scratch specs left in place (for triage/retirement)
- `cloudflare-backend/src/test/_scratch_c4_capbank_cumulative.test.ts` — 4 linear scenarios (A–D)
- `cloudflare-backend/src/test/_scratch_c4_capbank_compounding.test.ts` — 3 compounding scenarios (A–C)
- `cloudflare-backend/src/test/_scratch_c4_capbank_floor.test.ts` — 2 single-floor / negative-bank scenarios

All 9 pass against the live TS engine; all 9 oracle expectations independently re-derived in
Python 3.13.5 from the oracle source.
