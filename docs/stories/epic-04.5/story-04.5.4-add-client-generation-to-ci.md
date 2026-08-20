# Story 4.5.4: Add Client Generation to CI

### User Story
**As a** developer
**I want** CI to detect when the generated client is out of date
**So that** I never merge code with API drift

### Acceptance Criteria

- [ ] **AC1**: CI workflow generates client from API spec
- [ ] **AC2**: CI fails if generated files differ from committed
- [ ] **AC3**: Clear error message explains the drift
- [ ] **AC4**: Instructions provided for fixing drift
- [ ] **AC5**: Check runs on every PR

### Technical Specifications

**Files to Create/Modify**:
```
.github/workflows/
└── ci.yml (add client check job)
```

**ci.yml addition**:
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  api-client-check:
    name: Check API Client Sync
    runs-on: ubuntu-latest

    services:
      # Start test database for API
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install Python dependencies
        working-directory: backend
        run: |
          pip install -e ".[dev]"

      - name: Install Node dependencies
        working-directory: frontend
        run: npm ci

      - name: Start API server
        working-directory: backend
        run: |
          uvicorn app.main:app --host 0.0.0.0 --port 8000 &
          sleep 5  # Wait for server to start
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Generate API client
        working-directory: frontend
        run: npm run generate-api-client

      - name: Check for changes
        working-directory: frontend
        run: |
          if git diff --exit-code src/api/generated/; then
            echo "API client is up to date!"
          else
            echo "::error::API client is out of sync with backend!"
            echo ""
            echo "The generated API client differs from what's committed."
            echo "This usually means the backend API changed but the client wasn't regenerated."
            echo ""
            echo "To fix this:"
            echo "  1. Start the backend server: cd backend && uvicorn app.main:app"
            echo "  2. Regenerate the client: cd frontend && npm run generate-api-client"
            echo "  3. Commit the changes: git add src/api/generated && git commit -m 'Regenerate API client'"
            echo ""
            git diff src/api/generated/
            exit 1
          fi
```

### Definition of Done
- [ ] CI check added
- [ ] Fails on drift
- [ ] Clear error message
- [ ] Runs on every PR

### Estimated Time: 2 hours

---
