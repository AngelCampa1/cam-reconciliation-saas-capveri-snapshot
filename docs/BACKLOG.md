# CapVeri - Epic & User Story Development Plan

## Objective
Create a comprehensive backlog of epics and user stories for CapVeri, organized in sequential development order with proper dependencies.

## Guiding Principles
1. **UX First**: Great user experience is a top priority - every UI story includes UX acceptance criteria
2. **Works as Intended**: Deterministic, tested code - no mock implementations, real coverage
3. **2-4 Hour Stories**: Small, focused tasks completable in single agent sessions
4. **Sequential Dependencies**: Each epic builds on previous foundations
5. **Synthetic Test Data**: Generate realistic fixtures based on documented formats
6. **Integration First**: Every UI component MUST connect to real backend endpoints - no orphan components
7. **Contract Testing**: API client types auto-generated from OpenAPI spec to prevent drift

---

## Epic Overview (Full Roadmap)

### Foundation Phase (Epics 0-2)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 0 | Developer Foundation | CI/CD, testing infrastructure, CLAUDE.md enforcement | M |
| 1 | Design System & UI Foundation | Shadcn/UI, design tokens, core components | M |
| 2 | Shared Type System | Pydantic + Zod schemas, domain models | M |

### Infrastructure Phase (Epics 3-5)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 3 | Database Schema & RLS | PostgreSQL tables, Row Level Security, multi-tenancy | L |
| 4 | Backend API Skeleton | FastAPI structure, auth, organization-scoped sessions | M |
| 4.5 | API Client & Contract Testing | Auto-generate TypeScript client from OpenAPI, contract tests | M |

### Core Features Phase (Epics 5-8)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 5 | Data Ingestion Engine | Strategy pattern parsers for Yardi/MRI/Generic | XL |
| 6 | Financial Calculation Engine | BOMA gross-up, caps, base year logic | XL |
| 7 | Reconciliation API | Calculate, persist, finalize snapshots | L |
| 8 | Test Fixture Generation | Synthetic Yardi CSVs, MRI exports, lease PDFs | M |

### User Interface Phase (Epics 9-13)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 9 | Authentication UI | Login, registration, profile management | M |
| 10 | Property & Lease Management UI | CRUD interfaces, recovery profile editor | L |
| 11 | Data Ingestion UI | File upload, column mapping wizard | L |
| 12 | Reconciliation Grid UI | Virtualized grid, optimistic updates | XL |
| 13 | Reporting & Export UI | Tenant packets, ERP write-back files | M |

### AI Abstraction Phase (Epics 14-16)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 14 | OCR Pipeline | document reader integration, document processing | L |
| 15 | LLM Lease Extraction | Claude 3.5 Sonnet integration, Financial DNA extraction | L |
| 16 | Human-in-the-Loop UI | PDF viewer with extraction verification | XL |

### Advanced Features Phase (Epics 17-20)
| Epic | Name | Purpose | Complexity |
|------|------|---------|------------|
| 17 | Advanced Expense Pools | Split allocations, complex pool configurations | M |
| 18 | Historical Analysis | Year-over-year comparisons, trend detection | M |
| 19 | Tenant Portal | Read-only access for tenants to view bills | L |
| 20 | Mobile Optimization | Responsive design, PWA capabilities | M |

---

## Detailed Epic Specifications

### Epic 0: Developer Foundation & Tooling

**Purpose**: Establish development environment with strict TDD enforcement before any code is written.

**Dependencies**: None (root)

**Artifacts Established**:
- Monorepo structure (`backend/`, `frontend/`, `supabase/`)
- pytest with 95% coverage gates
- Vitest for frontend
- GitHub Actions CI/CD
- Pre-commit hooks
- CLAUDE.md enforcement rules

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 0.1 | Initialize monorepo structure | Create `backend/`, `frontend/`, `supabase/` directories with base configs | Directories exist, `pyproject.toml` and `package.json` valid | 2 |
| 0.2 | Configure Python environment | pyproject.toml with FastAPI, Pydantic, Pandas, pytest deps | `pip install -e .` succeeds, pytest runs | 2 |
| 0.3 | Configure pytest with coverage | pytest.ini with coverage settings, 95% threshold | `pytest --cov-fail-under=95` enforced | 2 |
| 0.4 | Configure frontend with Vite | Vite + React 18 + TypeScript strict mode | `npm run dev` serves app | 2 |
| 0.5 | Configure Vitest | Vitest with coverage, React Testing Library | `npm test` runs, coverage reported | 2 |
| 0.6 | Create GitHub Actions CI | Workflow runs on PR: lint, type-check, test, coverage gates | PR blocked if coverage drops | 3 |
| 0.7 | Configure pre-commit hooks | Black, isort, ruff (Python); ESLint, Prettier (TS) | Hooks run on commit | 2 |
| 0.8 | Create test fixture directory | `tests/fixtures/` with README, gitkeep for sample files | Structure documented | 1 |

---

### Epic 1: Design System & UI Foundation

**Purpose**: Establish consistent, polished UI components before building features. UX quality starts here.

**Dependencies**: Epic 0

**Artifacts Established**:
- Tailwind CSS with custom design tokens
- Shadcn/UI components customized for CapVeri brand
- Layout shell (sidebar, header, content area)
- Core UI patterns (forms, tables, modals, toasts)
- Loading and error states
- Accessibility standards

**CLAUDE.md Addition**:
```
### Design System Rules
- All colors must use design token variables (no hardcoded hex values)
- All spacing must use Tailwind spacing scale
- All new UI must pass WCAG 2.1 AA accessibility
- Use Shadcn/UI components; do not install other UI libraries
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 1.1 | Install and configure Tailwind | Tailwind CSS with custom config file | `npm run build` includes Tailwind | 2 |
| 1.2 | Define design tokens | Colors (primary, secondary, success, warning, error, neutral), spacing scale, typography | CSS variables defined in `globals.css` | 3 |
| 1.3 | Install Shadcn/UI | Initialize Shadcn CLI, install base components | Components in `src/components/ui/` | 2 |
| 1.4 | Customize Shadcn theme | Apply CapVeri brand colors, border radius, shadows | Visual consistency across components | 3 |
| 1.5 | Create application shell | Header with logo, user menu; Sidebar with navigation; Main content area | Responsive, collapses on mobile | 4 |
| 1.6 | Create sidebar navigation | Collapsible sidebar, active state, icons, nested items | Keyboard accessible, smooth animation | 3 |
| 1.7 | Create page header component | Breadcrumbs, page title, action buttons slot | Consistent across all pages | 2 |
| 1.8 | Create form components | Text input, select, checkbox, radio with Zod integration | Shows validation errors, loading states | 4 |
| 1.9 | Create data table component | Sortable columns, pagination, row selection | Accessible, keyboard navigable | 4 |
| 1.10 | Create modal/dialog component | Shadcn Dialog with standard sizes, close on escape | Focus trap, accessible | 2 |
| 1.11 | Create toast notification system | Success, error, warning, info variants; auto-dismiss | Stacks properly, accessible | 2 |
| 1.12 | Create loading states | Skeleton loaders, spinner, progress bar | Smooth animations, reduced motion support | 2 |
| 1.13 | Create error boundary | Catches React errors, shows friendly message | Logs error, offers retry | 2 |
| 1.14 | Create empty states | Illustrations + copy for empty lists/tables | Actionable (e.g., "Add your first property") | 2 |

---

### Epic 2: Shared Type System & Domain Models

**Purpose**: Define the contract between frontend and backend with strongly-typed domain models.

**Dependencies**: Epic 0, Epic 1 (for form integration)

**Artifacts Established**:
- `backend/app/models/` - Pydantic schemas
- `frontend/src/types/` - Zod schemas
- Enum definitions (CapType, PoolType, LeaseStatus, etc.)
- Financial calculation types
- API request/response types

**CLAUDE.md Addition**:
```
### Type System Rules
- Every Pydantic model must have a matching Zod schema
- Run `pytest tests/test_schema_sync.py` after any model change
- Use Decimal for all monetary values (never float)
- All dates must be ISO 8601 strings in API responses
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 2.1 | Create core enums | CapType, PoolType, LeaseStatus, ImportStatus, UserRole | Python Enum + TS const objects match | 2 |
| 2.2 | Create Organization model | id, name, subscription_status, settings (JSONB), timestamps | Pydantic + Zod match | 2 |
| 2.3 | Create User model | id, organization_id, email, full_name, role, timestamps | Linked to auth.users | 2 |
| 2.4 | Create Property model | BOMA area fields, target_occupancy, address fields | Validation for area > 0 | 2 |
| 2.5 | Create Unit model | property_id, unit_number, rentable_sqft, usable_sqft, status | FK constraint defined | 2 |
| 2.6 | Create LeaseRecoveryProfile model | base_year, pro_rata_share, caps, admin_fee, gross_up settings | JSONB structure documented | 3 |
| 2.7 | Create Lease model | tenant_name, dates, status, recovery_profile (JSONB), document_url | Pydantic + Zod match | 3 |
| 2.8 | Create GLEntry model | account_code, amount (Decimal), transaction_date, raw_row_data | Signed amounts (+ debit, - credit) | 2 |
| 2.9 | Create ExpensePool model | name, pool_type, is_gross_up_applicable, gross_up_target | Validation rules | 2 |
| 2.10 | Create PoolMapping model | expense_pool_id, gl_account_pattern, allocation_percentage | Wildcard pattern support | 2 |
| 2.11 | Create ReconciliationSnapshot model | period dates, all calculation fields, calculation_trace JSONB | Immutability flag | 3 |
| 2.12 | Create CalculationStep model | step_order, step_name, input, operation, output, note | For audit trail | 2 |
| 2.13 | Create API response wrappers | Paginated list response, error response, success response | Consistent API structure | 2 |
| 2.14 | Create schema sync test | Integration test validates Pydantic/Zod accept same inputs | Fails on schema drift | 3 |

---

### Epic 3: Database Schema & Multi-Tenancy

**Purpose**: Deploy PostgreSQL schema with strict Row Level Security for multi-tenant isolation.

**Dependencies**: Epic 2 (type definitions inform schema)

**Artifacts Established**:
- `supabase/migrations/` SQL files
- RLS policies on all tables
- pgAudit configuration
- GIN indexes on JSONB columns
- Negative tests for tenant isolation

**CLAUDE.md Addition**:
```
### Database Rules
- Every table MUST have organization_id column
- Every table MUST have RLS policy enforcing org isolation
- Add negative test in tests/test_rls.py for each new table
- Finalized reconciliation_snapshots cannot be UPDATE/DELETE
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 3.1 | Create Supabase project config | supabase/config.toml, .env.example with required vars | `supabase start` works locally | 2 |
| 3.2 | Create organizations table | Schema + RLS policy (users see own org only) | Migration runs, RLS verified | 2 |
| 3.3 | Create users table | Schema linked to auth.users, role column, RLS | FK constraint works | 2 |
| 3.4 | Create properties table | BOMA area columns, org_id FK, RLS | org isolation verified | 2 |
| 3.5 | Create units table | property_id FK, area columns, status, RLS | Cascade delete works | 2 |
| 3.6 | Create leases table | recovery_profile JSONB, GIN index, RLS | JSONB queries performant | 3 |
| 3.7 | Create import_batches table | file_hash for dedup, status, error_log JSONB | Unique hash constraint | 2 |
| 3.8 | Create gl_entries table | All normalized fields, composite indexes, RLS | Query by property+date fast | 3 |
| 3.9 | Create expense_pools table | Pool config fields, org FK, RLS | Basic CRUD works | 2 |
| 3.10 | Create pool_mappings table | Pattern field, allocation_percentage, RLS | M2M relationship works | 2 |
| 3.11 | Create reconciliation_snapshots table | Immutability RLS (no update if finalized), calc_trace JSONB | Finalize blocks updates | 3 |
| 3.12 | Enable pgAudit extension | Configure for DML logging on financial tables | Audit log captures changes | 2 |
| 3.13 | Create RLS negative test suite | Tests User_A cannot see User_B data for all tables | All assertions pass | 4 |
| 3.14 | Create database seed script | Seed dev data for testing (1 org, 2 properties, 5 leases) | `supabase db reset` seeds data | 2 |

---

### Epic 4: Backend API Skeleton & Auth

**Purpose**: Create FastAPI application structure with Supabase Auth integration.

**Dependencies**: Epic 3 (tables must exist)

**Artifacts Established**:
- FastAPI app factory pattern
- Supabase client configuration
- Auth middleware and dependencies
- Organization-scoped sessions
- OpenAPI documentation
- Error handling patterns

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 4.1 | Create FastAPI app entry point | main.py with CORS, OpenAPI config, health check | `/health` returns 200 | 2 |
| 4.2 | Configure Supabase client | Async client with connection pooling, env vars | Client connects successfully | 2 |
| 4.3 | Create get_current_user dependency | JWT validation, returns User model with org_id | 401 on invalid token | 3 |
| 4.4 | Create org-scoped session dependency | Filters all queries by user's organization_id | Cross-org query returns empty | 3 |
| 4.5 | Create API router structure | /api/v1/ prefix, routers for each resource | Routes registered, documented | 2 |
| 4.6 | Create error response schemas | 400, 401, 403, 404, 422, 500 Pydantic models | Errors have consistent format | 2 |
| 4.7 | Create exception handlers | Map exceptions to appropriate HTTP responses | Errors return JSON, not HTML | 2 |
| 4.8 | Create properties CRUD endpoints | GET list, GET one, POST, PUT, DELETE | All ops work, RLS enforced | 3 |
| 4.9 | Create units CRUD endpoints | Nested under properties, standard CRUD | Property FK enforced | 2 |
| 4.10 | Create leases CRUD endpoints | Include recovery_profile update endpoint | JSONB updates work | 3 |
| 4.11 | Create auth integration tests | Test 401/403 scenarios, org isolation | All auth paths covered | 3 |

---

### Epic 4.5: API Client & Contract Testing

**Purpose**: Ensure frontend and backend are ALWAYS in sync. Auto-generate TypeScript client from OpenAPI spec so the frontend can never call endpoints that don't exist or send wrong data shapes.

**Dependencies**: Epic 4 (API must exist to generate client)

**Artifacts Established**:
- Auto-generated TypeScript API client from OpenAPI
- Contract tests that fail if API changes break client
- E2E test infrastructure (Playwright)
- Integration test patterns for UI components

**CLAUDE.md Addition**:
```
### Integration Rules (CRITICAL)
- EVERY UI component that calls an API MUST use the generated API client (no raw fetch)
- Run `npm run generate-api-client` after ANY backend API change
- NEVER mock API responses in UI tests - use MSW with real response shapes
- Every UI epic MUST end with an integration test story that verifies real data flow
- E2E tests must pass before any PR is merged
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 4.5.1 | Configure OpenAPI export | FastAPI exports OpenAPI JSON at /openapi.json | Valid OpenAPI 3.0 spec | 1 |
| 4.5.2 | Set up openapi-typescript-codegen | Install and configure client generator | Generates typed client | 2 |
| 4.5.3 | Create API client generation script | `npm run generate-api-client` regenerates from spec | Script works, types valid | 2 |
| 4.5.4 | Add client generation to CI | CI fails if generated client is out of date | Detects API drift | 2 |
| 4.5.5 | Create API client wrapper | Wrapper with auth token injection, error handling | All requests authenticated | 3 |
| 4.5.6 | Set up MSW for testing | Mock Service Worker with real response shapes | Mocks match API spec | 3 |
| 4.5.7 | Create contract test helpers | Functions to validate response matches schema | Type mismatches caught | 2 |
| 4.5.8 | Set up Playwright for E2E | Playwright configured with test database | E2E tests can run | 3 |
| 4.5.9 | Create E2E test patterns | Login flow, create property, navigate | Patterns documented | 3 |
| 4.5.10 | Create integration test template | Template for UI integration tests | Can be copied for new features | 2 |

---

### Epic 5: Data Ingestion Engine

**Purpose**: Build the "Anti-Integration" parser layer using Strategy Pattern.

**Dependencies**: Epic 4 (API for file upload), Epic 3 (gl_entries table)

**Artifacts Established**:
- Abstract IngestionStrategy base class
- IngestionDispatcher with fingerprinting
- YardiVoyagerGLParser
- MRIRentRollParser
- GenericMappingParser
- Vectorized Pandas cleaning patterns

**CLAUDE.md Addition**:
```
### Ingestion Parser Rules
- Every parser MUST have fixture file in tests/fixtures/
- Parser tests MUST verify specific values from fixture (not just "doesn't crash")
- Use Pandas vectorized operations (no row-by-row loops)
- Preserve raw_row_data JSONB for every parsed row
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 5.1 | Create IngestionStrategy ABC | Abstract parse() method, output schema validation | ABC defined, cannot instantiate | 2 |
| 5.2 | Create file fingerprinting logic | Read first 1KB, regex patterns for Yardi/MRI | Correctly identifies source | 3 |
| 5.3 | Create IngestionDispatcher | Returns appropriate parser based on fingerprint | Dispatches correctly | 2 |
| 5.4 | Create vectorized currency cleaner | Handles `(500.00)`, `$1,234.56`, `500 CR` | All formats converted to Decimal | 3 |
| 5.5 | Create merged cell handler | Forward-fill (ffill) for property/building context | Context propagates correctly | 2 |
| 5.6 | Create garbage row filter | Remove footers, page numbers, dashed lines | Only data rows remain | 2 |
| 5.7 | Create YardiVoyagerGLParser | Full parser implementation | Parses fixture correctly | 4 |
| 5.8 | Create Yardi parser tests | Test with fixture, verify specific values | 95%+ coverage | 3 |
| 5.9 | Create MRIRentRollParser | Handle PERIOD, REF, SOURCE columns | Parses fixture correctly | 4 |
| 5.10 | Create MRI parser tests | Test with fixture, verify specific values | 95%+ coverage | 3 |
| 5.11 | Create GenericMappingParser | Returns raw DF, stores column mapping config | Mapping wizard can use output | 3 |
| 5.12 | Create import batch tracking | SHA256 dedup, status updates, error logging | Duplicate uploads rejected | 3 |
| 5.13 | Create gl_entries persistence | Batch insert from DataFrame, preserve raw_row_data | All rows inserted, FK valid | 3 |
| 5.14 | Create file upload endpoint | POST /ingestion/upload, multipart file handling | Returns batch_id, row count | 3 |
| 5.15 | Create performance benchmark | 5MB CSV parsed in <5s, <512MB memory | Benchmark passes | 2 |

---

### Epic 6: Financial Calculation Engine

**Purpose**: Build deterministic BOMA 2024-compliant calculation logic - the core IP.

**Dependencies**: Epic 5 (gl_entries to calculate)

**Artifacts Established**:
- `backend/app/services/calculation/` module
- Gross-up calculator with safety valve
- All three cap types (non-cumulative, cumulative, compounding)
- Base year normalization
- Expense pool aggregation
- Calculation trace logging

**CLAUDE.md Addition**:
```
### Financial Calculation Rules
- ALL calculation functions MUST have tests with hand-calculated expected values
- NO mocking of calculation functions in tests
- Use Decimal for all intermediate calculations (not just final)
- Every calculation MUST log to calculation_trace for audit trail
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 6.1 | Create occupancy calculator | Weighted average from rent roll data | Handles partial-year tenants | 3 |
| 6.2 | Create gross-up factor calculator | target_occupancy / actual_occupancy with min 1.0 | Never grosses down | 2 |
| 6.3 | Create variable expense filter | Identify expenses eligible for gross-up | Excludes Taxes, Insurance | 2 |
| 6.4 | Create safety valve logic | Grossed-up cannot exceed 100% occupancy cost | Valve triggers correctly | 2 |
| 6.5 | Create full gross-up calculation | Combine factor, filter, valve | End-to-end test passes | 4 |
| 6.6 | Create non-cumulative cap | min(actual, prior_year * (1 + cap_rate)) | Year 1 edge case handled | 3 |
| 6.7 | Create cumulative cap | Carries forward unused capacity | Multi-year test passes | 4 |
| 6.8 | Create cumulative compounding cap | Base grows exponentially | 5-year compound test | 4 |
| 6.9 | Create base year calculation | (current - base) * pro_rata_share | Positive/negative tested | 3 |
| 6.10 | Create base year normalization | Auto-gross-up if base year occupancy < 95% | Normalization triggers | 3 |
| 6.11 | Create expense pool aggregator | Sum gl_entries by pool via pool_mappings | Wildcards work | 3 |
| 6.12 | Create allocation percentage handler | Split allocations across pools | 50/50 split works | 2 |
| 6.13 | Create tenant share calculator | Apply pro_rata_share, admin_fee | All lease terms applied | 3 |
| 6.14 | Create calculation trace logger | Log each step to CalculationStep objects | Trace is complete | 3 |
| 6.15 | Create reconciliation orchestrator | Coordinate all calcs for property/period | Full reconciliation works | 4 |

---

### Epic 7: Reconciliation API

**Purpose**: Expose calculation engine via API with snapshot persistence.

**Dependencies**: Epic 6 (calculation engine)

**Artifacts Established**:
- Calculate reconciliation endpoint
- Snapshot CRUD endpoints
- Finalization workflow
- Variance detection
- Export endpoints (PDF, ERP write-back)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 7.1 | Create calculate endpoint | POST /reconciliation/calculate with property_id, period | Returns draft snapshot IDs | 3 |
| 7.2 | Create get snapshot endpoint | GET /reconciliation/snapshots/{id} with full trace | Includes calculation_trace | 2 |
| 7.3 | Create list snapshots endpoint | Filters: property, period, finalized; pagination | Returns paginated list | 2 |
| 7.4 | Create finalize endpoint | POST /snapshots/{id}/finalize locks record | 409 if already finalized | 3 |
| 7.5 | Create variance detection | Compare recalc to prior finalized snapshot | Flags >5% variance | 3 |
| 7.6 | Create tenant packet PDF export | GET /snapshots/{id}/export/pdf | PDF shows calculation breakdown | 4 |
| 7.7 | Create ERP write-back export | GET /snapshots/{id}/export/journal-entry | Yardi/MRI format file | 3 |

---

### Epic 8: Test Fixture Generation

**Purpose**: Create synthetic but realistic test data for all parsers and calculations.

**Dependencies**: Epics 5, 6 (need to know formats)

**Artifacts Established**:
- `tests/fixtures/yardi_gl_sample.csv`
- `tests/fixtures/mri_rentroll_sample.csv`
- `tests/fixtures/sample_lease.pdf`
- `tests/fixtures/expected_outputs/`

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 8.1 | Create Yardi GL fixture | 500+ rows with realistic accounts, merged headers | Fingerprint detected as Yardi | 3 |
| 8.2 | Create MRI rent roll fixture | 50+ units with PERIOD/REF/SOURCE columns | Fingerprint detected as MRI | 3 |
| 8.3 | Create malformed CSV fixtures | Files with common errors (encoding, missing cols) | Parser handles gracefully | 2 |
| 8.4 | Create sample lease PDF | Realistic commercial lease with all terms | document reader can parse | 3 |
| 8.5 | Create expected calculation outputs | JSON files with hand-calculated expected results | Tests can assert against | 4 |
| 8.6 | Create multi-property fixture set | 3 properties, 10 tenants, full GL data | End-to-end test scenario | 4 |

---

### Epic 9: Authentication UI

**Purpose**: Build login, registration, and user management interfaces.

**Dependencies**: Epic 1 (design system), Epic 4 (auth API)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 9.1 | Create login page | Email/password form, error handling | Redirects to dashboard on success | 3 |
| 9.2 | Create registration page | Email, password, org name; creates user + org | Welcome email sent | 3 |
| 9.3 | Create forgot password page | Email input, sends reset link | Confirmation message shown | 2 |
| 9.4 | Create auth context provider | Current user state, loading, logout function | Persists across refresh | 3 |
| 9.5 | Create protected route wrapper | Redirects to login if unauthenticated | Loading state during check | 2 |
| 9.6 | Create user profile page | Edit name, change password | Updates saved successfully | 3 |
| 9.7 | Create organization settings page | Edit org name, view subscription status | Changes persist | 2 |
| 9.8 | **INTEGRATION: Auth E2E test** | Playwright test: register → login → see dashboard | Full flow works with real backend | 3 |

---

### Epic 10: Property & Lease Management UI

**Purpose**: CRUD interfaces for master data with excellent UX.

**Dependencies**: Epic 1 (design system), Epic 4 (CRUD APIs)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 10.1 | Create property list page | Table with search, sort, pagination | Empty state with CTA | 3 |
| 10.2 | Create property detail page | Master-detail: info + tabs (Units, Leases, Imports) | Smooth tab transitions | 4 |
| 10.3 | Create property form | Create/edit with BOMA area fields | Validation feedback immediate | 3 |
| 10.4 | Create unit list component | Table within property detail, inline status toggle | Status changes optimistically | 3 |
| 10.5 | Create unit form modal | Add/edit unit in modal | Modal closes on success | 2 |
| 10.6 | Create lease list component | Table with tenant, dates, status badge | Status color-coded | 2 |
| 10.7 | Create lease form (basic) | Tenant name, dates, status | Validation on all fields | 3 |
| 10.8 | Create recovery profile editor | All LeaseRecoveryProfile fields with conditional sections | Cap fields only when cap_type != none | 4 |
| 10.9 | Create lease document upload | Upload PDF, link to lease record | Progress indicator, error handling | 3 |
| 10.10 | **INTEGRATION: Property CRUD E2E** | Playwright: create property → add unit → create lease → verify list | All data persists, lists update | 4 |

---

### Epic 11: Data Ingestion UI

**Purpose**: File upload with excellent feedback and error handling.

**Dependencies**: Epic 1 (design system), Epic 5 (ingestion API)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 11.1 | Create drag-and-drop uploader | Accept CSV/Excel, show file info | Visual feedback on drag | 3 |
| 11.2 | Create upload progress display | Progress bar, status updates | Animated progress | 2 |
| 11.3 | Create source detection display | Show detected source system | User can override if wrong | 2 |
| 11.4 | Create column mapping wizard | For generic files: show sample, drag-drop mapping | Required fields enforced | 4 |
| 11.5 | Create import history list | All imports with status badges, dates | Filter by status | 3 |
| 11.6 | Create import error display | Show parsing errors with row context | Actionable error messages | 3 |
| 11.7 | Create GL entry preview | Paginated table of imported entries | Column sorting, search | 3 |
| 11.8 | **INTEGRATION: Ingestion E2E test** | Playwright: upload CSV → verify detection → see imported GL entries in preview | File persists to backend, entries visible | 4 |

---

### Epic 12: Reconciliation Grid UI

**Purpose**: High-performance virtualized grid - the core workspace replacing Excel.

**Dependencies**: Epic 1 (design system), Epic 7 (reconciliation API)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 12.1 | Create base virtualized grid | TanStack Table + Virtual, 1000+ rows at 60fps | Smooth scrolling | 4 |
| 12.2 | Create cell renderers | Currency, percentage, date formatters | Consistent formatting | 3 |
| 12.3 | Create editable cells | Click-to-edit with Zod validation | Invalid values rejected | 4 |
| 12.4 | Create optimistic updates | onMutate updates cache, rollback on error | Toast on error with revert | 4 |
| 12.5 | Create column configuration | Resize, reorder, hide columns | Persists to localStorage | 3 |
| 12.6 | Create keyboard navigation | Arrow keys, tab, enter, escape | Focus visible, accessible | 3 |
| 12.7 | Create expense pool grouping | Collapsible groups, subtotals | Expand/collapse animation | 3 |
| 12.8 | Create tenant summary view | Alternative view: one row per tenant | Toggle between views | 3 |
| 12.9 | Create calculation trace drawer | Click calculated cell to see breakdown | Links to source entries | 3 |
| 12.10 | Create calculate button | Trigger recalculation with loading state | Results update in grid | 2 |
| 12.11 | Create finalize workflow | Finalize button with confirmation dialog | Grid shows locked state | 3 |
| 12.12 | **INTEGRATION: Reconciliation E2E test** | Playwright: select property → run calculation → verify grid shows real values → finalize → confirm locked | Calculations from backend, finalized state persists | 4 |

---

### Epic 13: Reporting & Export UI

**Purpose**: Generate tenant packets and ERP write-back files.

**Dependencies**: Epic 7 (export APIs), Epic 12 (reconciliation context)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 13.1 | Create export options panel | Select export format (PDF, Yardi, MRI) | Format descriptions shown | 2 |
| 13.2 | Create PDF preview | Preview tenant packet before download | Renders correctly | 3 |
| 13.3 | Create batch PDF export | Export all tenant packets as ZIP | Progress indicator | 3 |
| 13.4 | Create ERP export config | Select format, set options | Validates required fields | 2 |
| 13.5 | Create export history | List of past exports with download links | Links expire after 24h | 3 |
| 13.6 | Create variance report | Show changes from prior year | Highlight significant variances | 3 |
| 13.7 | **INTEGRATION: Export E2E test** | Playwright: select finalized snapshot → export PDF → verify download → export ERP file → verify format | Real files generated from backend data | 4 |

---

### Epic 14: OCR Pipeline (Post-MVP)

**Purpose**: document reader integration for lease document processing.

**Dependencies**: Epic 4 (backend infrastructure)

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 14.1 | Configure document reader client | Boto3 async client, credentials from env | Client initializes | 2 |
| 14.2 | Create document upload handler | Queue PDF for document reader processing | Returns job ID | 2 |
| 14.3 | Create document reader job poller | Poll for completion, handle failures | Retries on transient errors | 3 |
| 14.4 | Create result parser | Extract text blocks with bounding boxes | Preserves geometry | 3 |
| 14.5 | Create table extraction handler | Parse detected tables to structured data | Tables converted to JSON | 3 |
| 14.6 | Create OCR result persistence | Store extracted text with coordinates | Queryable by document | 2 |

---

### Epic 15: LLM Lease Extraction (Post-MVP)

**Purpose**: Claude 3.5 Sonnet integration to extract Financial DNA from lease text.

**Dependencies**: Epic 14 (OCR pipeline)

**CLAUDE.md Addition**:
```
### LLM Integration Rules
- All Anthropic API calls MUST use Zero Data Retention headers
- LLM output MUST be validated against Pydantic schema
- NEVER use LLM for financial calculations (deterministic code only)
- All extractions require human verification before persistence
```

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 15.1 | Configure Anthropic client | Claude client with ZDR headers | Zero retention confirmed | 2 |
| 15.2 | Create extraction prompt | Prompt for LeaseRecoveryProfile fields | Returns valid JSON | 3 |
| 15.3 | Create extraction orchestrator | Coordinates OCR text + LLM extraction | End-to-end works | 3 |
| 15.4 | Create confidence scoring | LLM reports confidence per field | Low confidence flagged | 3 |
| 15.5 | Create validation layer | Validate LLM output against Pydantic schema | Invalid output rejected | 2 |
| 15.6 | Create extraction job queue | Background processing with status updates | Job status queryable | 3 |

---

### Epic 16: Human-in-the-Loop Verification UI (Post-MVP)

**Purpose**: PDF viewer with extraction verification - ensures accuracy before persistence.

**Dependencies**: Epic 14, Epic 15, Epic 1

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 16.1 | Install react-pdf | PDF viewer component with page navigation | PDF renders correctly | 2 |
| 16.2 | Create split-screen layout | PDF on left, form on right | Responsive, resizable | 3 |
| 16.3 | Create bounding box overlay | Highlight text regions on PDF | Coordinates map correctly | 4 |
| 16.4 | Create field-to-PDF linking | Click form field, PDF scrolls to source | Smooth scroll animation | 4 |
| 16.5 | Create confidence indicators | Visual indicators for low-confidence fields | Color-coded, tooltips | 2 |
| 16.6 | Create edit interface | Edit extracted values inline | Changes tracked as pending | 3 |
| 16.7 | Create approval workflow | Approve button commits to database | Confirmation dialog | 2 |
| 16.8 | Create reject workflow | Reject sends back for re-extraction | Reason captured | 2 |
| 16.9 | **INTEGRATION: HITL E2E test** | Playwright: upload lease PDF → view extraction → edit field → approve → verify lease record updated | Full OCR→LLM→approval flow with real services | 4 |

---

### Epic 17: Advanced Expense Pools (Post-MVP)

**Purpose**: Complex pool configurations and split allocations.

**Dependencies**: Epic 6, Epic 7

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 17.1 | Create pool hierarchy | Parent/child pools for nested categories | Hierarchy queries work | 3 |
| 17.2 | Create split allocation UI | Visual split config for GL accounts | Percentages sum to 100 | 3 |
| 17.3 | Create pool templates | Predefined pool configs (Retail, Office, Industrial) | Templates apply correctly | 3 |
| 17.4 | Create pool copying | Copy config from one property to another | All settings transferred | 2 |

---

### Epic 18: Historical Analysis (Post-MVP)

**Purpose**: Year-over-year comparisons and trend detection.

**Dependencies**: Epic 7

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 18.1 | Create YoY comparison view | Side-by-side years with variance | Variance calculated correctly | 3 |
| 18.2 | Create trend chart | Line chart showing expense trends | Multiple years supported | 3 |
| 18.3 | Create anomaly detection | Flag unusual expense changes | Threshold configurable | 4 |
| 18.4 | Create historical export | Export multi-year data to Excel | All years in one file | 2 |

---

### Epic 19: Tenant Portal (Post-MVP)

**Purpose**: Read-only access for tenants to view their bills.

**Dependencies**: Epic 7, Epic 13

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 19.1 | Create tenant user role | Separate auth flow for tenants | Tenant sees only their leases | 3 |
| 19.2 | Create tenant dashboard | View bills, download PDFs | Clean, simple UI | 4 |
| 19.3 | Create tenant notification | Email when new reconciliation available | Link to portal | 2 |
| 19.4 | Create dispute workflow | Tenant can flag questions | Landlord receives notification | 3 |

---

### Epic 20: Mobile Optimization (Post-MVP)

**Purpose**: Responsive design and PWA capabilities.

**Dependencies**: Epic 1, all UI epics

**Stories**:

| ID | Title | Description | AC Summary | Hours |
|----|-------|-------------|------------|-------|
| 20.1 | Audit mobile responsiveness | Test all pages on mobile viewport | No horizontal scroll | 4 |
| 20.2 | Create mobile navigation | Bottom nav or hamburger menu | Thumb-friendly | 3 |
| 20.3 | Optimize grid for mobile | Alternative card view for small screens | Cards scroll vertically | 4 |
| 20.4 | Add PWA manifest | Install prompt, offline indicator | Works as installed app | 2 |

---

## Dependency Graph

```
Epic 0 (Foundation)
    │
    ├──► Epic 1 (Design System)
    │        │
    │        └──► Epic 9-13, 16 (All UI)
    │
    └──► Epic 2 (Type System)
             │
             └──► Epic 3 (Database)
                      │
                      └──► Epic 4 (API Skeleton)
                               │
                               ├──► Epic 5 (Ingestion Engine)
                               │        │
                               │        └──► Epic 6 (Calculation Engine)
                               │                 │
                               │                 └──► Epic 7 (Reconciliation API)
                               │                          │
                               │                          └──► Epic 12-13 (Recon UI, Reports)
                               │
                               └──► Epic 14-16 (AI Pipeline - Post MVP)
```

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total Epics | 21 (including Epic 4.5) |
| MVP Epics | 14 |
| Post-MVP Epics | 7 |
| Total Stories | ~180 |
| MVP Stories | ~125 |
| Integration Test Stories | 6 (one per UI epic) |

**Note**: Every UI epic now includes a mandatory integration test story that verifies the frontend properly connects to real backend endpoints with actual data flow.

---

## Next Steps

1. Review this plan with stakeholder
2. Refine story acceptance criteria as needed
3. Begin Epic 0 implementation
4. Update CLAUDE.md with enforcement rules after each epic
