# Story 9.4: Create Auth Context Provider

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: Epic 4 (Backend auth API), Epic 4.5 (Generated API client)
- **Status**: `pending`

## User Story
As a developer, I need a centralized auth context so that all components can access the current user state and auth functions.

## Acceptance Criteria
- AuthProvider wraps the app
- Provides: currentUser, isAuthenticated, isLoading
- Provides: login, logout, refreshSession functions
- Persists session across page refresh
- Auto-refreshes token before expiry
- Handles session expiry gracefully

## Technical Specifications
Implement AuthContext at `frontend/src/contexts/AuthContext.tsx`:
- React Context with custom hook
- Session persistence with localStorage
- Token refresh timer (5 min before expiry)
- Session validation on app load
- User state management
- Session state management

AuthProvider initialization:
- Load stored session from localStorage
- Validate session not expired
- Verify session with backend
- Clear invalid sessions
- Initialize loading states

Token refresh:
- Calculate refresh time (5 min before expiry)
- Set timer for automatic refresh
- Handle refresh errors gracefully
- Log out on refresh failure

## Test Cases
- AuthProvider wraps application
- User state accessible via hook
- Session persists across page refresh
- Token refresh timer works
- Logout clears all state
- Loading state accurate during init
- Invalid session cleared
- Token refresh handles errors

## Definition of Done
- [ ] AuthProvider wraps application
- [ ] User state accessible via hook/context
- [ ] Session persists across page refresh
- [ ] Token refresh timer works
- [ ] Logout clears all state
- [ ] Loading state accurate during init
- [ ] Unit tests for auth logic
- [ ] Integration test for session persistence
