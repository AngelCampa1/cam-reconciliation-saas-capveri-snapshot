# Story 0.1: Initialize Monorepo Structure

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: None
- **Status**: `pending`

## User Story
**As a** developer
**I want** a well-organized monorepo with separate directories for backend, frontend, and database
**So that** code is logically separated and each part can be developed, tested, and deployed independently

## Acceptance Criteria
- [ ] **AC1**: `backend/` directory exists with `app/` subdirectory for source code
- [ ] **AC2**: `backend/tests/` directory exists for Python tests
- [ ] **AC3**: `frontend/` directory exists with `src/` subdirectory for React code
- [ ] **AC4**: `supabase/` directory exists with `migrations/` subdirectory
- [ ] **AC5**: Root `.gitignore` excludes common artifacts:
  - `node_modules/`, `__pycache__/`, `.env`, `*.pyc`, `.venv/`, `dist/`, `build/`
- [ ] **AC6**: `README.md` exists at root with basic project description and setup instructions

## Technical Specifications
**Files to Create**:
```
capveri/
├── backend/
│   ├── app/
│   │   └── __init__.py
│   └── tests/
│       └── __init__.py
├── frontend/
│   └── src/
│       └── .gitkeep
├── supabase/
│   └── migrations/
│       └── .gitkeep
├── .gitignore
└── README.md
```

**Implementation Notes**:
- Use `.gitkeep` files to preserve empty directories in git
- `.gitignore` should be comprehensive from the start to avoid committing artifacts

## Definition of Done
- [ ] All directories created
- [ ] `.gitignore` properly excludes artifacts
- [ ] `git status` shows clean working tree after initial commit
- [ ] Another developer can clone and understand structure from README
