# Story 9.2: Create Registration Page

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: Epic 1 (Design system), Epic 4 (Backend auth API)
- **Status**: `pending`

## User Story
As a new user, I want to create an account for my organization so that I can start using CapVeri.

## Acceptance Criteria
- Registration form: email, password, confirm password, organization name
- Password strength indicator
- Password requirements displayed
- Terms of service checkbox (required)
- Loading state during registration
- Success shows confirmation message (check email)
- Errors display user-friendly messages
- Validates passwords match before submission
- Organization name required (min 2 chars)

## Technical Specifications
Implement RegisterPage component at `frontend/src/pages/auth/RegisterPage.tsx`:
- React Hook Form with Zod schema validation
- Organization name field (2-100 chars)
- Email field with format validation
- Password field with strength requirements
- Confirm password with match validation
- Terms of service checkbox with required validation
- PasswordStrength component for real-time feedback
- Success screen with email confirmation message

Password requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

PasswordStrength component:
- Calculates strength score (1-6)
- Visual strength indicator with colored bars
- Weak/Medium/Strong labels
- Updates in real-time as user types

## Test Cases
- Registration form renders with all fields
- Organization name field accepts valid input
- Organization name minimum length enforced
- Email field accepts valid email
- Password field shows strength indicator
- Strength indicator updates in real-time
- Confirm password validates match
- Terms checkbox required for submission
- Success screen shows after submission
- Email confirmation message displays
- Error messages display user-friendly text
- Mobile responsive layout
- All validations work correctly

## Definition of Done
- [ ] Registration form renders with all fields
- [ ] Password strength indicator updates in real-time
- [ ] Password match validation works
- [ ] Terms checkbox required for submission
- [ ] Success screen shows email confirmation message
- [ ] Errors display user-friendly messages
- [ ] Form validation prevents invalid submissions
- [ ] Mobile responsive
- [ ] Unit tests for validation logic
- [ ] Integration test with registration API
