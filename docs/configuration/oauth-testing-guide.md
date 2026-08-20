# OAuth Testing Guide - Google Sign In

CapVeri supports Google as the social login provider. Apple is not offered as an SSO option in the app, Supabase config, or account-linking UI.

## Local Testing

| Provider | Local Testable | Notes |
|----------|----------------|-------|
| Google Sign In | Yes | Requires Google OAuth client configured with the Supabase callback URL. |

## Prerequisites

1. Supabase is running locally or the frontend points at a configured Supabase project.
2. Google is enabled in Supabase Dashboard > Authentication > Providers.
3. The Google OAuth client has this authorized redirect URI:
   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
4. The frontend is running:
   ```bash
   cd frontend
   npm run dev
   ```

## Manual Test: Login

1. Open `http://localhost:5173/auth/login`.
2. Confirm the only social login button is **Google**.
3. Click **Google**.
4. Confirm the browser redirects to Google authentication.
5. Complete Google authentication.
6. Confirm the browser returns to `/auth/callback`.
7. Confirm the user reaches the expected post-auth page.

## Manual Test: Signup

1. Open `http://localhost:5173/auth/register`.
2. Confirm the only social signup button is **Google**.
3. Click **Google**.
4. Complete Google authentication.
5. Confirm a new SSO signup routes to `/onboard?demo=1&source=first-login`.

## Manual Test: Linked Accounts

1. Sign in.
2. Open the profile/settings page that contains linked accounts.
3. Confirm Google is the only social account option.
4. Confirm no Apple link button or Apple account row is shown.
5. Link and unlink Google when another sign-in method exists.

## Automated Checks

Run the focused frontend tests:

```bash
cd frontend
npm test -- SocialLoginButtons AuthContext LinkedAccounts AuthCallback
```

Then run the frontend type check:

```bash
cd frontend
npm run typecheck
```

## Troubleshooting

### Redirect URI Mismatch

Verify the Google OAuth client redirect URI exactly matches the Supabase callback URL. The URL must use `https://` and must not include an extra trailing slash.

### Google Button Missing

Check `frontend/src/components/auth/SocialLoginButtons.tsx`. The component should render Google only.

### Unexpected Apple UI

Search the app source for Apple SSO references:

```bash
rg "provider: 'apple'|loginWithApple|AppleIcon|Sign in with Apple" frontend supabase docs
```

Only historical docs or tests that explicitly verify Apple is hidden should mention Apple.
