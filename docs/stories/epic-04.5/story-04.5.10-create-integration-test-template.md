# Story 4.5.10: Create Integration Test Template

### User Story
**As a** developer
**I want** a template for UI integration tests
**So that** I can quickly write tests for new components

### Acceptance Criteria

- [x] **AC1**: Template covers component with API calls
- [x] **AC2**: Template shows MSW handler usage
- [x] **AC3**: Template shows loading/error state testing
- [x] **AC4**: Template shows user interaction testing
- [x] **AC5**: Can be copied for new features

### Technical Specifications

**Files to Create**:
```
frontend/src/components/__tests__/
├── _template.test.tsx
└── PropertyList.test.tsx
```

**_template.test.tsx**:
```typescript
/**
 * Component Integration Test Template
 *
 * Copy this file when creating tests for new components that call APIs.
 *
 * This template demonstrates:
 * - MSW handler setup
 * - Loading state testing
 * - Success state testing
 * - Error state testing
 * - User interaction testing
 * - Contract validation
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { validators } from "@/test/contract";

// Import component to test
import { YourComponent } from "../YourComponent";

// Test wrapper with providers
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("YourComponent", () => {
  // Reset handlers after each test
  afterEach(() => {
    server.resetHandlers();
  });

  describe("Loading State", () => {
    it("shows loading indicator while fetching data", async () => {
      // Delay API response to test loading state
      server.use(
        http.get("/api/v1/resource", async () => {
          await new Promise((r) => setTimeout(r, 100));
          return HttpResponse.json({ data: [] });
        })
      );

      renderWithProviders(<YourComponent />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
      });
    });
  });

  describe("Success State", () => {
    it("renders data when API returns successfully", async () => {
      renderWithProviders(<YourComponent />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByTestId("data-container")).toBeInTheDocument();
      });

      // Verify expected content
      expect(screen.getByText("Expected Text")).toBeInTheDocument();
    });

    it("validates response matches contract", async () => {
      const capturedData: unknown[] = [];

      server.use(
        http.get("/api/v1/resource", () => {
          const data = { id: "123", name: "Test" };
          capturedData.push(data);
          return HttpResponse.json(data);
        })
      );

      renderWithProviders(<YourComponent />);

      await waitFor(() => {
        expect(capturedData.length).toBeGreaterThan(0);
      });

      // Validate captured response matches schema
      expect(() => validators.yourSchema.validate(capturedData[0])).not.toThrow();
    });
  });

  describe("Error State", () => {
    it("shows error message when API fails", async () => {
      server.use(
        http.get("/api/v1/resource", () => {
          return HttpResponse.json(
            { message: "Server error" },
            { status: 500 }
          );
        })
      );

      renderWithProviders(<YourComponent />);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });

    it("allows retry after error", async () => {
      let callCount = 0;

      server.use(
        http.get("/api/v1/resource", () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({ message: "Error" }, { status: 500 });
          }
          return HttpResponse.json({ data: [] });
        })
      );

      renderWithProviders(<YourComponent />);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      // Click retry
      await userEvent.click(screen.getByText("Retry"));

      // Should succeed on retry
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });
  });

  describe("User Interactions", () => {
    it("creates new item when form submitted", async () => {
      const user = userEvent.setup();
      let createdData: unknown = null;

      server.use(
        http.post("/api/v1/resource", async ({ request }) => {
          createdData = await request.json();
          return HttpResponse.json(
            { id: "new-123", ...createdData },
            { status: 201 }
          );
        })
      );

      renderWithProviders(<YourComponent />);

      // Fill form
      await user.type(screen.getByLabelText("Name"), "Test Name");
      await user.click(screen.getByText("Submit"));

      // Verify API was called with correct data
      await waitFor(() => {
        expect(createdData).toEqual({ name: "Test Name" });
      });

      // Verify success feedback
      expect(screen.getByText("Created successfully")).toBeInTheDocument();
    });

    it("shows validation errors for invalid input", async () => {
      const user = userEvent.setup();

      renderWithProviders(<YourComponent />);

      // Submit empty form
      await user.click(screen.getByText("Submit"));

      // Should show validation error
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("shows empty state when no data", async () => {
      server.use(
        http.get("/api/v1/resource", () => {
          return HttpResponse.json({ data: [], count: 0 });
        })
      );

      renderWithProviders(<YourComponent />);

      await waitFor(() => {
        expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      });

      expect(screen.getByText("No items yet")).toBeInTheDocument();
      expect(screen.getByText("Add your first item")).toBeInTheDocument();
    });
  });
});
```

### Definition of Done
- [x] Template created
- [x] All patterns demonstrated
- [x] PropertyList test works
- [x] Documentation complete

### Estimated Time: 2 hours

---

## Epic 4.5 Completion Checklist

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
