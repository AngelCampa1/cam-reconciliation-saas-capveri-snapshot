# Story 9.9: Create OAuth Callback Handling

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 3
- **Dependencies**: Story 9.8 (OAuth Providers), Story 4.3 (Auth Dependencies)
- **Status**: `pending`

## User Story
**As a** user
**I want** OAuth login to complete smoothly
**So that** I'm logged in after authenticating with Google/Apple

## Acceptance Criteria
- [ ] **AC1**: `/auth/callback` route processes OAuth tokens from Supabase
- [ ] **AC2**: New users are created in database with OAuth provider info
- [ ] **AC3**: Existing users have OAuth identity linked to their account
- [ ] **AC4**: User is redirected to dashboard after successful auth
- [ ] **AC5**: Error states are handled gracefully with user-friendly messages
- [ ] **AC6**: Organization invitation flow works with OAuth signup

## Technical Specifications

### Frontend Callback Route

**File to Create**: `frontend/src/pages/auth/Callback.tsx`

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'

export function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase handles the OAuth exchange automatically
        // We just need to check if the session was established
        const { data: { session }, error: authError } = await supabase.auth.getSession()

        if (authError) {
          throw authError
        }

        if (!session) {
          throw new Error('No session established')
        }

        // Check for invitation token
        const inviteToken = searchParams.get('invite')
        if (inviteToken) {
          // Process organization invitation
          await processInvitation(session.user.id, inviteToken)
        }

        // Check for error in URL (OAuth error)
        const errorDescription = searchParams.get('error_description')
        if (errorDescription) {
          throw new Error(errorDescription)
        }

        // Get return URL from session storage or default to dashboard
        const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard'
        sessionStorage.removeItem('returnUrl')

        navigate(returnUrl, { replace: true })
      } catch (err) {
        console.error('Auth callback error:', err)
        setError(err instanceof Error ? err.message : 'Authentication failed')
      }
    }

    handleCallback()
  }, [navigate, searchParams])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive">
            Authentication Error
          </h2>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 text-primary hover:underline"
          >
            Return to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Spinner className="h-8 w-8 mx-auto" />
        <p className="mt-4 text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}

async function processInvitation(userId: string, token: string): Promise<void> {
  const response = await fetch('/api/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  if (!response.ok) {
    console.warn('Failed to process invitation:', await response.text())
    // Don't throw - user can still access the app, just without org link
  }
}
```

### Backend: Create/Link OAuth User

**File to Update**: `backend/app/auth/oauth.py`

```python
"""
OAuth user creation and linking logic.
"""
from uuid import UUID
from typing import Optional

from supabase import Client

from app.models.user import User, UserCreate


async def get_or_create_oauth_user(
    supabase: Client,
    auth_user_id: UUID,
    provider: str,
    provider_user_id: str,
    email: str,
    full_name: Optional[str] = None,
) -> User:
    """
    Get existing user or create new one for OAuth login.

    If user exists with this email, link the OAuth identity.
    If user is new, create user record.
    """
    # Check if user already exists by auth ID
    existing = await supabase.table('users') \
        .select('*') \
        .eq('id', str(auth_user_id)) \
        .single() \
        .execute()

    if existing.data:
        return User(**existing.data)

    # Check if user exists by email (for account linking)
    by_email = await supabase.table('users') \
        .select('*') \
        .eq('email', email) \
        .single() \
        .execute()

    if by_email.data:
        # Update existing user with new auth ID
        # This links the OAuth identity to existing account
        updated = await supabase.table('users') \
            .update({'id': str(auth_user_id)}) \
            .eq('email', email) \
            .execute()
        return User(**updated.data[0])

    # Create new user
    new_user = UserCreate(
        email=email,
        full_name=full_name or email.split('@')[0],
        # OAuth users don't need to set password
    )

    created = await supabase.table('users') \
        .insert({
            'id': str(auth_user_id),
            'email': new_user.email,
            'full_name': new_user.full_name,
            'role': 'member',
            # organization_id will be set via invitation or later
        }) \
        .execute()

    return User(**created.data[0])
```

### Route Registration

**File to Update**: `frontend/src/App.tsx`

```tsx
// Add to routes
<Route path="/auth/callback" element={<AuthCallback />} />
```

## Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| OAuth denied | "You cancelled the sign in" | Redirect to login |
| Email not verified | "Please verify your email" | Show verification instructions |
| Account exists | "Account already exists" | Offer to link or login |
| Server error | "Something went wrong" | Show retry button |

## Definition of Done
- [ ] Callback route processes OAuth tokens
- [ ] New users created in database
- [ ] Existing users linked to OAuth identity
- [ ] Error states show user-friendly messages
- [ ] Invitation tokens processed during OAuth signup
- [ ] Return URL preserved through OAuth flow
