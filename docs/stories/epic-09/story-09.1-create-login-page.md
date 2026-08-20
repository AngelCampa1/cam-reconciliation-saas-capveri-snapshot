# Story 9.1: Create Login Page

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: Story 1.5 (Application Shell), Story 4.3 (Auth endpoints), Story 4.5.2 (OpenAPI client generation)
- **Status**: `pending`

## User Story
As a user, I want to log in with my email and password so that I can access my organization's data.

## Acceptance Criteria
- Login form with email and password fields
- Password field has visibility toggle
- "Remember me" checkbox option
- "Forgot password?" link below form
- Loading spinner during authentication
- Success redirects to dashboard (or return URL)
- Error displays friendly message (not raw API error)
- Form validates email format before submission
- Keyboard navigation works (Tab, Enter to submit)
- Responsive layout works on mobile

## Technical Specifications
Implement LoginPage component at `frontend/src/pages/auth/LoginPage.tsx`:
- React Hook Form with Zod schema validation
- Email format validation
- Password visibility toggle with eye icon
- Remember me checkbox
- Error alert display
- Loading state on submit button
- Return URL parameter handling from query string
- useAuth hook for login function

useAuth hook handles:
- Login API call to auth service
- Error mapping to user-friendly messages
- Session persistence with localStorage
- Loading and error state management
- Return URL navigation after success

Form validation:
- Email format validation
- Password required
- Browser autofill support for accessibility

## Test Cases
- Login form renders with all fields
- Email field accepts valid email
- Password field shows/hides with toggle
- Remember me checkbox toggles
- Form validates email format
- Loading spinner shows during submission
- Successful login redirects to dashboard
- Successful login with return URL parameter redirects correctly
- Failed login shows friendly error message
- Keyboard navigation works (Tab, Enter)
- Mobile layout responsive
- Forgot password link navigates correctly
- Create account link present

## Definition of Done
- [ ] Login form renders with all fields
- [ ] Password visibility toggle works
- [ ] Form validation shows inline errors
- [ ] Loading state displays during submission
- [ ] Successful login redirects to dashboard
- [ ] Failed login shows user-friendly error
- [ ] Return URL preserved after login
- [ ] Keyboard navigation works correctly
- [ ] Mobile responsive
- [ ] Unit tests for form validation
- [ ] Integration test with auth API
