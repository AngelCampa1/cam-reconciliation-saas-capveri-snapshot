# OAuth Provider Setup Guide

This guide explains how to configure Google OAuth for CapVeri authentication using Supabase.

## Overview

OAuth configuration is handled through the Supabase Dashboard. Supabase manages the OAuth flow, token exchange, and user creation automatically.

OAuth credentials are configured in Supabase Dashboard, not in `.env`. The local `supabase/config.toml` keeps Google as the only social login provider represented for this app.

## Google OAuth Setup

### Step 1: Create Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth 2.0 Client ID**.
5. Configure the consent screen if prompted:
   - User Type: **External**
   - App name: **CapVeri**
   - User support email: your support email
   - Developer contact: your developer contact email
   - Scopes: `email`, `profile`, `openid`

### Step 2: Configure OAuth Client

1. Application type: **Web application**.
2. Name: **CapVeri - Production** or the appropriate environment name.
3. Add authorized JavaScript origins:
   ```text
   http://localhost:5173
   https://<your-project-ref>.supabase.co
   https://app.capveri.com
   ```
4. Add the authorized redirect URI:
   ```text
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
5. Click **Create**.
6. Copy the **Client ID** and **Client Secret**.

### Step 3: Configure Supabase

1. Go to the [Supabase Dashboard](https://app.supabase.com/).
2. Select the project.
3. Navigate to **Authentication > Providers**.
4. Enable **Google**.
5. Paste the Google **Client ID** and **Client Secret**.
6. Save the provider settings.

## Redirect URL Configuration

The OAuth flow is:

1. User clicks **Google** in the app.
2. Supabase redirects the user to Google.
3. Google redirects back to `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Supabase processes the OAuth response.
5. Supabase redirects to the app callback URL.

Application callback URLs:

| Environment | Redirect URL |
|-------------|--------------|
| Local | `http://localhost:5173/auth/callback` |
| Staging | `https://staging.capveri.com/auth/callback` |
| Production | `https://app.capveri.com/auth/callback` |

Only the Supabase callback URL is configured in Google. Supabase handles the final redirect to the app.

## Testing OAuth Locally

1. Start Supabase:
   ```bash
   supabase start
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173/login`.
4. Click **Google**.
5. Authorize the app.
6. Confirm the browser returns to `/auth/callback`.
7. Confirm the user exists in Supabase Dashboard > Authentication > Users.

## Troubleshooting

### Redirect URI Mismatch

Verify the Google authorized redirect URI exactly matches:

```text
https://<your-project-ref>.supabase.co/auth/v1/callback
```

Check for trailing slashes and ensure the URL uses `https://`.

### Invalid Client ID

Copy the Client ID and Secret again from Google Cloud Console and save them in Supabase Dashboard > Authentication > Providers > Google.

### User Not Created

Check Supabase logs, verify user-creation triggers, and confirm RLS policies permit the expected auth flow.

### OAuth Works Locally But Not in Production

Add `https://app.capveri.com` to Google authorized origins and ensure the Supabase callback URL uses the production project reference.

## Security Best Practices

- Use separate Google OAuth clients for development, staging, and production.
- Rotate the Google Client Secret regularly.
- Monitor Supabase auth logs for unusual sign-in patterns.
- Request only the minimum scopes: `openid`, `email`, and `profile`.

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Social Login Documentation](https://supabase.com/docs/guides/auth/social-login)
