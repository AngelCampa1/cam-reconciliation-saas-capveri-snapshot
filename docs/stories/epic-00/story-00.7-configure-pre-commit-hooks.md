# Story 0.7: Configure Pre-commit Hooks

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.2, Story 0.4
- **Status**: `pending`

## User Story
**As a** developer
**I want** pre-commit hooks that automatically format and lint code
**So that** code style issues are caught before commit, not in CI

## Acceptance Criteria
- [ ] **AC1**: `.pre-commit-config.yaml` exists at repo root
- [ ] **AC2**: Python hooks configured:
  - black (formatting)
  - isort (import sorting)
  - ruff (linting)
- [ ] **AC3**: Frontend hooks configured:
  - eslint
  - prettier
- [ ] **AC4**: `pre-commit install` sets up git hooks
- [ ] **AC5**: Committing unformatted code triggers auto-fix
- [ ] **AC6**: Hooks run only on staged files (fast)
- [ ] **AC7**: ESLint and Prettier packages installed in frontend/

## Technical Specifications
**Files to Create**:
```
capveri/
├── .pre-commit-config.yaml
└── frontend/
    ├── .eslintrc.cjs
    └── .prettierrc
```

**.pre-commit-config.yaml**:
```yaml
repos:
  # Python formatting and linting
  - repo: https://github.com/psf/black
    rev: 25.12.0
    hooks:
      - id: black
        files: ^backend/

  - repo: https://github.com/pycqa/isort
    rev: 7.0.0
    hooks:
      - id: isort
        files: ^backend/
        args: ["--profile", "black"]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.10
    hooks:
      - id: ruff
        files: ^backend/
        args: ["--fix"]

  # Frontend formatting and linting
  - repo: local
    hooks:
      - id: eslint
        name: eslint
        entry: bash -c 'cd frontend && npm run lint:fix'
        language: system
        files: ^frontend/.*\.(ts|tsx)$
        pass_filenames: false

      - id: prettier
        name: prettier
        entry: bash -c 'cd frontend && npx prettier --write'
        language: system
        files: ^frontend/.*\.(ts|tsx|css|json)$

  # General hooks
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-toml
      - id: check-added-large-files
        args: ['--maxkb=1000']
```

**frontend/.eslintrc.cjs**:
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
```

**frontend/.prettierrc**:
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

**ESLint and Prettier Dependencies** (`frontend/package.json devDependencies`):
```json
{
  "devDependencies": {
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "prettier": "^3.4.0"
  }
}
```

## Definition of Done
- [ ] `pre-commit install` succeeds
- [ ] Committing badly formatted Python auto-fixes
- [ ] Committing badly formatted TypeScript auto-fixes
- [ ] All hooks pass on clean codebase
