# Supabase Email Templates — Production Setup Guide

Supabase's hosted platform does not read `config.toml` template settings — those only apply to the local CLI stack. For production, templates must be pasted manually into the Supabase Dashboard.

> **Status note:** the branded template HTML files under `supabase/templates/` are
> not yet present in this repo. Create that directory and the four HTML files
> below before following the production steps; the local-testing section assumes
> `config.toml` wires those same files.

## Templates

| Type | File | Subject |
|------|------|---------|
| Confirm signup | `supabase/templates/confirm-signup.html` | Confirm your CapVeri account |
| Password reset | `supabase/templates/reset-password.html` | Reset your CapVeri password |
| Magic link | `supabase/templates/magic-link.html` | Your CapVeri login link |
| Email change | `supabase/templates/change-email.html` | Confirm your new email address |

## Steps

1. Open the [Supabase Dashboard](https://app.supabase.com) and select the CapVeri project.
2. Go to **Authentication** → **Email Templates** in the left sidebar.
3. For each template type below, select it from the dropdown, paste the HTML, update the subject, and click **Save**.

### Confirm signup

- **Subject:** `Confirm your CapVeri account`
- **Body:** paste contents of `supabase/templates/confirm-signup.html`

### Password reset (Recovery)

- **Subject:** `Reset your CapVeri password`
- **Body:** paste contents of `supabase/templates/reset-password.html`

### Magic link

- **Subject:** `Your CapVeri login link`
- **Body:** paste contents of `supabase/templates/magic-link.html`

### Email change

- **Subject:** `Confirm your new email address`
- **Body:** paste contents of `supabase/templates/change-email.html`

## Local Testing

Wire all 4 templates for the local CLI stack in `supabase/config.toml` (under the relevant `[auth.email.template.*]` sections). To reload after changes:

```bash
supabase stop && supabase start
```

Locally, Supabase delivers auth emails to **Inbucket** at [http://localhost:54324](http://localhost:54324) (the Inbucket port set in this repo's `supabase/config.toml`). Test each flow:

| Flow | How to trigger |
|------|----------------|
| Confirm signup | Register a new account |
| Password reset | Click "Forgot password" on the login page |
| Magic link | Use the magic link login option |
| Email change | Change email in account settings |

Verify all 4 emails render with the navy header, gold accent bar, and CapVeri branding before deploying to production.
