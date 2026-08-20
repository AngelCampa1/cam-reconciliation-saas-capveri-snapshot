# Story 9.5: Create Protected Route Wrapper

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Story 9.4 (Auth context)
- **Status**: `pending`

## User Story
As a developer, I need a route wrapper that redirects unauthenticated users to login so that protected pages are secure.

## Acceptance Criteria
- Redirects to login if not authenticated
- Preserves return URL in query param
- Shows loading state during auth check
- Works with React Router
- Can require specific roles (optional)

## Technical Specifications
Implement ProtectedRoute component at `frontend/src/components/auth/ProtectedRoute.tsx`:
- React Router integration
- Authentication status check
- Loading state display
- Return URL preservation
- Role-based access control (optional)
- Redirect to login with return URL

Route configuration in router.tsx:
- Public routes (login, register, forgot-password)
- Protected routes with ProtectedRoute wrapper
- Admin routes with role requirement
- Nested route support

## Test Cases
- Unauthenticated users redirected to login
- Return URL preserved in query string
- Loading spinner shown during auth check
- Authenticated users see protected content
- Role-based access works when specified
- Non-admin users redirected to unauthorized
- Nested routes work correctly

## Definition of Done
- [ ] Unauthenticated users redirected to login
- [ ] Return URL preserved in query string
- [ ] Loading spinner shown during auth check
- [ ] Role-based access works when specified
- [ ] Unit tests for redirect logic
- [ ] Works correctly with nested routes
