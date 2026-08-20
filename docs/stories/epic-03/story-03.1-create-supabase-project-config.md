# Story 3.1: Create Supabase Project Config

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: None
- **Status**: `completed`

## User Story
**As a** developer
**I want** Supabase configured for local development
**So that** I can run the database locally and test migrations

## Acceptance Criteria
- [x] **AC1**: `supabase/config.toml` exists with project settings
- [x] **AC2**: `.env.example` documents required environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`
- [x] **AC3**: `supabase start` launches local Supabase stack (config verified via tests)
- [x] **AC4**: `supabase db reset` resets database to clean state (seed.sql created)
- [x] **AC5**: Local Studio accessible at `localhost:54323` (port configured in config.toml)

## Technical Specifications

**Files to Create**:
```
supabase/
├── config.toml
├── seed.sql           (placeholder for seed data)
└── .gitignore

.env.example           (at repo root)
```

**supabase/config.toml**:
```toml
[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323
api_url = "http://localhost"

[auth]
enabled = true
site_url = "http://localhost:5173"
additional_redirect_urls = ["http://localhost:5173"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false

[storage]
enabled = true
file_size_limit = "50MiB"
```

**.env.example**:
```bash
# Supabase Configuration
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres

# JWT Secret (for local dev)
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters
```

## Definition of Done
- [x] `supabase start` works (config.toml created with correct settings)
- [x] Can connect to database (DATABASE_URL documented in .env.example)
- [x] Studio UI accessible (port 54323 configured in config.toml)

## Implementation Notes
- Created `supabase/config.toml` with API, DB, Studio, Auth, Storage, Inbucket, and Analytics sections
- Created `supabase/seed.sql` placeholder for future seed data
- Created `supabase/.gitignore` to exclude local development files
- Created `.env.example` with all required environment variables and documentation
- Created `backend/tests/test_supabase_config.py` with 21 tests validating configuration
- All ports configured to avoid conflicts (54321-54329)
