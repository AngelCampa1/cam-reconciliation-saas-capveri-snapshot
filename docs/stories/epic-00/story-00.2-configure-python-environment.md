# Story 0.2: Configure Python Environment

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.1
- **Status**: `pending`

## User Story
**As a** backend developer
**I want** a properly configured Python environment with all necessary dependencies
**So that** I can immediately start developing FastAPI endpoints with proper tooling

## Acceptance Criteria
- [ ] **AC1**: `pyproject.toml` exists in `backend/` with project metadata
- [ ] **AC2**: Dependencies include:
  - `fastapi>=0.127.0`
  - `uvicorn[standard]>=0.40.0`
  - `pydantic>=2.12.0`
  - `pandas>=2.3.0,<3.0`
  - `python-dotenv>=1.0.0`
  - `supabase>=2.27.0`
  - `httpx>=0.28.0` (for async HTTP)
- [ ] **AC3**: Dev dependencies include:
  - `pytest>=9.0.0`
  - `pytest-cov>=7.0.0`
  - `pytest-asyncio>=1.3.0`
  - `black>=25.12.0`
  - `isort>=7.0.0`
  - `ruff>=0.14.0`
  - `mypy>=1.19.0`
- [ ] **AC4**: `pip install -e ".[dev]"` succeeds without errors
- [ ] **AC5**: `python -c "import fastapi; print(fastapi.__version__)"` works
- [ ] **AC6**: Python version specified as `>=3.11,<3.14`

## Technical Specifications
**Files to Create**:
```
backend/
├── pyproject.toml
└── app/
    └── __init__.py  (with __version__ = "0.1.0")
```

**pyproject.toml Structure**:
```toml
[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "capveri-backend"
version = "0.1.0"
description = "CapVeri Backend API"
requires-python = ">=3.11,<3.14"
dependencies = [
    "fastapi>=0.127.0",
    "uvicorn[standard]>=0.40.0",
    "pydantic>=2.12.0",
    "pandas>=2.3.0,<3.0",
    "python-dotenv>=1.0.0",
    "supabase>=2.27.0",
    "httpx>=0.28.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=9.0.0",
    "pytest-cov>=7.0.0",
    "pytest-asyncio>=1.3.0",
    "black>=25.12.0",
    "isort>=7.0.0",
    "ruff>=0.14.0",
    "mypy>=1.19.0",
]

[tool.black]
line-length = 88
target-version = ['py311']

[tool.isort]
profile = "black"
line_length = 88

[tool.ruff]
line-length = 88
target-version = "py311"
select = ["E", "F", "I", "N", "W", "UP", "B", "C4", "SIM"]

[tool.mypy]
python_version = "3.11"
strict = true
```

## Definition of Done
- [ ] Fresh virtualenv can install all dependencies
- [ ] All imports resolve correctly
- [ ] Type checker (mypy) can be run without configuration errors
