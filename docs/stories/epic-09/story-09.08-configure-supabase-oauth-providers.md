# Story 9.8: Configure Supabase OAuth Providers

## Story Info
- **Epic**: Authentication UI
- **Estimated Hours**: 2
- **Dependencies**: Story 3.1 (Supabase Config)
- **Status**: `pending`

## User Story
**As a** user
**I want** Google and Apple sign-in options available
**So that** I can use my existing accounts to access CapVeri

## Acceptance Criteria
- [ ] **AC1**: Google OAuth configured in Supabase dashboard
- [ ] **AC2**: Apple OAuth configured in Supabase dashboard
- [ ] **AC3**: Environment variables documented for OAuth credentials
- [ ] **AC4**: Redirect URLs configured for all environments (local, staging, prod)
- [ ] **AC5**: OAuth scopes request only necessary permissions (email, profile)

## Technical Specifications

### Google OAuth Setup

**Supabase Dashboard Configuration**:
1. Navigate to Authentication > Providers
2. Enable Google provider
3. Configure Client ID and Secret from Google Cloud Console

**Google Cloud Console Setup**:
1. Create OAuth 2.0 Client ID (Web application)
2. Add authorized JavaScript origins:
   - `http://localhost:5173` (local dev)
   - `https://your-project.supabase.co` (Supabase auth)
   - `https://app.capveri.com` (production)
3. Add authorized redirect URIs:
   - `https://your-project.supabase.co/auth/v1/callback`

**Required Scopes**:
- `openid`
- `email`
- `profile`

### Apple OAuth Setup

**Supabase Dashboard Configuration**:
1. Navigate to Authentication > Providers
2. Enable Apple provider
3. Configure Service ID, Team ID, Key ID, and Private Key

**Apple Developer Console Setup**:
1. Create App ID with Sign in with Apple capability
2. Create Service ID for web authentication
3. Configure domains and redirect URLs:
   - `https://your-project.supabase.co/auth/v1/callback`
4. Create and download private key (.p8 file)

**Required Scopes**:
- `email`
- `name`

### Environment Variables

**File to Update**: `.env.example`

```bash
# OAuth Providers (configured in Supabase Dashboard, documented here)
# =================================================================

# Google OAuth
# - Create at: https://console.cloud.google.com/apis/credentials
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-client-secret
# Note: Enter these values in Supabase Dashboard > Authentication > Providers

# Apple OAuth
# - Create at: https://developer.apple.com/account/resources/identifiers
# APPLE_SERVICE_ID=com.capveri.auth
# APPLE_TEAM_ID=XXXXXXXXXX
# APPLE_KEY_ID=XXXXXXXXXX
# APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
# Note: Enter these values in Supabase Dashboard > Authentication > Providers

# OAuth Redirect URLs (for reference)
# Local: http://localhost:5173/auth/callback
# Staging: https://staging.capveri.com/auth/callback
# Production: https://app.capveri.com/auth/callback
```

### Supabase Configuration

**File to Create**: `docs/configuration/oauth-setup.md`

```markdown
# OAuth Provider Setup Guide

## Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized origins and redirect URIs
6. Copy Client ID and Secret to Supabase Dashboard

## Apple Sign In

1. Go to [Apple Developer Console](https://developer.apple.com/)
2. Navigate to Certificates, Identifiers & Profiles
3. Create App ID with "Sign in with Apple" capability
4. Create Service ID and configure web domain
5. Create private key and download .p8 file
6. Enter all values in Supabase Dashboard

## Redirect URL Configuration

Supabase handles the OAuth callback internally. Your app receives
the session after Supabase processes the OAuth response.

Callback URL pattern:
`https://<project-ref>.supabase.co/auth/v1/callback`

After successful auth, user is redirected to:
`<your-site>/auth/callback`
```

## Definition of Done
- [ ] Google OAuth works end-to-end in development
- [ ] Apple OAuth works end-to-end in development
- [ ] Environment variables documented in .env.example
- [ ] Setup guide created for other developers
- [ ] Redirect URLs work for all environments
