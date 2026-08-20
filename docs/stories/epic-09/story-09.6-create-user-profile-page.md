# Story 9.6: Create User Profile Page

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: Story 9.4 (Auth context)
- **Status**: `pending`

## User Story
As a user, I want to view and edit my profile information so that I can keep my account details current.

## Acceptance Criteria
- Display current user info (name, email, role)
- Edit form for name
- Change password section (separate form)
- Email change with verification required
- Success/error notifications
- Cancel returns to original values

## Technical Specifications
Implement ProfilePage at `frontend/src/pages/settings/ProfilePage.tsx`:
- Card-based layout for profile sections
- Profile information card (name, email, role)
- Change password card (separate form)
- Form validation with Zod
- Success/error toast notifications
- Loading states on buttons

Profile section:
- Display current user info
- Edit name field
- Save changes button
- Email disabled (contact support note)
- Role display (read-only)

Password section:
- Current password field
- New password field with requirements
- Confirm new password field
- Save button with loading state
- Password match validation

## Test Cases
- Profile info displays correctly
- Name can be edited and saved
- Password change form works
- Success/error toasts shown
- Form validation works
- Email field disabled
- Role displays correctly
- Mobile responsive layout

## Definition of Done
- [ ] Profile info displays correctly
- [ ] Name can be edited and saved
- [ ] Password change form works
- [ ] Success/error toasts shown
- [ ] Form validation works
- [ ] Mobile responsive
- [ ] Unit tests for forms
