# Epic 4: Backend API Skeleton & Authentication

## Epic Overview

**Goal**: Create FastAPI application structure with Supabase Auth integration and organization-scoped sessions.

**Why This Matters**: The API is the contract between frontend and backend. A well-structured foundation with proper authentication and organization scoping ensures every subsequent feature builds on secure, consistent patterns.

**Dependencies**: Epic 3 (database tables must exist for queries)

**Delivers**:
- FastAPI app factory pattern
- Supabase client configuration
- Auth middleware and dependencies
- Organization-scoped session management
- OpenAPI documentation
- Consistent error handling patterns

---

## Stories

- [Story 4.1: Create FastAPI App Entry Point](./story-04.01-create-fastapi-app-entry-point.md)
- [Story 4.2: Configure Supabase Client](./story-04.02-configure-supabase-client.md)
- [Story 4.3: Create Get Current User Dependency](./story-04.03-create-get-current-user-dependency.md)
- [Story 4.4: Create Organization-Scoped Session Dependency](./story-04.04-create-organization-scoped-session-dependency.md)
- [Story 4.5: Create API Router Structure](./story-04.05-create-api-router-structure.md)
- [Story 4.6: Create Error Response Schemas](./story-04.06-create-error-response-schemas.md)
- [Story 4.7: Create Exception Handlers](./story-04.07-create-exception-handlers.md)
- [Story 4.8: Create Properties CRUD Endpoints](./story-04.08-create-properties-crud-endpoints.md)
- [Story 4.9: Create Units CRUD Endpoints](./story-04.09-create-units-crud-endpoints.md)
- [Story 4.10: Create Leases CRUD Endpoints](./story-04.10-create-leases-crud-endpoints.md)
- [Story 4.11: Create Auth Integration Tests](./story-04.11-create-auth-integration-tests.md)

---

## Epic Completion Checklist

When all stories are complete, verify:

- [ ] FastAPI app starts and serves /docs
- [ ] Health check returns version info
- [ ] Supabase client connects successfully
- [ ] JWT authentication validates tokens
- [ ] Organization context scopes all queries
- [ ] All CRUD endpoints work for properties, units, leases
- [ ] Error responses are consistent JSON
- [ ] Auth integration tests pass
- [ ] CI pipeline runs all tests

## CLAUDE.md Additions After Epic 4

Add the following to `CLAUDE.md` upon epic completion:

```markdown
## API Development Rules

### Authentication
- All endpoints except /health require authentication
- Use `CurrentUser` dependency for authenticated endpoints
- Use `CurrentAdminUser` dependency for admin-only endpoints
- Use `OrgContext` for database operations (ensures RLS + org scoping)

### Error Handling
- All exceptions return JSON via global handlers
- Use `NotFoundError(resource, id)` for 404s
- Use `ConflictError(message)` for 409s
- Never expose stack traces in production

### Endpoint Patterns
- List endpoints return `{data: [], count: int, has_more: bool}`
- Create endpoints return 201 with created resource
- Delete endpoints return 204 with no content
- Update endpoints return updated resource
- Always validate foreign key references before insert

### Testing
- Every endpoint needs auth tests (401, 403)
- Every endpoint needs org isolation tests
- Use fixtures from `conftest.py` for test data
- Run `pytest --cov-fail-under=95` before committing
```
