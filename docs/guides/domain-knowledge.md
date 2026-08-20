# Domain Knowledge

> CAM (Common Area Maintenance) reconciliation domain knowledge for CapVeri.
> This document covers BOMA standards, calculation logic, and business rules.

---

## BOMA 2024 Standards

The calculation engine must comply with **ANSI/BOMA Z65.1-2024**:

- Distinguish between **Rentable Area** and **Usable Area**
- Handle **Outdoor Amenities** per 2024 standard (included in rentable area even if uncovered)
- Calculate **Load Factor** (R/U Ratio) correctly

---

## Gross-Up Logic

```
Gross-Up Factor = Target Occupancy (e.g., 0.95) / Average Physical Occupancy

Constraints:
1. Factor >= 1.0 (never gross down)
2. Grossed-Up Amount <= Theoretical 100% Occupancy Cost (safety valve)
3. Only applies to VARIABLE expenses (Janitorial, Utilities)
4. Never applies to FIXED expenses (Taxes, Insurance)
```

---

## Expense Cap Types

### 1. Non-Cumulative Cap

Resets yearly; unused capacity is lost.

```python
max_allowed = prior_year_actual * (1 + cap_rate)
billable = min(actual_expenses, max_allowed)
# Unused capacity is LOST each year
```

### 2. Cumulative Cap (LINEAR growth)

Unused capacity carries forward. Bank is a RUNNING BALANCE that gets consumed when used.

Per industry standards: Lexology, Lowndes Law, CRE Wisdoms.

```python
annual_increase = base * cap_rate
running_reference = base
running_bank = 0
for actual in prior_year_amounts:
    year_max = running_reference + annual_increase + running_bank
    running_bank = year_max - actual  # Bank = what wasn't spent
    running_reference = actual
bank = max(running_bank, 0)
max_this_year = prior_actual + annual_increase + bank
billable = min(actual_expenses, max_this_year)
```

### 3. Cumulative Compounding Cap (EXPONENTIAL growth)

Base grows exponentially each year.

```python
max_year_n = base * (1 + cap_rate) ** years_since_base
billable = min(actual_expenses, max_year_n + banked_capacity)
```

---

## Base Year Logic

```python
# Base Year Calculation
billable = (current_year_expense - base_year_expense) * pro_rata_share

# Important: Normalize base year if occupancy was low
if base_year_occupancy < 0.95:
    base_year_expense = gross_up(base_year_expense, base_year_occupancy)
```

---

## Pool Hierarchy

Expense pools support a **2-level hierarchy** for roll-up calculations:

```
Parent Pool (e.g., "Total Operating Expenses")
├── Child Pool 1 (e.g., "Utilities")
├── Child Pool 2 (e.g., "Janitorial")
└── Child Pool 3 (e.g., "Security")
```

### Key Rules
- Maximum depth: 2 levels (parent → child only)
- Child pools cannot have children of their own
- Roll-up occurs during calculation phase, not storage
- Parent totals = sum of child pool amounts + direct parent expenses

### Split Allocations

Pools can split costs across multiple expense categories:

```python
# Allocations must sum to 100%
allocations = [
    {"pool_id": "utilities", "percentage": Decimal("60.00")},
    {"pool_id": "common-area", "percentage": Decimal("40.00")},
]
# Last allocation gets remainder to handle precision issues
```

**Reference**: See `docs/architecture/pool-allocation-flow.md` for full hierarchy patterns.

---

## Anomaly Detection

The historical analysis feature uses a **hybrid detection approach** combining three methods:

### 1. Variance-Based Detection (Simple threshold)
- Warning: 10-20% variance from prior year average
- Critical: >20% variance from prior year average

### 2. Statistical Outliers (Isolation Forest)
- ML-based detection across all expense categories
- Identifies multi-dimensional outliers

### 3. Trend Analysis (ARIMA)
- Time-series forecasting to detect pattern breaks
- Flags values that deviate from expected trends

### Fuzzy Pool Name Matching

When comparing expenses across years, pool names may differ slightly (e.g., "Janitorial" vs "Janitorial Services"). Use Levenshtein distance with 80% threshold:

```python
from Levenshtein import ratio as levenshtein_ratio
FUZZY_MATCH_THRESHOLD = 0.80  # 80% similarity required
```

### Variance Color Thresholds
- **Green**: <5% variance (normal)
- **Amber**: 5-15% variance (warning)
- **Red**: >15% variance (critical)

**Reference**: See `docs/architecture/anomaly-detection.md` for full algorithm details.

---

## Tenant Portal

### Invitation-Only Signup
- Tenants cannot self-register
- Landlord invites tenant via email with secure token
- Token expires after 7 days
- Token is single-use and can be revoked

### RLS Policy Pattern

```sql
-- Tenants can only see leases they're linked to
CREATE POLICY "tenant_lease_access" ON leases
FOR SELECT USING (
    id IN (
        SELECT lease_id FROM tenant_lease_links
        WHERE tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = auth.uid()
        )
    )
);
```

### Rate Limiting
- Disputes: Maximum 3 per day per tenant
- Email notifications: Maximum 10 per hour per tenant

### Dispute State Machine

```
OPEN → UNDER_REVIEW → RESOLVED → CLOSED
         ↓               ↓
      REJECTED ──────────┘
```

**References**:
- See `docs/architecture/tenant-portal-architecture.md` for full auth patterns
- See `docs/architecture/rbac-permissions.md` for complete role hierarchy and permission matrix

---

## Database Schema (Key Tables)

### Multi-Tenancy

Every table includes `organization_id` with RLS policy:

```sql
CREATE POLICY "Tenant Isolation" ON leases
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
```

### Core Tables
- `organizations` - Customer tenants
- `users` - Linked to Supabase Auth
- `properties` - Buildings with BOMA area definitions
- `units` - Suites within properties
- `leases` - With `recovery_profile` JSONB column ("Financial DNA")
- `gl_entries` - Normalized General Ledger transactions
- `expense_pools` - Expense buckets with gross-up configuration
- `pool_mappings` - GL account to pool mappings (supports wildcards)
- `reconciliation_snapshots` - Immutable calculation results

### Immutability Rule

```sql
-- Prevent modification of finalized snapshots
CREATE POLICY "No Update Finalized" ON reconciliation_snapshots
FOR UPDATE USING (is_finalized = false);
```
