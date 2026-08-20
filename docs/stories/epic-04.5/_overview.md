# Epic 4.5: API Client & Contract Testing

## Epic Overview

**Goal**: Ensure frontend and backend are ALWAYS in sync by auto-generating TypeScript client from OpenAPI spec and establishing contract testing patterns.

**Why This Matters**: The most common source of bugs in full-stack applications is drift between frontend expectations and backend reality. By auto-generating the API client and enforcing contract tests, we eliminate an entire category of bugs before they reach production.

**Dependencies**: Epic 4 (API must exist to generate client from)

**Delivers**:
- Auto-generated TypeScript API client from OpenAPI spec
- Contract tests that fail if API changes break client
- E2E test infrastructure (Playwright)
- Integration test patterns for UI components
- MSW (Mock Service Worker) setup for testing

---

## Stories

- [Story 4.5.1: Configure OpenAPI Export](./story-04.5.1-configure-openapi-export.md)
- [Story 4.5.2: Set Up openapi-typescript-codegen](./story-04.5.2-set-up-openapi-typescript-codegen.md)
- [Story 4.5.3: Create API Client Generation Script](./story-04.5.3-create-api-client-generation-script.md)
- [Story 4.5.4: Add Client Generation to CI](./story-04.5.4-add-client-generation-to-ci.md)
- [Story 4.5.5: Create API Client Wrapper](./story-04.5.5-create-api-client-wrapper.md)
- [Story 4.5.6: Set Up MSW for Testing](./story-04.5.6-set-up-msw-for-testing.md)
- [Story 4.5.7: Create Contract Test Helpers](./story-04.5.7-create-contract-test-helpers.md)
- [Story 4.5.8: Set Up Playwright for E2E](./story-04.5.8-set-up-playwright-for-e2e.md)
- [Story 4.5.9: Create E2E Test Patterns](./story-04.5.9-create-e2e-test-patterns.md)
- [Story 4.5.10: Create Integration Test Template](./story-04.5.10-create-integration-test-template.md)

---

## Epic Completion Checklist

When all stories are complete, verify:

- [ ] OpenAPI spec valid and exported
- [ ] TypeScript client generates correctly
- [ ] Client regeneration in CI catches drift
- [ ] API wrapper handles auth and errors
- [ ] MSW configured for testing
- [ ] Contract validators work
- [ ] Playwright E2E tests pass
- [ ] Integration test template usable

## CLAUDE.md Additions After Epic 4.5

Add the following to `CLAUDE.md` upon epic completion:

```markdown
## Integration Rules (CRITICAL)

### API Client
- EVERY UI component that calls an API MUST use the generated API client
- NEVER use raw `fetch()` for API calls
- Run `npm run generate-api-client` after ANY backend API change
- CI will fail if generated client is out of sync

### Testing Requirements
- NEVER mock API responses with handwritten data - use MSW with factories
- Every component with API calls needs loading, success, and error state tests
- Use contract validators to ensure mock data matches real API shapes
- E2E tests must pass before any PR is merged

### E2E Testing
- Use page objects for reusable page interactions
- Always wait for API responses, don't use arbitrary timeouts
- Use data-testid attributes for stable selectors
- Screenshots captured automatically on failure
```
