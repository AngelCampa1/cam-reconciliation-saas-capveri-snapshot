# CapVeri - Epic Index

> **Quick Navigation**: Use this index to navigate to epic overviews and understand project structure.

---

## Project Statistics

- **Total Epics**: 26 (including Epic 4.5)
- **Total Stories**: 222
- **Estimated Hours**: ~640
- **Story Tracker**: [STORY_TRACKER.md](./STORY_TRACKER.md)

---

## Epic Overview

### Foundation & Infrastructure (Epics 0-6)

#### [Epic 0: Developer Foundation & Tooling](./epic-00/_overview.md)
**Purpose**: Establish development environment, tooling, and CI/CD pipeline
**Stories**: 8 | **Hours**: 16
**Dependencies**: None

#### [Epic 1: Design System & UI Foundation](./epic-01/_overview.md)
**Purpose**: Build reusable UI component library with Shadcn/UI and Tailwind CSS
**Stories**: 14 | **Hours**: 45
**Dependencies**: Epic 0

#### [Epic 2: Shared Type System & Domain Models](./epic-02/_overview.md)
**Purpose**: Define type-safe contracts between frontend and backend
**Stories**: 18 | **Hours**: 49
**Dependencies**: None

#### [Epic 3: Database Schema & Multi-Tenancy](./epic-03/_overview.md)
**Purpose**: Build PostgreSQL schema with RLS for secure multi-tenancy
**Stories**: 19 | **Hours**: 58
**Dependencies**: Epic 2

#### [Epic 4: Backend API Skeleton & Authentication](./epic-04/_overview.md)
**Purpose**: Establish FastAPI structure with Supabase authentication
**Stories**: 11 | **Hours**: 35
**Dependencies**: Epic 3

#### [Epic 4.5: API Client & Contract Testing](./epic-04.5/_overview.md)
**Purpose**: Generate type-safe API client and ensure frontend/backend contracts stay synchronized
**Stories**: 3 | **Hours**: 9
**Dependencies**: Epic 4

#### [Epic 5: Data Ingestion Engine](./epic-05/_overview.md)
**Purpose**: Build CSV/Excel parser with strategy pattern for Yardi, MRI, and generic formats
**Stories**: 15 | **Hours**: 52
**Dependencies**: Epic 3, Epic 4

#### [Epic 6: Financial Calculation Engine](./epic-06/_overview.md)
**Purpose**: Implement BOMA 2024 compliant CAM reconciliation calculations
**Stories**: 13 | **Hours**: 50
**Dependencies**: Epic 2, Epic 5

---

### Backend APIs (Epics 7-8)

#### [Epic 7: Reconciliation API](./epic-07/_overview.md)
**Purpose**: Expose reconciliation calculation and snapshot management endpoints
**Stories**: 7 | **Hours**: 25
**Dependencies**: Epic 6

#### [Epic 8: Test Fixture Generation](./epic-08/_overview.md)
**Purpose**: Create realistic test data for development and testing
**Stories**: 6 | **Hours**: 22
**Dependencies**: Epic 2, Epic 3, Epic 6

---

### Frontend UI (Epics 9-13)

#### [Epic 9: Authentication UI](./epic-09/_overview.md)
**Purpose**: Build login, registration, and user management interfaces with SSO
**Stories**: 12 | **Hours**: 30
**Dependencies**: Epic 1, Epic 4, Epic 4.5

#### [Epic 10: Property & Lease Management UI](./epic-10/_overview.md)
**Purpose**: Build CRUD interfaces for properties, units, and leases
**Stories**: 10 | **Hours**: 31
**Dependencies**: Epic 1, Epic 4, Epic 4.5, Epic 9

#### [Epic 11: Data Ingestion UI](./epic-11/_overview.md)
**Purpose**: Build file upload and column mapping interface
**Stories**: 8 | **Hours**: 24
**Dependencies**: Epic 1, Epic 5, Epic 9

#### [Epic 12: Reconciliation Grid UI](./epic-12/_overview.md)
**Purpose**: Build virtualized TanStack Table grid for reconciliation data
**Stories**: 12 | **Hours**: 36
**Dependencies**: Epic 1, Epic 7, Epic 9

#### [Epic 13: Reporting & Export UI](./epic-13/_overview.md)
**Purpose**: Build tenant packet PDF export and ERP write-back interface
**Stories**: 7 | **Hours**: 20
**Dependencies**: Epic 1, Epic 7, Epic 12

---

### AI & Document Processing (Epics 14-16)

#### [Epic 14: OCR Pipeline](./epic-14/_overview.md)
**Purpose**: Build document reader integration for lease document processing
**Stories**: 6 | **Hours**: 15
**Dependencies**: Epic 4, Epic 3

#### [Epic 15: LLM Lease Extraction](./epic-15/_overview.md)
**Purpose**: Integrate Claude 3.5 Sonnet for "Financial DNA" extraction
**Stories**: 6 | **Hours**: 16
**Dependencies**: Epic 14, Epic 2

#### [Epic 16: Human-in-the-Loop Verification UI](./epic-16/_overview.md)
**Purpose**: Build PDF overlay verification interface with visual grounding
**Stories**: 9 | **Hours**: 26
**Dependencies**: Epic 1, Epic 15

---

### Advanced Features (Epics 17-20)

#### [Epic 17: Advanced Expense Pools](./epic-17/_overview.md)
**Purpose**: Support tiered recovery, custom formulas, and complex pool rules
**Stories**: 4 | **Hours**: 11
**Dependencies**: Epic 6, Epic 12

#### [Epic 18: Historical Analysis](./epic-18/_overview.md)
**Purpose**: Build multi-year trending and variance detection
**Stories**: 4 | **Hours**: 12
**Dependencies**: Epic 7, Epic 12

#### [Epic 19: Tenant Portal](./epic-19/_overview.md)
**Purpose**: Build read-only tenant access to reconciliation results
**Stories**: 4 | **Hours**: 12
**Dependencies**: Epic 4, Epic 13

#### [Epic 20: Mobile Optimization](./epic-20/_overview.md)
**Purpose**: Responsive design and mobile-optimized workflows
**Stories**: 4 | **Hours**: 13
**Dependencies**: Epic 1, Epic 12

---

### Billing & Monetization (Epics 21-22)

#### [Epic 21: Billing & Subscriptions](./epic-21/_overview.md)
**Purpose**: Full Stripe integration for subscription billing and payment management
**Stories**: 12 | **Hours**: 35
**Dependencies**: Epic 4, Epic 3.15-3.16

#### [Epic 22: Promotions & Discounts](./epic-22/_overview.md)
**Purpose**: Stripe-native coupon codes and promotional campaigns
**Stories**: 4 | **Hours**: 9
**Dependencies**: Epic 21

---

### Platform Features (Epic 23)

#### [Epic 23: User Feedback](./epic-23/_overview.md)
**Purpose**: In-app feedback widget for bug reports and feature requests
**Stories**: 4 | **Hours**: 10
**Dependencies**: Epic 4, Epic 1, Epic 3.18

---

### Quality Assurance (Epic 24)

#### [Epic 24: End-to-End Verification & Integration Testing](./epic-24/_overview.md)
**Purpose**: Comprehensive E2E verification of all implemented epics, ensuring complete implementation and proper integration
**Stories**: 12 | **Hours**: 60
**Dependencies**: All epics (0-23)

---

## Epic Dependencies Visualization

```
Epic 0 (Foundation)
  └─> Epic 1 (Design System)
        ├─> Epic 9 (Auth UI + SSO)
        ├─> Epic 10 (Property/Lease UI)
        ├─> Epic 11 (Ingestion UI)
        ├─> Epic 12 (Reconciliation Grid)
        ├─> Epic 13 (Reporting UI)
        ├─> Epic 16 (HITL UI)
        ├─> Epic 20 (Mobile)
        └─> Epic 23 (Feedback Widget)

Epic 2 (Type System)
  ├─> Epic 3 (Database)
  │     ├─> Epic 4 (Backend API)
  │     │     ├─> Epic 4.5 (API Client)
  │     │     ├─> Epic 5 (Ingestion Engine)
  │     │     ├─> Epic 9 (Auth UI + SSO)
  │     │     ├─> Epic 19 (Tenant Portal)
  │     │     ├─> Epic 21 (Billing) ──> Epic 22 (Promotions)
  │     │     └─> Epic 23 (Feedback)
  │     ├─> Epic 5 (Ingestion Engine)
  │     │     └─> Epic 11 (Ingestion UI)
  │     ├─> Epic 8 (Test Fixtures)
  │     └─> Epic 14 (OCR Pipeline)
  │           └─> Epic 15 (LLM Extraction)
  │                 └─> Epic 16 (HITL UI)
  ├─> Epic 6 (Calculation Engine)
  │     ├─> Epic 7 (Reconciliation API)
  │     │     ├─> Epic 12 (Grid UI)
  │     │     │     ├─> Epic 13 (Export UI)
  │     │     │     ├─> Epic 17 (Advanced Pools)
  │     │     │     ├─> Epic 18 (Historical Analysis)
  │     │     │     └─> Epic 20 (Mobile)
  │     │     └─> Epic 18 (Historical Analysis)
  │     ├─> Epic 8 (Test Fixtures)
  │     └─> Epic 17 (Advanced Pools)
  └─> Epic 15 (LLM Extraction)
```

---

## How to Use This Index

### For Developers
1. Review dependencies before starting work on an epic
2. Check the overview file for detailed acceptance criteria
3. Use the story tracker to claim and track individual stories

### For Project Managers
- Use story counts and hour estimates for sprint planning
- Track epic completion via the story tracker
- Identify critical path using dependency visualization

### For Agents
- Claim stories from [STORY_TRACKER.md](./STORY_TRACKER.md)
- Read epic overview files for context and constraints
- Follow story file templates for implementation guidance

---

## Story File Locations

Individual story files follow this pattern:
```
docs/stories/epic-{XX}/story-{XX}.{Y}.md
```

**Examples**:
- Story 5.7 → `docs/stories/epic-05/story-05.07-create-yardi-voyager-gl-parser.md`
- Story 12.3 → `docs/stories/epic-12/story-12.3-placeholder-title.md`
- Story 4.5.2 → `docs/stories/epic-04.5/story-04.5.2-set-up-openapi-typescript-codegen.md`

---

## Related Documentation

- **[STORY_TRACKER.md](./STORY_TRACKER.md)** - Master story tracking with status
- **[CLAUDE.md](../../CLAUDE.md)** - Development guidelines and coding standards
- **[Architecture for CapVeri.md](../Architecture%20for%20CapVeri.md)** - System architecture

---

*Last Updated: 2025-12-30*
