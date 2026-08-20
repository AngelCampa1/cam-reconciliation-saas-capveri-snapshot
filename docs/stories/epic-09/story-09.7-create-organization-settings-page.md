# Story 9.7: Create Organization Settings Page

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Story 9.4 (Auth context)
- **Status**: `pending`

## User Story
As an organization admin, I want to manage organization settings so that I can configure my team's workspace.

## Acceptance Criteria
- Display organization name and ID
- Edit organization name (admin only)
- View subscription status and limits
- View usage statistics (users, properties)
- Only accessible to admin users

## Technical Specifications
Implement OrganizationPage at `frontend/src/pages/settings/OrganizationPage.tsx`:
- Card-based layout
- Organization details section
- Subscription status section
- Usage statistics with progress bars
- Admin-only edit capability
- Loading and error states

Organization section:
- Organization name display
- Organization name edit (admin only)
- Disabled for non-admins

Subscription section:
- Status badge (trial, active, past_due, cancelled)
- Trial end date if applicable
- Usage bars for users and properties
- Current usage / limit display

## Test Cases
- Organization info displays correctly
- Admins can edit organization name
- Non-admins see read-only view
- Subscription status shows with badge
- Usage stats display with progress bars
- Progress bars show correct percentages
- Mobile responsive layout
- Admin-only features work correctly

## Definition of Done
- [ ] Organization info displays correctly
- [ ] Admins can edit organization name
- [ ] Non-admins see read-only view
- [ ] Subscription status shows with badge
- [ ] Usage stats display with progress bars
- [ ] Mobile responsive
- [ ] Unit tests for admin-only features
