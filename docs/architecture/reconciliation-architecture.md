# CapVeri Reconciliation — Engineering Architecture

> Technical map of the reconciliation system: services, data flows, AI integration points, and known improvement areas.
>
> For the ICP / product perspective, see [reconciliation-ux-flow.md](./reconciliation-ux-flow.md).
>
> **Working engineering doc, not the authoritative reference.** For the money math as it stood at
> code freeze, see [`portfolio/RECONCILIATION-ENGINE.md`](../../portfolio/RECONCILIATION-ENGINE.md)
> and [`portfolio/ARCHITECTURE.md`](../../portfolio/ARCHITECTURE.md); both are verified against the
> final source tree.

---

## System Overview

CapVeri is built on an "Anti-Integration" architecture — no API connections to legacy property management systems. All data enters via file upload (CSV/Excel/PDF). This is a deliberate constraint that eliminates integration maintenance costs and makes the system source-agnostic.

The reconciliation pipeline has five phases mirroring the UX flow, plus supporting infrastructure:

```
CSV/PDF Upload
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: GL Ingestion                                          │
│  Fingerprint → Parse (Strategy) → Validate → Persist           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Phase 2: Lease Extraction                                      │
│  document reader OCR → Claude JSON → HITL Verification → recovery_profile│
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Phase 3: Pool Mapping                                          │
│  account_code → pool_id mappings, hierarchy roll-up             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Phase 4: GL Narrative Analysis (optional, pre-finalization)    │
│  Claude advisory → markdown → user dismiss/acknowledge          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Phase 5: Calculation + Finalization                            │
│  gross-up → caps → tenant share → admin fee → snapshot lock     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — GL Ingestion

### Responsibility
`backend/app/services/ingestion/`

### Data Flow

```
POST /api/v1/ingestion/upload
  → compute SHA256 hash (deduplication key)
  → check import_batches for hash collision (COMPLETED/PROCESSING → reject)
  → fingerprint.py: read first 1KB, pattern-match → source_system
  → dispatcher.py: select parser strategy
  → parser.parse() → ParseResult(rows, columns, errors, warnings)
  → quality_checks.py: validate GL entries
  → persistence.py: bulk insert → gl_entries table
  → auto_setup_pools_from_gl() → suggest pool mappings
  → update batch status: COMPLETED
```

### Strategy Pattern — Parser Selection

**File:** `backend/app/services/ingestion/dispatcher.py`

| Source System | Parser | Fingerprint Signals |
|---------------|--------|---------------------|
| Yardi Voyager | `YardiVoyagerGLParser` | "Yardi Systems", "Run Date: MM/DD/YYYY" |
| MRI Commercial | `MRICommercialRentRollParser` | "MRI Software", "PERIOD", "REF", "SOURCE" |
| Generic | `GenericMappingParser` | fallback — prompts column mapping UI |

### Key Data Model

```python
# backend/app/services/ingestion/schemas.py
class GLEntryInput(BaseModel):
    account_code: str
    account_description: str
    vendor_name: Optional[str]
    amount: Decimal          # Never float
    transaction_date: date
    period_year: int
    property_id: UUID
    organization_id: UUID    # RLS key
```

### Database
- Table: `gl_entries` — RLS on `organization_id`
- Table: `import_batches` — tracks status, row_count, error_count, file_hash
- Index: `(property_id, period_year)` — primary query pattern for calculations

### Known Gaps
- **Generic parser UX is rough**: column mapping UI exists but has no saved templates per source — users remap every time for non-Yardi/MRI files
- **No mid-year GL support**: parser assumes annual GL export; partial-year uploads produce incorrect period_year extraction
- **No GL diff/patch**: re-uploading a corrected GL replaces all entries for that batch — there's no delta/patch mode
- **Fingerprinting is brittle**: 1KB heuristic fails on files with long preamble headers; confidence scoring is not exposed to the user

---

## Phase 2 — Lease Extraction

### Responsibility
`backend/app/services/extraction/`

### Data Flow

```
POST /api/v1/extraction
  → store document metadata (documents table, status: PROCESSING)
  → document_reader_client.py: submit async OCR job to document reader
  → job_poller.py: poll for completion (exponential backoff)
  → result_parser.py: parse document reader response → OCRResult (text + bounding boxes per page)
  → persistence.py: store in ocr_results table (one row per page)
  → anthropic_client.py: send concatenated OCR text to Claude 3.5 Sonnet
  → prompts.py: LEASE_EXTRACTION_PROMPT → structured JSON response
  → extraction_models.py: parse + validate → LeaseExtractionResult
  → store extraction_jobs table (status: READY_FOR_REVIEW)
  → [user verifies in HITL UI]
  → POST /api/v1/extraction/{id}/approve
  → commit to leases.recovery_profile (JSONB)
```

### AI Integration

| Step | System | Notes |
|------|--------|-------|
| OCR | document reader | Async job, bounding boxes per token |
| Extraction | Claude 3.5 Sonnet (ZDR-eligible) | Returns structured JSON + per-field confidence |
| Confidence | Per-field 0.0–1.0 | Low threshold: < 0.75, flagged for HITL |

**File:** `backend/app/services/extraction/prompts.py` — `LEASE_EXTRACTION_PROMPT`

### Recovery Profile Schema

```python
# backend/app/services/extraction/extraction_models.py
class LeaseExtractionResult(BaseModel):
    base_year: Optional[int]
    pro_rata_share: Decimal
    admin_fee_percent: Decimal = Decimal("0.15")
    gross_up_target: Decimal = Decimal("0.95")
    cap_type: CapType  # NONE | NON_CUMULATIVE | CUMULATIVE | CUMULATIVE_COMPOUNDING
    cap_rate: Optional[Decimal]
    confidence_scores: Dict[str, float]
    low_confidence_fields: List[str]
```

Stored as JSONB in `leases.recovery_profile`. Frozen on approve.

### HITL State Machine

```
PENDING → PROCESSING → READY_FOR_REVIEW → APPROVED | REJECTED
```

**File:** `docs/architecture/hitl-state-management.md`

### Known Gaps
- **No re-extraction on amended leases**: if a lease is amended, the user must manually edit the recovery_profile — there's no amendment tracking or diff
- **Bounding box highlight only works for single-page extractions reliably**: multi-page PDFs with split clauses can point to wrong page
- **No extraction versioning**: approving new extraction overwrites prior recovery_profile with no rollback
- **document reader cost is untracked**: no per-property/per-org cost attribution for OCR spend
- **Claude extraction has no fallback**: if the model returns malformed JSON, the job fails hard — no partial extraction recovery

---

## Phase 3 — Pool Mapping

### Responsibility
`backend/app/services/pools/` + `backend/app/api/v1/expense_pools.py`

### Data Model

```
expense_pools
├── id: UUID
├── name: str
├── parent_pool_id: UUID (nullable — enables 2-level hierarchy)
├── property_id: UUID (RLS)
├── organization_id: UUID (RLS)
└── is_recoverable: bool

pool_mappings
├── account_code: str
├── pool_id: UUID → expense_pools.id
├── property_id: UUID
└── organization_id: UUID
```

### Roll-up Logic

Pool totals roll up **during calculation**, not at display time:

```python
# backend/app/services/calculation/pool_aggregator.py
parent_total = direct_parent_expenses + sum(child.total for child in children)
```

Max depth: 2 levels. Deeper hierarchies are flattened.

### Known Gaps
- **Auto-suggestions are naive**: `auto_setup_pools_from_gl()` uses simple keyword matching on account descriptions — creates duplicate or incorrectly named pools for non-standard GL exports
- **No cross-property pool templates**: users with 10 properties re-create pool structures manually each time (template copy exists but is not surfaced prominently in UX)
- **Split allocations are underdocumented**: `pool_allocation_flow.md` exists but the split allocation UI flow is incomplete

---

## Phase 4 — GL Narrative Analysis

### Responsibility
`backend/app/services/analysis/gl_analysis_service.py`
`backend/app/services/extraction/gl_analysis_prompt.py`

### Data Flow

```
POST /api/v1/analysis/gl-narrative
  → fetch gl_entries for property + year, aggregate by account_code
  → build structured JSON payload (token-efficient: pools + account summaries)
  → anthropic_client.py: Claude 3.5 Sonnet + GL_ANALYSIS_SYSTEM_PROMPT
  → response: markdown narrative (GAAP/IRS citations, flagged items)
  → persist: gl_analysis_results table (status: ADVISORY)
  → frontend: GLAnalysisPanel.tsx renders with ReactMarkdown
```

### Advisory Checks (Prompt-Driven)

Claude is prompted to identify:
- CapEx coded as OpEx (e.g., large HVAC replacements, roof work)
- Non-recoverable items in recoverable pools (e.g., leasing commissions, TI)
- Unusual vendor concentrations
- Year-over-year spikes without explanation
- Items that conflict with typical lease carve-outs

**Important**: Advisory is non-binding. It never modifies amounts or pool assignments.

### Database
- Table: `gl_analysis_results` — RLS on `organization_id`
- Status: `ADVISORY` → `DISMISSED` (user action) or superseded by re-run

### Known Gaps
- **No feedback loop**: user dismissals are not logged in a way that could improve prompt quality over time
- **Single-shot analysis**: no way to ask follow-up questions or drill into a specific flagged item
- **No structured output**: response is free-form markdown — cannot be programmatically acted on (e.g., auto-flag specific gl_entries)
- **Token cost scales with property size**: large properties with hundreds of account codes produce large payloads; no chunking strategy exists yet
- **ZDR not enforced**: privacy disclosure updated but enterprise ZDR agreement with Anthropic is not yet in place

---

## Phase 5 — Calculation Engine

### Responsibility
`backend/app/services/calculation/`

### Orchestration

**File:** `backend/app/services/calculation/orchestrator.py`

```python
run_property_reconciliation(
    input_data: ReconciliationInput,
    leases: List[LeaseTerms],
    pool_summaries: Dict[UUID, ExpensePoolSummary]
) -> ReconciliationResult
```

### Calculation Steps (in order)

```
1. gross_up.py: calculate_gross_up_factor()
   Input:  actual_occupancy, target_occupancy (from lease)
   Output: Decimal factor (>= 1.0, quantized to 4dp)
   Rule:   factor = target / actual; never < 1.0

2. gross_up_orchestrator.py: apply_gross_up()
   Applies factor ONLY to variable pools (Janitorial, Utilities)
   Skips fixed pools (Taxes, Insurance)

3. expense_stop.py: apply_expense_stops()
   If configured: billable = min(actual, per_sqft * tenant_sqft)

4. For each tenant:
   a. Filter pools (apply lease.excluded_pools)
   b. base_year.py: apply_base_year_stop()
      Formula: billable = current_expenses - base_year_expenses
      Gross-up base year if base year occupancy < 95%
   c. Apply pro_rata_share: tenant_amount = pool_total * pro_rata_share
   d. caps.py: apply_cap()
      See cap types below
   e. Admin fee: fee = recoverable * admin_fee_percent

5. Persist: reconciliation_snapshots + CalculationTrace (full audit JSON)
```

### Cap Types

**File:** `backend/app/services/calculation/caps.py`

```python
# NON_CUMULATIVE — unused capacity lost each year
billable = min(actual, prior_actual * (1 + cap_rate))

# CUMULATIVE — unused capacity banks forward
bank += max(cap_ceiling - actual, 0)
billable = min(actual, prior_actual + annual_increase + bank)

# CUMULATIVE_COMPOUNDING — exponential ceiling
ceiling = base * (1 + cap_rate) ** years_since_base
billable = min(actual, ceiling + banked_capacity)
```

### Audit Trail

**File:** `backend/app/services/calculation/models.py`

Every calculation step is recorded in `CalculationTrace` (stored as JSONB in `reconciliation_snapshots.trace`). Steps include: name, inputs dict, operation string, output, note. Exposed via `GET /api/v1/reconciliation/snapshots/{id}/trace`.

### Finalization

```sql
-- RLS policy prevents updates once finalized
CREATE POLICY "No Update Finalized" ON reconciliation_snapshots
FOR UPDATE USING (is_finalized = false);
```

### Known Gaps
- **No multi-year cap state persistence**: cumulative cap bank is recalculated from scratch each run by fetching prior snapshots — if a prior year was manually overridden, the bank balance may be wrong
- **Gross-up variable/fixed classification is hardcoded**: the list of variable vs. fixed pools is not configurable per property; edge cases (e.g., HVAC maintenance) must be manually re-pooled
- **No partial-period proration**: if a tenant moved in mid-year, their pro-rata share isn't time-weighted automatically — user must manually adjust the lease dates
- **Expense stop and cap interact unexpectedly**: if both are configured, order of operations (stop first, then cap) is not documented or surfaced to the user
- **Calculation is synchronous**: large properties (50+ tenants, 100+ pools) can cause API timeouts — async job pattern exists for extraction but not for calculation

---

## Supporting Infrastructure

### Anomaly Detection
**File:** `backend/app/services/analysis/anomaly_detection.py`

Three-method hybrid:
1. Variance thresholds (amber: 5–15%, red: >15%)
2. ARIMA trend (AR(1), requires ≥3 data points, 95% CI)
3. Modified Z-score (MAD-based, threshold 3.5)

Fuzzy pool name matching (Levenshtein, 80% threshold) handles pool renames across years.

### RBAC
Five tiers: `OWNER > ADMIN > MEMBER > VIEWER > TENANT`

Full matrix in `docs/architecture/rbac-permissions.md`.

### Multi-tenancy
Every table has `organization_id` + RLS policy. No exceptions. Tenant portal uses a separate auth flow with no organization context.

### Billing
Unit-based Stripe subscriptions for the Reconcile plan. No-card trials start from the saved checkout selection; paid checkout applies the Reconcile annual price and 80OFF when present. Entitlements are checked at calculation trigger.

**File:** `backend/app/services/billing/`

### Frontend Performance
- Reconciliation grid: `@tanstack/react-virtual` — handles 30,000+ cells
- Optimistic updates via TanStack Query `onMutate` with rollback on error
- Server-side pagination on all list endpoints

---

## AI Integration Summary

| Feature | Model | Data Sent | Output | Binding? |
|---------|-------|-----------|--------|----------|
| Lease extraction | Claude 3.5 Sonnet | OCR text of lease PDF | Structured JSON (recovery_profile) | After human approval only |
| GL narrative analysis | Claude 3.5 Sonnet | Aggregated GL by account code | Markdown advisory | Never — advisory only |

**ZDR status**: Standard API (data retained per Anthropic policy). Enterprise ZDR agreement not yet in place. Privacy disclosure updated 2026-02-27.

**No LLMs in the calculation path** — all financial math is deterministic Python with `Decimal`.

---

## Areas for Improvement

### High Priority

| Area | Problem | Direction |
|------|---------|-----------|
| **Async calculation** | Sync endpoint times out on large properties | Move to Celery job pattern (already used for extraction) |
| **Generic parser UX** | Column mapping is per-upload, not saved per source | Add "source profile" — save mappings, reuse on next upload |
| **Cap state persistence** | Cumulative bank recalculated from history — fragile | Persist `cap_bank_balance` as a first-class field per tenant per year |
| **ZDR enforcement** | GL data sent to Claude without enterprise ZDR | Procure Anthropic enterprise agreement or implement on-prem option |

### Medium Priority

| Area | Problem | Direction |
|------|---------|-----------|
| **Lease amendment tracking** | No diff/version on recovery_profile changes | Add `lease_recovery_versions` table, show delta in UI |
| **Pool templates** | Re-created per property manually | Surface "copy pool structure from property X" prominently in onboarding |
| **Partial-period proration** | Mid-year tenants not auto-prorated | Add `occupancy_start_date` / `occupancy_end_date` to lease terms and weight calculations accordingly |
| **GL analysis structured output** | Free-form markdown, not actionable programmatically | Add structured flagging (per gl_entry, per pool) alongside narrative |
| **document reader cost attribution** | No visibility into OCR spend per property/org | Add token/cost tracking to extraction jobs |

### Low Priority / Future

| Area | Problem | Direction |
|------|---------|-----------|
| **Multi-page bounding boxes** | HITL highlight unreliable on split clauses | Improve page correlation in result_parser.py |
| **Fingerprinting robustness** | Fails on files with long preambles | Scan first 5KB, fall back to full-file sampling |
| **Anomaly detection feedback** | No user feedback loop into detection thresholds | Log dismiss/confirm actions, surface calibration suggestions |
| **Expense stop + cap interaction** | Order-of-operations not documented | Add explicit `CalculationTrace` step for the interaction |

---

## File Map

```
backend/app/
├── api/v1/
│   ├── ingestion.py          # Upload, batches, column mappings
│   ├── extraction.py         # Extraction CRUD, approve/reject
│   ├── reconciliation.py     # Calculate, snapshots, finalize, trace
│   ├── analysis.py           # YoY, anomalies, GL narrative
│   ├── expense_pools.py      # Pool CRUD + hierarchy
│   └── export.py             # CSV, PDF, ERP write-back
│
├── services/
│   ├── ingestion/
│   │   ├── dispatcher.py     # Strategy pattern — parser selection
│   │   ├── fingerprint.py    # File type detection (1KB heuristic)
│   │   ├── batch.py          # Batch tracking + deduplication
│   │   ├── persistence.py    # GL entry bulk insert
│   │   ├── quality_checks.py # GL validation
│   │   └── parsers/
│   │       ├── yardi.py
│   │       ├── mri.py
│   │       └── generic.py
│   │
│   ├── extraction/
│   │   ├── orchestrator.py         # End-to-end extraction pipeline
│   │   ├── document_reader_client.py      # document reader integration
│   │   ├── anthropic_client.py     # Claude API client (retry, circuit breaker)
│   │   ├── prompts.py              # LEASE_EXTRACTION_PROMPT
│   │   ├── gl_analysis_prompt.py   # GL_ANALYSIS_SYSTEM_PROMPT
│   │   ├── job_poller.py           # Async job polling
│   │   ├── result_parser.py        # document reader response → OCRResult
│   │   ├── extraction_models.py    # LeaseExtractionResult schema
│   │   ├── confidence.py           # Per-field confidence scoring
│   │   └── persistence.py          # OCR + job storage
│   │
│   ├── calculation/
│   │   ├── orchestrator.py         # run_property_reconciliation()
│   │   ├── gross_up.py             # calculate_gross_up_factor()
│   │   ├── gross_up_orchestrator.py# Apply gross-up to variable pools
│   │   ├── tenant_share.py         # Per-tenant share calculation
│   │   ├── caps.py                 # NON_CUMULATIVE | CUMULATIVE | COMPOUNDING
│   │   ├── base_year.py            # Base year stop logic
│   │   ├── expense_stop.py         # Per-sqft stops
│   │   ├── occupancy.py            # Occupancy percentage helpers
│   │   ├── pool_aggregator.py      # Pool hierarchy roll-up
│   │   └── models.py               # CalculationTrace data structure
│   │
│   └── analysis/
│       ├── gl_analysis_service.py  # GL narrative (Claude advisory)
│       ├── anomaly_detection.py    # Variance + ARIMA + Z-score
│       └── historical_analysis.py  # YoY comparisons
│
frontend/src/features/
├── reconciliation/              # Main reconciliation grid + GL advisory panel
├── verification/                # HITL lease extraction review
├── analysis/                    # YoY charts, anomaly display
├── pools/                       # Pool management
├── export/                      # Report downloads
└── tenant-portal/               # Tenant-facing portal
```
