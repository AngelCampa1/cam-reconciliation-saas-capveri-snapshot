# Cycle 4 — GL/ERP CSV Parser Divergence Findings

**Date:** 2026-06-28
**Scope:** `cleanCurrency` + `parseAmount` (debit/credit path) in
`cloudflare-backend/src/domain/ingestion/csv-parser.ts` vs oracle
`backend/app/services/ingestion/cleaners.py` `clean_currency_column` +
`split_amount_columns`.

All findings were confirmed by running
`src/test/_scratch_c4_glparse_divergences.test.ts` (27 tests, all pass).

---

## CONFIRMED BUGS

### BUG-1: debit+credit net vs gross — `parseAmount` ignores credit when debit is non-empty

**Severity:** CRITICAL (corrupts every CAM pool sum where both columns are populated)

**TS file:line:** `cloudflare-backend/src/domain/ingestion/csv-parser.ts:380-397` (`parseAmount`)

**Oracle file:line:** `backend/app/services/ingestion/cleaners.py:284-329` (`split_amount_columns`)

**Exact input row:**

| debit | credit |
|-------|--------|
| 1000.00 | 250.00 |

**Oracle expected:** `750.00` (`debit - credit = 1000 - 250`)

**TS actual:** `1000.00` (credit column silently ignored)

**Root cause:** `parseAmount` checks `amount`, then `debit`, then `credit` in a
priority chain. When `debit` is non-empty (even `"0.00"`), it returns
`cleanCurrency(debit)` and never touches `credit`. The oracle's
`split_amount_columns` always computes `clean(debit) - clean(credit)` regardless.

**Worst case:** A row with `debit="0.00"` and `credit="500.00"` (a
pure-expense credit entry). Oracle: `-500.00`. TS: `0.00`. The expense
disappears from every downstream CAM reconciliation calculation.

**Test:** `DIV-1` group in `_scratch_c4_glparse_divergences.test.ts`

---

### BUG-2: pre-signed credit value produces wrong sign — double-negative lost

**Severity:** HIGH (sign flip on any ERP file that pre-encodes credit sign in the credit column)

**TS file:line:** `cloudflare-backend/src/domain/ingestion/csv-parser.ts:385-396`

**Oracle file:line:** `backend/app/services/ingestion/cleaners.py:310-328`

**Exact input (credit-only column):**

| credit |
|--------|
| (500.00) |

**Oracle expected:** `+500.00`

Trace: `clean_currency_column("(500.00)")` → `-500.00`; then
`split_amount_columns`: `amount = debit(0) - credit(-500) = +500.00`.
A parenthesized credit means the value was already inverted; the debit-minus-credit
net correctly cancels the double-negative back to positive.

**TS actual:** `-500.00`

Trace: `cleanCurrency("(500.00)")` → `"-500.00"`;
then `cleaned.startsWith("-") ? cleaned : -cleaned` → returns `"-500.00"` as-is.
The reversal never happens.

**Also triggered by:** `"500 CR"` in the credit column and `"500.00-"` (trailing
minus). All pre-signed credit values suffer the same sign flip.

**Impact:** Any ERP that exports its credit column with accounting sign conventions
(parens/CR suffix for already-credited values) will have those entries sign-flipped.
A `+500` utility refund credited to the CAM pool becomes `-500` — a `$1000` error
per entry.

**Test:** `DIV-2` group in `_scratch_c4_glparse_divergences.test.ts`

---

## CONFIRMED DIVERGENCE (low real-world impact)

### DIV-3: Polish `Ł` currency symbol — oracle recognizes as currency prefix, TS drops row

**Severity:** LOW (US ERP exports do not use `Ł`; would only affect a
multinational property portfolio)

**TS file:line:** `cloudflare-backend/src/domain/ingestion/csv-parser.ts:444`
(leading-minus regex `^([$£€¥]?)\s*-(.*)$`)

**Oracle file:line:** `backend/app/services/ingestion/cleaners.py:54-56`
(charset `[$Ł€Ą£€¥]`)

**Exact input:** `"Ł-500"`

**Oracle expected:** `-500.00` (`Ł` is in the oracle's currency-prefix charset;
`is_leading_negative=True`; `normalized="500"`)

**TS actual:** row dropped (null) — `Ł` not in TS charset → leading-minus regex
doesn't match → `-` remains in body → fails `/^\d+(\.\d+)?$/`

**Test:** `DIV-3` in `_scratch_c4_glparse_divergences.test.ts`

---

## INTENTIONAL STRICT DROPS (TS safer than oracle — not bugs)

These are documented design choices where TS refuses values the oracle silently
coerces to a wrong number. Dropping is safer than inventing bad data.

| Input | Oracle result | TS result | Oracle flaw |
|-------|--------------|-----------|-------------|
| `"1e3"` | `13` (strips `e`, concatenates `1` and `3`) | null (dropped) | `[^0-9.]` strip mangles scientific notation |
| `"2.5e2"` | `252` | null | Same — strips `e`, reads `252` |
| `"1E6"` | `16` | null | Same |
| `"+500"` | `500` | null | Strips `+`, reads `500` — but `+` is not a recognized decoration |
| `"5%"` | `5` | null | Strips `%`, treats a percentage as a dollar amount |

Oracle uses `[^0-9.]` which is too permissive: it strips any non-digit/dot
character, turning `"1e3"` into `"13"` (concatenation artifact). TS validates
the normalized string against `/^\d+(\.\d+)?$/` before parsing, which rejects
all of these. **TS behavior is correct.**

---

## NO DIVERGENCE (same behavior both sides)

| Scenario | Oracle | TS |
|----------|--------|----|
| Lone dash `"-"` | null/NaN (dropped) | null (dropped) |
| Spaced dash `" - "` | null (dropped) | null (dropped) |
| European comma `"1.234,56"` | NaN (both strip comma → `"1.234.56"` → invalid) | null |
| Multi-dot `"1.234.56"` | NaN | null |
| Space-as-thousands `"1 234.56"` | `1234.56` | `1234.56` |
| Bare `"$"` | null | null |
| Blank/empty | null | null |
| Paren negative `"(1234.56)"` | `-1234.56` | `-1234.56` |
| CR suffix `"500 CR"` | `-500.00` | `-500.00` |
| DR suffix `"500 DR"` | `500.00` | `500.00` |
| Trailing minus `"500.00-"` | `-500.00` | `-500.00` |
| Leading-minus `"$-1,234.56"` | `-1234.56` | `-1234.56` |

---

## Highest-Impact Finding

**BUG-1** is the highest impact: when an ERP export uses separate debit/credit
columns and a row has a non-zero value in BOTH columns (standard double-entry
bookkeeping), the TS parser returns the gross debit and silently discards the
credit offset. The worst concrete case is `debit="0.00", credit="500.00"` — the
expense entry becomes `$0` instead of `-$500`, causing the CAM pool to under-count
expenses by the full credit amount. Across a full reconciliation year this
compounds across every such entry.

**BUG-2** is the second highest: any ERP that applies accounting sign conventions
inside the credit column (parens, CR suffix, trailing minus) gets a sign flip of
`2 × value` per affected entry (e.g., a `+$500` refund becomes `-$500`).

Both bugs are in `parseAmount` at
`cloudflare-backend/src/domain/ingestion/csv-parser.ts:375-397`.

---

## Test file

`cloudflare-backend/src/test/_scratch_c4_glparse_divergences.test.ts`
(27 tests, all passing — confirms both the bugs and the intentional drops).
