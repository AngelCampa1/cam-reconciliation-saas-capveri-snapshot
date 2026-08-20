# Story 9.3: Create Forgot Password Page

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Epic 1 (Design system), Epic 4 (Backend auth API)
- **Status**: `pending`

## User Story
As a user who forgot my password, I want to request a password reset link so that I can regain access to my account.

## Acceptance Criteria
- Simple form with email input only
- Loading state during submission
- Success shows confirmation message
- Handles both valid and invalid emails gracefully
- Clear instructions on what to expect
- Link back to login page

## Technical Specifications
Implement ForgotPasswordPage component at `frontend/src/pages/auth/ForgotPasswordPage.tsx`:
- React Hook Form with Zod schema validation
- Email field with format validation
- Loading state on submit button
- Success screen with email icon
- Mail icon for visual feedback
- Instructions on checking email/spam folder
- Link to retry if email not received
- Back to login link

Security considerations:
- Always show success message (prevent email enumeration)
- Don't reveal whether account exists
- Consistent experience for valid/invalid emails

## Test Cases
- Forgot password form renders
- Email field accepts valid email
- Loading state shows during submission
- Success message displays after submission
- Success message shows submitted email
- Back to login link navigates correctly
- Retry link allows form reset
- Mobile responsive layout
- Keyboard navigation works

## Definition of Done
- [ ] Form renders with email input
- [ ] Loading state during submission
- [ ] Success message shown after submission
- [ ] Same response for valid/invalid emails (security)
- [ ] Back to login link works
- [ ] Mobile responsive
- [ ] Unit tests for component
