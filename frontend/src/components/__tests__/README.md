# Integration Test Templates

This directory contains templates and examples for writing integration tests for React components that interact with APIs.

## Quick Start

### 1. Copy the Template

Copy `_template.test.tsx` to start a new integration test:

```bash
cp src/components/__tests__/_template.test.tsx src/components/__tests__/YourComponent.test.tsx
```

### 2. Customize for Your Component

Update the following in your new test file:

- Replace `YourComponent` with your actual component name
- Update API endpoints to match your component's API calls
- Customize test assertions for your component's specific behavior
- Add/remove tests based on your component's features

### 3. Run Your Tests

```bash
npm test YourComponent.test.tsx
```

## What the Template Provides

The template demonstrates testing patterns for:

### 1. Loading States
```typescript
it('shows loading indicator while fetching data', async () => {
  // Delay API response
  server.use(
    http.get('/api/v1/resource', async () => {
      await new Promise((r) => setTimeout(r, 100))
      return HttpResponse.json({ data: [] })
    })
  )

  renderWithProviders(<YourComponent />)
  expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
})
```

### 2. Success States
```typescript
it('renders data when API returns successfully', async () => {
  renderWithProviders(<YourComponent />)

  await waitFor(() => {
    expect(screen.getByTestId('data-container')).toBeInTheDocument()
  })

  expect(screen.getByText('Expected Text')).toBeInTheDocument()
})
```

### 3. Error States
```typescript
it('shows error message when API fails', async () => {
  server.use(
    http.get('/api/v1/resource', () => {
      return HttpResponse.json(
        { message: 'Server error' },
        { status: 500 }
      )
    })
  )

  renderWithProviders(<YourComponent />)

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
```

### 4. User Interactions
```typescript
it('creates new item when form submitted', async () => {
  const user = userEvent.setup()

  renderWithProviders(<YourComponent />)

  await user.type(screen.getByLabelText('Name'), 'Test Name')
  await user.click(screen.getByText('Submit'))

  await waitFor(() => {
    expect(screen.getByText('Created successfully')).toBeInTheDocument()
  })
})
```

### 5. Contract Validation
```typescript
it('validates response matches contract', async () => {
  const capturedData: unknown[] = []

  server.use(
    http.get('/api/v1/resource', () => {
      const data = { id: '123', name: 'Test' }
      capturedData.push(data)
      return HttpResponse.json(data)
    })
  )

  renderWithProviders(<YourComponent />)

  await waitFor(() => {
    expect(capturedData.length).toBeGreaterThan(0)
  })

  // Validate captured response matches schema
  expect(() => validators.yourSchema.validate(capturedData[0])).not.toThrow()
})
```

### 6. Empty States
```typescript
it('shows empty state when no data', async () => {
  server.use(
    http.get('/api/v1/resource', () => {
      return HttpResponse.json({ data: [], count: 0 })
    })
  )

  renderWithProviders(<YourComponent />)

  await waitFor(() => {
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })
})
```

## Real-World Example

See `src/pages/properties/PropertyListPage.test.tsx` for a complete example of testing a component that:

- Fetches a list of properties from the API
- Shows loading, success, error, and empty states
- Handles pagination
- Implements search filtering
- Validates API responses against contracts

## Best Practices

### 1. Always Reset MSW Handlers

```typescript
afterEach(() => {
  server.resetHandlers()
})
```

This prevents test pollution where one test's mock affects another test.

### 2. Use `renderWithProviders`

```typescript
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}
```

This ensures React Query is configured correctly for testing (no retries, fresh client per test).

### 3. Wait for Async Operations

```typescript
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument()
})
```

Never use arbitrary timeouts like `await new Promise(r => setTimeout(r, 1000))` in assertions.

### 4. Validate Contracts

Always validate that your mock data matches the real API schema:

```typescript
expect(() => validators.property.validate(mockData)).not.toThrow()
```

This catches schema drift between frontend and backend.

### 5. Test User Interactions

Use `userEvent.setup()` for realistic user interactions:

```typescript
const user = userEvent.setup()
await user.type(input, 'text')
await user.click(button)
```

This simulates real user behavior better than `fireEvent`.

### 6. Use Accessible Selectors

Prefer queries that reflect how users interact:

```typescript
// Good - how users find elements
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email')
screen.getByText('Welcome')

// Avoid - implementation details
screen.getByClassName('btn-primary')
screen.getByTestId('submit-button')  // Use as last resort
```

## MSW Handler Patterns

### Delay Response (Test Loading)

```typescript
server.use(
  http.get('/api/v1/resource', async () => {
    await new Promise((r) => setTimeout(r, 100))
    return HttpResponse.json({ data: [] })
  })
)
```

### Capture Request Data

```typescript
let createdData: unknown = null

server.use(
  http.post('/api/v1/resource', async ({ request }) => {
    createdData = await request.json()
    return HttpResponse.json({ id: '123', ...createdData }, { status: 201 })
  })
)
```

### Conditional Responses

```typescript
let callCount = 0

server.use(
  http.get('/api/v1/resource', () => {
    callCount++
    if (callCount === 1) {
      return HttpResponse.json({ message: 'Error' }, { status: 500 })
    }
    return HttpResponse.json({ data: [] })
  })
)
```

### Query Parameters

```typescript
server.use(
  http.get('/api/v1/resource', ({ request }) => {
    const url = new URL(request.url)
    const page = url.searchParams.get('page')
    const search = url.searchParams.get('search')

    // Return filtered/paginated data
    return HttpResponse.json({ data: [], page })
  })
)
```

## Common Gotchas

### 1. Forgot to Reset Handlers

**Problem**: Tests pass individually but fail when run together.

**Solution**: Add `afterEach(() => server.resetHandlers())` to every test suite.

### 2. Not Waiting for Async Operations

**Problem**: Test fails with "Unable to find element".

**Solution**: Use `await waitFor()` for all assertions on async-loaded content.

### 3. Using Wrong Query Client

**Problem**: React Query throws "No QueryClient set" error.

**Solution**: Always wrap components in `QueryClientProvider` with a fresh client.

### 4. Mocking Implementation Details

**Problem**: Tests break when implementation changes.

**Solution**: Test behavior (what users see), not implementation (how it's done).

### 5. Not Validating Contracts

**Problem**: Mock data doesn't match real API, tests pass but app breaks.

**Solution**: Always validate mock data with contract validators.

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test PropertyListPage.test.tsx

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm run test:coverage
```

## References

- [Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [MSW Documentation](https://mswjs.io/docs/)
- [React Query Testing](https://tanstack.com/query/latest/docs/react/guides/testing)
- [User Event](https://testing-library.com/docs/user-event/intro)
