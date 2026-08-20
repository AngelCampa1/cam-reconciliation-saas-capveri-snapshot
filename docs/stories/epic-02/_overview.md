# Epic 2: Shared Type System & Domain Models

## Epic Overview

**Goal**: Define the contract between frontend and backend with strongly-typed domain models.

**Why This Matters**: Type safety across the stack prevents runtime errors and ensures frontend/backend stay in sync. When both sides speak the same language (Pydantic ↔ Zod), API mismatches are caught at compile time.

**Dependencies**: Epic 0 (both environments configured), Epic 1 (form integration)

**Delivers**:
- `backend/app/models/` - Pydantic schemas
- `frontend/src/types/` - Zod schemas
- Enum definitions (CapType, PoolType, LeaseStatus, etc.)
- Financial calculation types
- API request/response types
- Schema sync tests to catch drift

---

## Stories in This Epic

- **[Story 2.1: Create Core Enums](./story-02.01-create-core-enums.md)** - Define enumerated types for domain constants
- **[Story 2.2: Create Organization Model](./story-02.02-create-organization-model.md)** - Model organization data for multi-tenancy
- **[Story 2.3: Create User Model](./story-02.03-create-user-model.md)** - User accounts with roles and organization links
- **[Story 2.4: Create Property Model](./story-02.04-create-property-model.md)** - Property data with BOMA area fields
- **[Story 2.5: Create Unit Model](./story-02.05-create-unit-model.md)** - Individual units within properties
- **[Story 2.6: Create LeaseRecoveryProfile Model](./story-02.06-create-leaserecoveryprofile-model.md)** - Lease recovery terms (Financial DNA)
- **[Story 2.7: Create Lease Model](./story-02.07-create-lease-model.md)** - Lease data with embedded recovery profile
- **[Story 2.8: Create GLEntry Model](./story-02.08-create-glentry-model.md)** - General ledger entries
- **[Story 2.9: Create ExpensePool Model](./story-02.09-create-expensepool-model.md)** - Expense pool configuration
- **[Story 2.10: Create PoolMapping Model](./story-02.10-create-poolmapping-model.md)** - GL account to pool mappings
- **[Story 2.11: Create ReconciliationSnapshot Model](./story-02.11-create-reconciliationsnapshot-model.md)** - Immutable reconciliation snapshots
- **[Story 2.12: Create CalculationStep Model](./story-02.12-create-calculationstep-model.md)** - Audit trail for calculations
- **[Story 2.13: Create API Response Wrappers](./story-02.13-create-api-response-wrappers.md)** - Consistent API response structures
- **[Story 2.14: Create Schema Sync Test](./story-02.14-create-schema-sync-test.md)** - Automated schema drift detection
- **[Story 2.15: Create Subscription Model](./story-02.15-create-subscription-model.md)** - Billing subscription data types
- **[Story 2.16: Create Invoice Model](./story-02.16-create-invoice-model.md)** - Billing invoice data types
- **[Story 2.17: Create Promotion Model](./story-02.17-create-promotion-model.md)** - Promotion and coupon data types *(Optional - Not needed if using Stripe-first approach)*
- **[Story 2.18: Create Feedback Model](./story-02.18-create-feedback-model.md)** - User feedback data types

---

## Epic Completion Checklist

When all stories are complete, verify:

- [ ] All models have Pydantic + Zod versions
- [ ] Enums match exactly
- [ ] Decimal handling consistent (strings in JSON)
- [ ] Schema sync tests pass
- [ ] Create/Update DTOs defined for all entities

## CLAUDE.md Additions After Epic 2

Add the following to `CLAUDE.md` upon epic completion:

```markdown
## Type System Rules

### General
- Every Pydantic model must have a matching Zod schema
- Run `pytest tests/test_schema_sync.py` after any model change
- Use `Decimal` for all monetary values (never `float`)
- All dates are ISO 8601 strings in API responses

### Pydantic (Backend)
- Models in `backend/app/models/`
- Use `str` mixin for enums: `class Status(str, Enum)`
- Use `Field(...)` for required fields with validation
- Use `ConfigDict(from_attributes=True)` for ORM models

### Zod (Frontend)
- Schemas in `frontend/src/types/`
- Use `z.string()` for Decimal fields (precision preservation)
- Derive TypeScript types: `type X = z.infer<typeof XSchema>`
- Use `.refine()` for cross-field validation
```
