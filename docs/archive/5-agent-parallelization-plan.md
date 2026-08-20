# 5-Agent Parallel Execution Plan for CapVeri
## Complete 210-Story Implementation Strategy

---

## Executive Summary

**Goal**: Complete all 210 user stories across 25 epics using 5 full-stack agents working in parallel.

**Strategy**: Wave-based execution with strict blocking on dependencies. Each agent owns complete epics (both backend + frontend stories) to minimize context switching.

**Total Estimated Duration**:
- **Sequential (1 agent)**: ~580 hours
- **Optimized (5 agents)**: ~252 hours wall-clock time (critical path: Epic 0→2→1→3→4→5→6→7)
- **Actual Parallel Work**: ~300 hours of concurrent work across 5 agents
- **⚠️ CRITICAL**: Epic 7 blocks on Epic 6 completion (hour 227), creating sequential dependency

**Key Constraints**:
- ✅ Full-stack agents (each owns complete epics)
- ✅ Strict blocking (agents wait when dependencies not met)
- ✅ Even workload distribution (~100 hours per agent)
- ✅ Minimal file conflicts through epic-level ownership

---

## Agent Assignments & Workload Distribution

### Agent 1: Foundation & Core UI (109 hours)
**Primary Role**: Project scaffolding, design system, auth (with SSO), and reports

| Epic | Stories | Hours | Dependencies | Starts After |
|------|---------|-------|--------------|--------------|
| **Epic 0** | 8 | 15 | None | Immediate |
| **Epic 1** | 14 | 45 | Epic 0 | Wave 2 |
| **Epic 9** | 12 | 30 | Epic 1, 4, 4.5 | Wave 5 |
| **Epic 13** | 7 | 20 | Epic 1, 7, 12 | Wave 7 |

**Total**: 41 stories, 110 hours

**Note**: Epic 9 expanded to include Google/Apple SSO stories (9.8-9.11).

**Agent 1 Timeline**:
- **Hour 0-15**: Epic 0 (SOLO - all other agents idle)
- **Hour 15-60**: Epic 1 (parallel with Agent 2 on Epic 2, 3)
- **Hour 61-82**: IDLE (waiting for Epic 4, 4.5)
- **Hour 82-103**: Epic 9 (parallel with other agents)
- **Hour 103-123**: Epic 13 (parallel with other agents)

---

### Agent 2: Type System & Database (129 hours)
**Primary Role**: Pydantic/Zod schemas, PostgreSQL, RLS, test fixtures

| Epic | Stories | Hours | Dependencies | Starts After |
|------|---------|-------|--------------|--------------|
| **Epic 2** | 18 | 49 | None | Immediate |
| **Epic 3** | 19 | 58 | Epic 2 | Wave 3 |
| **Epic 8** | 6 | 22 | Epic 2, 3, 6 | Wave 6 |

**Total**: 43 stories, 129 hours

**Note**: Epic 2 expanded to include billing/feedback models (2.15-2.18). Epic 3 expanded to include billing/feedback tables (3.15-3.19).

**Agent 2 Timeline**:
- **Hour 0-42**: Epic 2 (parallel with Agent 1 on Epic 0, then Epic 1)
- **Hour 42-90**: Epic 3 (parallel with Agent 1 on Epic 1)
- **Hour 90-112**: Epic 8 (parallel with other agents, waits for Epic 6)

---

### Agent 3: Backend APIs & Billing (126 hours)
**Primary Role**: FastAPI routes, middleware, CRUD endpoints, reconciliation API, billing/promotions

| Epic | Stories | Hours | Dependencies | Starts After |
|------|---------|-------|--------------|--------------|
| **Epic 4** | 11 | 35 | Epic 3 | Wave 4 |
| **Epic 4.5** | 3 | 9 | Epic 4 | Wave 5 |
| **Epic 7** | 7 | 25 | **Epic 6** | **Wave 7** |
| **Epic 19** | 4 | 12 | Epic 4, 13 | Wave 8 |
| **Epic 21** | 12 | 35 | Epic 4, 3.15-3.16 | Wave 6 |
| **Epic 22** | 4 | 9 | Epic 21 | Wave 8 |

**Total**: 41 stories, 125 hours

**Note**: Epic 21 (Billing) and Epic 22 (Promotions) use Stripe-first approach for payment/discount management.

**⚠️ CRITICAL DEPENDENCY**: Epic 7 CANNOT start until Epic 6 completes (hour 227). Agent 3 will have minimal idle time before Epic 7.

**Agent 3 Timeline**:
- **Hour 0-90**: IDLE (waiting for Epic 3)
- **Hour 90-125**: Epic 4 (parallel with Agent 2 on Epic 3)
- **Hour 125-134**: Epic 4.5 (parallel with other agents)
- **Hour 134-169**: Epic 21 (parallel with other agents, after Epic 4 and billing tables)
- **Hour 169-200**: Epic 10 (parallel with other agents, all deps met at hour 134)
- **Hour 200-212**: Epic 19 (parallel with other agents, deps Epic 4, 13 met at hour 134)
- **Hour 212-221**: Epic 22 (after Epic 21 completes)
- **Hour 221-227**: IDLE (6 hours - waiting for Epic 6 to complete)
- **Hour 227-252**: Epic 7 (BLOCKS on Epic 6 completion at hour 227)

---

### Agent 4: Data Processing (107 hours)
**Primary Role**: Ingestion parsers, OCR, LLM extraction, ingestion UI

| Epic | Stories | Hours | Dependencies | Starts After |
|------|---------|-------|--------------|--------------|
| **Epic 5** | 15 | 52 | Epic 3, 4 | Wave 5 |
| **Epic 11** | 8 | 24 | Epic 1, 5, 9 | Wave 6 |
| **Epic 14** | 6 | 15 | Epic 4, 3 | Wave 5 |
| **Epic 15** | 6 | 16 | Epic 14, 2 | Wave 6 |

**Total**: 35 stories, 107 hours

**Agent 4 Timeline**:
- **Hour 0-125**: IDLE (waiting for Epic 3, 4)
- **Hour 125-177**: Epic 5 (parallel with other agents)
- **Hour 177-192**: Epic 14 (parallel with other agents)
- **Hour 192-216**: Epic 11 (parallel with other agents, waits for Epic 9)
- **Hour 216-232**: Epic 15 (parallel with other agents)

---

### Agent 5: Financial Engine & Reconciliation UI (158 hours)
**Primary Role**: BOMA calculations, expense pools, reconciliation grid, advanced features, feedback

| Epic | Stories | Hours | Dependencies | Starts After |
|------|---------|-------|--------------|--------------|
| **Epic 6** | 13 | 50 | Epic 2, 5 | Wave 6 |
| **Epic 12** | 12 | 36 | Epic 1, **Epic 7**, 9 | Wave 7 |
| **Epic 16** | 9 | 26 | Epic 1, 15 | Wave 7 |
| **Epic 17** | 4 | 11 | Epic 6, 12 | Wave 8 |
| **Epic 18** | 4 | 12 | **Epic 7**, 12 | Wave 8 |
| **Epic 20** | 4 | 13 | Epic 1, 12 | Wave 8 |
| **Epic 23** | 4 | 10 | Epic 4, 1, 3.18 | Wave 6 |

**Total**: 50 stories, 158 hours (Epic 10 moved to Agent 3)

**Note**: Epic 23 (User Feedback) provides in-app feedback widget with screenshot capture.

**Agent 5 Timeline**:
- **Hour 0-177**: IDLE (waiting for Epic 5)
- **Hour 177-227**: Epic 6 (CRITICAL: Epic 7 depends on this!)
- **Hour 227-237**: Epic 23 (parallel with Agent 3 starting Epic 7)
- **Hour 237-273**: Epic 12 (depends on Epic 7 completion at hour 252)
- **Hour 273-299**: Epic 16 (parallel with other agents)
- **Hour 299-310**: Epic 17 (parallel with other agents)
- **Hour 310-322**: Epic 18 (depends on Epic 7)
- **Hour 322-335**: Epic 20 (parallel with other agents)

---

## Workload Rebalancing

**Problem**: Agent 5 has 189 hours vs Agent 3's 125 hours (significant difference).

**Solution**: Transfer Epic 10 (Property/Lease UI) from Agent 5 to Agent 3.

### Rebalanced Agent 3: Backend APIs + Property UI + Billing (156 hours)
| Epic | Stories | Hours | Dependencies |
|------|---------|-------|--------------|
| **Epic 4** | 11 | 35 | Epic 3 |
| **Epic 4.5** | 3 | 9 | Epic 4 |
| **Epic 7** | 7 | 25 | **Epic 6 (BLOCKING)** |
| **Epic 10** | 10 | 31 | Epic 1, 4, 4.5, 9 |
| **Epic 19** | 4 | 12 | Epic 4, 13 |
| **Epic 21** | 12 | 35 | Epic 4, 3.15-3.16 |
| **Epic 22** | 4 | 9 | Epic 21 |

**Total**: 51 stories, 156 hours ✅

**Corrected Timeline**:
- **Hour 0-90**: IDLE (waiting for Epic 3)
- **Hour 90-125**: Epic 4
- **Hour 125-134**: Epic 4.5
- **Hour 134-169**: Epic 21 (Billing & Subscriptions)
- **Hour 169-200**: Epic 10 (Property/Lease UI)
- **Hour 200-212**: Epic 19 (Tenant Portal)
- **Hour 212-221**: Epic 22 (Promotions)
- **Hour 221-227**: IDLE (6 hours - BLOCKS on Epic 6)
- **Hour 227-252**: Epic 7 (Reconciliation API - starts when Epic 6 completes)

### Rebalanced Agent 5: Financial Engine & Grid UI + Feedback (158 hours)
| Epic | Stories | Hours | Dependencies |
|------|---------|-------|--------------|
| **Epic 6** | 13 | 50 | Epic 2, 5 |
| **Epic 12** | 12 | 36 | Epic 1, 7, 9 |
| **Epic 16** | 9 | 26 | Epic 1, 15 |
| **Epic 17** | 4 | 11 | Epic 6, 12 |
| **Epic 18** | 4 | 12 | Epic 7, 12 |
| **Epic 20** | 4 | 13 | Epic 1, 12 |
| **Epic 23** | 4 | 10 | Epic 4, 1, 3.18 |

**Total**: 50 stories, 158 hours ✅

### Final Workload Distribution

| Agent | Epics Owned | Stories | Hours | % of Total |
|-------|-------------|---------|-------|------------|
| **Agent 1** | 0, 1, 9, 13 | 41 | 110 | 19% |
| **Agent 2** | 2, 3, 8 | 43 | 129 | 22% |
| **Agent 3** | 4, 4.5, 7, 10, 19, 21, 22 | 51 | 156 | 27% |
| **Agent 4** | 5, 11, 14, 15 | 35 | 107 | 18% |
| **Agent 5** | 6, 12, 16, 17, 18, 20, 23 | 50 | 158 | 27% |
| **TOTAL** | 25 epics | 210 stories | 580 hours* | 100% |

**Note**: *Hours don't sum exactly due to individual story adjustments. Agents 3 and 5 have slightly higher loads due to billing/monetization and advanced features.

---

## Wave Execution Timeline

**RULE: 1 Agent = 1 Epic per Wave (maximum)**

Each wave shows exactly which agent works on which epic. No agent works on multiple epics within a single wave.

---

### Wave 1
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | **Epic 0**: Developer Foundation | 15h | None |
| Agent 2 | **Epic 2**: Type System | 49h | None |
| Agent 3 | IDLE | - | Waiting for Epic 3 |
| Agent 4 | IDLE | - | Waiting for Epic 4 |
| Agent 5 | IDLE | - | Waiting for Epic 5 |

---

### Wave 2
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | **Epic 1**: Design System | 45h | Epic 0 ✓ |
| Agent 2 | (completing Epic 2) | - | - |
| Agent 3 | IDLE | - | Waiting for Epic 3 |
| Agent 4 | IDLE | - | Waiting for Epic 4 |
| Agent 5 | IDLE | - | Waiting for Epic 5 |

---

### Wave 3
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | (completing Epic 1) | - | - |
| Agent 2 | **Epic 3**: Database Schema | 58h | Epic 2 ✓ |
| Agent 3 | IDLE | - | Waiting for Epic 3 |
| Agent 4 | IDLE | - | Waiting for Epic 4 |
| Agent 5 | IDLE | - | Waiting for Epic 5 |

---

### Wave 4
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 4.5 |
| Agent 2 | IDLE | - | Waiting for Epic 6 |
| Agent 3 | **Epic 4**: Backend API | 35h | Epic 3 ✓ |
| Agent 4 | IDLE | - | Waiting for Epic 4 |
| Agent 5 | IDLE | - | Waiting for Epic 5 |

---

### Wave 5
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 4.5 |
| Agent 2 | IDLE | - | Waiting for Epic 6 |
| Agent 3 | **Epic 4.5**: API Client | 9h | Epic 4 ✓ |
| Agent 4 | **Epic 5**: Ingestion Engine | 52h | Epic 3 ✓, Epic 4 ✓ |
| Agent 5 | **Epic 14**: OCR Pipeline | 15h | Epic 3 ✓, Epic 4 ✓ |

---

### Wave 6
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | **Epic 9**: Auth UI (with SSO) | 30h | Epic 1 ✓, Epic 4 ✓, Epic 4.5 ✓ |
| Agent 2 | IDLE | - | Waiting for Epic 6 |
| Agent 3 | **Epic 21**: Billing & Subscriptions | 35h | Epic 4 ✓ |
| Agent 4 | (completing Epic 5) | - | - |
| Agent 5 | (completing Epic 14) | - | - |

---

### Wave 7
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 7, 12 |
| Agent 2 | IDLE | - | Waiting for Epic 6 |
| Agent 3 | **Epic 10**: Property/Lease UI | 31h | Epic 1 ✓, Epic 4 ✓, Epic 4.5 ✓, Epic 9 ✓ |
| Agent 4 | **Epic 11**: Ingestion UI | 24h | Epic 1 ✓, Epic 5 ✓, Epic 9 ✓ |
| Agent 5 | **Epic 6**: Calculation Engine | 50h | Epic 2 ✓, Epic 5 ✓ |

⚠️ **CRITICAL**: Epic 6 blocks Epic 7!

---

### Wave 8
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 7, 12 |
| Agent 2 | **Epic 8**: Test Fixtures | 22h | Epic 2 ✓, Epic 3 ✓, Epic 6 ✓ |
| Agent 3 | **Epic 19**: Tenant Portal | 12h | Epic 4 ✓ |
| Agent 4 | **Epic 15**: LLM Extraction | 16h | Epic 14 ✓, Epic 2 ✓ |
| Agent 5 | (completing Epic 6) | - | - |

---

### Wave 9
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 7, 12 |
| Agent 2 | IDLE | - | Complete |
| Agent 3 | **Epic 7**: Reconciliation API | 25h | **Epic 6 ✓** |
| Agent 4 | IDLE | - | Complete |
| Agent 5 | **Epic 23**: User Feedback | 10h | Epic 4 ✓, Epic 1 ✓ |

⚠️ **Epic 7 finally starts** after Epic 6 completes!

---

### Wave 10
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Waiting for Epic 12 |
| Agent 2 | IDLE | - | Complete |
| Agent 3 | **Epic 22**: Promotions | 9h | Epic 21 ✓ |
| Agent 4 | IDLE | - | Complete |
| Agent 5 | **Epic 12**: Reconciliation Grid | 36h | Epic 1 ✓, **Epic 7 ✓**, Epic 9 ✓ |

---

### Wave 11
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | **Epic 13**: Export UI | 20h | Epic 1 ✓, Epic 7 ✓, Epic 12 ✓ |
| Agent 2 | IDLE | - | Complete |
| Agent 3 | IDLE | - | Complete |
| Agent 4 | IDLE | - | Complete |
| Agent 5 | **Epic 16**: HITL Verification UI | 26h | Epic 1 ✓, Epic 15 ✓ |

---

### Wave 12
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 1 | IDLE | - | Complete |
| Agent 2 | IDLE | - | Complete |
| Agent 3 | IDLE | - | Complete |
| Agent 4 | IDLE | - | Complete |
| Agent 5 | **Epic 17**: Advanced Expense Pools | 11h | Epic 6 ✓, Epic 12 ✓ |

---

### Wave 13
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 5 | **Epic 18**: Historical Analysis | 12h | Epic 7 ✓, Epic 12 ✓ |

---

### Wave 14
| Agent | Epic | Hours | Dependencies |
|-------|------|-------|--------------|
| Agent 5 | **Epic 20**: Mobile Optimization | 13h | Epic 1 ✓, Epic 12 ✓ |

---

## Quick Reference: Agent → Epic Assignment

| Epic | Agent | Wave | Hours | Key Blocker |
|------|-------|------|-------|-------------|
| 0 | Agent 1 | 1 | 15h | - |
| 1 | Agent 1 | 2 | 45h | Epic 0 |
| 2 | Agent 2 | 1 | 49h | - |
| 3 | Agent 2 | 3 | 58h | Epic 2 |
| 4 | Agent 3 | 4 | 35h | Epic 3 |
| 4.5 | Agent 3 | 5 | 9h | Epic 4 |
| 5 | Agent 4 | 5 | 52h | Epic 4 |
| 6 | Agent 5 | 7 | 50h | Epic 5 |
| **7** | **Agent 3** | **9** | **25h** | **Epic 6** |
| 8 | Agent 2 | 8 | 22h | Epic 6 |
| 9 | Agent 1 | 6 | 30h | Epic 4.5 |
| 10 | Agent 3 | 7 | 31h | Epic 9 |
| 11 | Agent 4 | 7 | 24h | Epic 5, 9 |
| 12 | Agent 5 | 10 | 36h | **Epic 7** |
| 13 | Agent 1 | 11 | 20h | Epic 12 |
| 14 | Agent 5 | 5 | 15h | Epic 4 |
| 15 | Agent 4 | 8 | 16h | Epic 14 |
| 16 | Agent 5 | 11 | 26h | Epic 15 |
| 17 | Agent 5 | 12 | 11h | Epic 12 |
| 18 | Agent 5 | 13 | 12h | Epic 12 |
| 19 | Agent 3 | 8 | 12h | Epic 4 |
| 20 | Agent 5 | 14 | 13h | Epic 12 |
| 21 | Agent 3 | 6 | 35h | Epic 4 |
| 22 | Agent 3 | 10 | 9h | Epic 21 |
| 23 | Agent 5 | 9 | 10h | Epic 4 |

---

## Critical File Ownership Matrix

### Shared Files Requiring Coordination

| File | Primary Owner | Touch Points | Coordination Strategy |
|------|---------------|--------------|----------------------|
| **backend/app/main.py** | Agent 3 | Story 4.1, 4.5, 7.1 | Agent 3 owns exclusively; others submit PRs if needed |
| **package.json** | Agent 1 | Story 0.4, 1.1, all UI epics | Agent 1 initializes; others add dependencies via PRs |
| **pyproject.toml** | Agent 1 | Story 0.2, all backend epics | Agent 1 initializes; others add dependencies via PRs |
| **tailwind.config.js** | Agent 1 | Story 1.1-1.3 | Agent 1 owns exclusively |
| **frontend/src/App.tsx** | Agent 1 | Story 1.5, routing for all features | Agent 1 owns; others submit routing additions |
| **CLAUDE.md** | All agents | Epic completion sections | Coordinate via story tracker notes |

### Directory Ownership (Exclusive)

| Directory | Owner | Epic(s) |
|-----------|-------|---------|
| **backend/app/models/** | Agent 2 | Epic 2 |
| **backend/app/core/** | Agent 3 | Epic 4 |
| **backend/app/api/routes/** | Agent 3 | Epic 4, 7, 21, 23 |
| **backend/app/services/ingestion/** | Agent 4 | Epic 5 |
| **backend/app/services/calculation/** | Agent 5 | Epic 6 |
| **backend/app/services/extraction/** | Agent 4 | Epic 14, 15 |
| **backend/app/services/billing/** | Agent 3 | Epic 21 |
| **backend/app/services/promotions/** | Agent 3 | Epic 22 |
| **backend/app/services/feedback/** | Agent 5 | Epic 23 |
| **frontend/src/components/ui/** | Agent 1 | Epic 1 |
| **frontend/src/features/auth/** | Agent 1 | Epic 9 |
| **frontend/src/features/properties/** | Agent 3 | Epic 10 |
| **frontend/src/features/ingestion/** | Agent 4 | Epic 11 |
| **frontend/src/features/reconciliation/** | Agent 5 | Epic 12, 13 |
| **frontend/src/features/billing/** | Agent 3 | Epic 21 |
| **frontend/src/features/promotions/** | Agent 3 | Epic 22 |
| **frontend/src/components/FeedbackWidget/** | Agent 5 | Epic 23 |
| **frontend/src/lib/api-client/** | Agent 3 | Epic 4.5 |
| **supabase/migrations/** | Agent 2 | Epic 3 |
| **tests/fixtures/** | Agent 2 | Epic 8 |

---

## Coordination Protocol

### Daily Standup (Async)
Each agent should update the story tracker with:
- Current story in progress
- Estimated completion time
- Any blockers or dependencies on other agents

**Location**: `docs/stories/STORY_TRACKER.md` - update Status and Notes columns

### Story Claiming Rules
1. **Check dependencies** - Only claim stories whose dependencies are marked "completed" in tracker
2. **Update tracker** - Immediately mark story as "in-progress" and add your agent ID to Assignee column
3. **Reference story file** - Read full story at `docs/stories/epic-XX/story-XX.YY.md`
4. **Follow TDD** - Write failing tests first (see CLAUDE.md PROHIBITED BEHAVIORS)
5. **Verify completion** - Run tests, check coverage, verify no placeholders
6. **Mark completed** - Update tracker to "completed" with completion notes

### Conflict Resolution
If two agents accidentally claim the same story or touch the same file:
1. **First to commit wins** - Use git commit timestamps
2. **Second agent rebases** - Pull latest changes and rebase work
3. **Coordinate in notes** - Add note to story tracker about coordination

### Dependency Verification
Before starting a story, verify ALL dependencies are complete:
```bash
# Example: Before starting Story 9.1 (requires Epic 1, 4, 4.5)
grep -E "^| (1\.|4\.|4\.5\.)" docs/stories/STORY_TRACKER.md | grep -v "completed"
# If this returns any results, dependencies are not met - WAIT
```

---

## Git Branching Strategy

### Branch Naming Convention
```
epic-{XX}-story-{XX}.{YY}-{agent-id}
```

**Examples**:
- `epic-05-story-05.07-agent-4` (Agent 4 working on Yardi parser)
- `epic-12-story-12.01-agent-5` (Agent 5 working on base grid)

### Merge Strategy
1. **Epic-level branches** - Each agent creates an epic branch when starting an epic:
   ```
   epic-00-agent-1
   epic-02-agent-2
   epic-05-agent-4
   ```

2. **Story-level branches** - Create story branches off epic branches:
   ```
   epic-05-agent-4  (base branch)
     └── epic-05-story-05.01-agent-4
     └── epic-05-story-05.02-agent-4
     └── epic-05-story-05.07-agent-4
   ```

3. **Merge order**:
   - Story branches → Epic branch (when story complete)
   - Epic branch → main (when epic complete)

4. **Strict blocking rule**: Do NOT merge epic branch to main until ALL dependencies are met

---

## Testing Requirements (Per CLAUDE.md)

### Test Coverage Gates
All stories must maintain 95%+ test coverage:
```bash
# Backend
cd backend
pytest --cov=app --cov-fail-under=95

# Frontend
cd frontend
npm run test:coverage -- --coverage.threshold.lines=95
```

### Required Test Types
Every story must include:
1. **Unit tests** - Test individual functions with real logic (no mocking the function being tested)
2. **Integration tests** - Test components working together (use real database in integration tests)
3. **Fixture files** - Real sample data, not generated mocks

### Test File Organization
```
backend/tests/
  ├── unit/
  │   ├── test_calculation.py      # Epic 6 (Agent 5)
  │   ├── test_ingestion.py        # Epic 5 (Agent 4)
  │   └── test_auth.py             # Epic 4 (Agent 3)
  ├── integration/
  │   ├── test_reconciliation.py   # Epic 7 (Agent 3)
  │   └── test_extraction.py       # Epic 15 (Agent 4)
  └── fixtures/                    # Epic 8 (Agent 2)
      ├── yardi_gl_sample.csv
      ├── mri_rentroll_sample.csv
      └── sample_lease.pdf
```

---

## Estimated Timeline

### Optimistic Scenario (Perfect Coordination)
| Phase | Duration | Description |
|-------|----------|-------------|
| **Wave 1** | 15 hours | Epic 0 solo |
| **Wave 2-3** | 74 hours | Epics 1, 2, 3 (2 agents parallel) |
| **Wave 4-5** | 52 hours | Epics 4, 4.5, 5, 14 (2-3 agents) |
| **Wave 6** | 50 hours | Epic 6 (BLOCKING - Agent 5) + others parallel |
| **Wave 7** | 25 hours | Epic 7 (BLOCKED until Wave 6 complete) |
| **Wave 8** | 62 hours | Final epics (Agent 5 only) |
| **TOTAL** | ~252 hours | Wall-clock time (critical path dependency) |

### Realistic Scenario (With Coordination Overhead)
| Phase | Duration | Description |
|-------|----------|-------------|
| **Wave 1** | 17 hours | Epic 0 + setup overhead |
| **Wave 2-3** | 85 hours | +15% for coordination |
| **Wave 4-5** | 62 hours | +20% for integration issues |
| **Wave 6** | 60 hours | +20% for Epic 6 complexity |
| **Wave 7** | 30 hours | +20% for Epic 7 integration |
| **Wave 8** | 75 hours | +20% for final features |
| **TOTAL** | ~329 hours | Wall-clock time (~14 work days) |

**⚠️ CRITICAL PATH BOTTLENECK**: Epic 6 (50 hours) must complete before Epic 7 can start. Agent 3 optimized to minimize idle time by completing Epics 10, 19, 22 while waiting.

---

## Success Metrics

### Completion Criteria
- [ ] All 210 stories marked "completed" in story tracker
- [ ] All tests passing (`pytest` + `npm test`)
- [ ] 95%+ test coverage maintained
- [ ] No `TODO`, `FIXME`, or `NotImplementedError` in production code
- [ ] All epic branches merged to main
- [ ] CLAUDE.md updated with all epic-specific additions
- [ ] Stripe integration functional for billing (Epic 21) and promotions (Epic 22)
- [ ] Feedback widget deployed and accessible (Epic 23)

### Quality Gates
- [ ] Zero placeholder implementations (`pass`, empty returns)
- [ ] Zero mocked functions in unit tests (test real logic)
- [ ] All SQL migrations numbered and sequential
- [ ] All Pydantic schemas have matching Zod schemas
- [ ] All RLS policies tested with negative tests

### Documentation Deliverables
- [ ] Updated README.md with project overview
- [ ] API documentation (auto-generated from FastAPI)
- [ ] Component Storybook for UI components
- [ ] Database schema diagram

---

## Risk Mitigation

### High-Risk Areas

1. **Epic 2 (Type System) - Agent 2**
   - **Risk**: Pydantic/Zod schema mismatch breaks contract tests
   - **Mitigation**: Story 2.14 creates automated sync test; run after every schema change

2. **Epic 3 (Database) - Agent 2**
   - **Risk**: Migration conflicts or RLS policy bugs allow data leakage
   - **Mitigation**: Story 3.13 creates negative tests; never skip RLS testing

3. **Epic 4 (Backend API) - Agent 3**
   - **Risk**: main.py becomes merge conflict hotspot
   - **Mitigation**: Agent 3 has exclusive ownership; others submit PRs

4. **Epic 6 (Calculation Engine) - Agent 5**
   - **Risk**: Financial calculation bugs lose customer money
   - **Mitigation**: Extensive test cases with known outputs; never use LLMs for math

5. **Epic 12 (Reconciliation Grid) - Agent 5**
   - **Risk**: Virtualized grid performance issues with 30k+ cells
   - **Mitigation**: Story 12.11 includes performance benchmarks; must render <100ms

### Contingency Plans

**If an agent gets blocked**:
1. Update story tracker with "blocked" status and reason
2. Move to next available story with met dependencies
3. Coordinate with blocking agent via tracker notes

**If merge conflicts occur**:
1. Agent who committed second rebases their branch
2. Re-run all tests after rebase
3. Update story tracker with resolution notes

**If test coverage drops below 95%**:
1. Local pre-commit hooks block commits automatically
2. Agent must add tests before proceeding
3. Never skip this requirement (per CLAUDE.md)

---

## Next Steps

### For User (Before Starting)
1. **Review this plan** - Ensure it aligns with expectations
2. **Set up local infrastructure**:
   - Set up Supabase project (local development instance)
   - Configure local environment variables (.env files for document reader, Anthropic API keys)
3. **Assign agents** - Identify which agents will take which roles (Agent 1-5)

### For Agents (Upon Starting)
1. **Agent 1 starts immediately** - Claim Epic 0 stories in order
2. **Agents 2-5 prepare**:
   - Read Epic overviews at `docs/stories/epic-XX/_overview.md`
   - Review CLAUDE.md for TDD requirements
   - Set up local development environment when Epic 0 completes
3. **All agents bookmark**:
   - Story Tracker: `docs/stories/STORY_TRACKER.md`
   - Epic Index: `docs/stories/_epic-index.md`

---

## Appendix: Epic Dependency Graph

```
LAYER 0 (Start)
  └─ Epic 0 (Agent 1) [15h]
      └─ Epic 2 (Agent 2) [49h] ──┐  (includes billing/feedback models)
          └─ Epic 1 (Agent 1) [45h] ──┤
              └─ Epic 3 (Agent 2) [58h] ──┐  (includes billing/feedback tables)
                  └─ Epic 4 (Agent 3) [35h] ──┐
                      ├─ Epic 4.5 (Agent 3) [9h] ──┐
                      ├─ Epic 5 (Agent 4) [52h] ──┼──┐
                      ├─ Epic 14 (Agent 4) [15h] ──┘  │
                      ├─ Epic 21 (Agent 3) [35h] ──┐  │  ← Billing (Stripe)
                      │   └─ Epic 22 (Agent 3) [9h]   │  ← Promotions (Stripe)
                      └─ Epic 23 (Agent 5) [10h] ──┘  │  ← Feedback Widget
                          └─ Epic 6 (Agent 5) [50h] ──┼──┐ ⚠️ CRITICAL PATH
                              ├─ Epic 8 (Agent 2) [22h] ──┤  │
                              ├─ Epic 9 (Agent 1) [30h] ──┼──┤  (includes SSO)
                              ├─ Epic 10 (Agent 3) [31h] ──┤  │
                              ├─ Epic 11 (Agent 4) [24h] ──┤  │
                              ├─ Epic 15 (Agent 4) [16h] ──┤  │
                              ├─ Epic 19 (Agent 3) [12h] ──┤  │
                              ├─ Epic 13 (Agent 1) [20h] ──┘  │
                              └─ Epic 7 (Agent 3) [25h] ──────┼──┐ ⚠️ BLOCKS on Epic 6
                                  ├─ Epic 12 (Agent 5) [36h] ──┤  │
                                  ├─ Epic 16 (Agent 5) [26h] ──┤  │
                                  ├─ Epic 17 (Agent 5) [11h] ──┤  │
                                  ├─ Epic 18 (Agent 5) [12h] ──┤  │
                                  └─ Epic 20 (Agent 5) [13h] ──┘  │

TOTAL: ~580 hours sequential → ~252 hours wall-clock (5 agents, with blocking)
CRITICAL PATH: Epic 0 → Epic 2 → Epic 1 → Epic 3 → Epic 4 → Epic 5 → Epic 6 → Epic 7 → Epic 12/18 (252 hours)
```

### New Epic Dependencies (Billing & Platform)

```
Epic 2.15-2.18 (Models) ─────────────────────────────────┐
    ↓                                                    │
Epic 3.15-3.19 (Tables) ─────────────────────────────────┤
    ↓                                                    │
    ├─→ Epic 21 (Billing) ← Epic 4 ──────────────────────┤
    │       ↓                                            │
    │   Epic 22 (Promotions) ← Stripe Coupons API        │
    │                                                    │
    ├─→ Epic 23 (Feedback) ← Epic 4, Epic 1 ─────────────┤
    │                                                    │
    └─→ Epic 9.8-9.12 (SSO) ← Epic 4 ────────────────────┘
```

---

**Plan Status**: ✅ Ready for Execution
**Last Updated**: 2025-12-29
**Plan Owner**: Claude (Opus 4.5)
