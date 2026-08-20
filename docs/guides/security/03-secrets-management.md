# Secrets Management

Best practices for managing secrets in CapVeri production environment.

## Secrets Inventory

### High Sensitivity (Never Expose)

| Secret | Location | Purpose |
|--------|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Worker secret | Full database access |
| `AWS_SECRET_ACCESS_KEY` | Cloudflare Worker secret | AWS services |
| `OPENROUTER_API_KEY` | Cloudflare Worker secret | AI model gateway |
| `STRIPE_SECRET_KEY` | Cloudflare Worker secret | Billing operations |
| `STRIPE_WEBHOOK_SECRET` | Cloudflare Worker secret | Webhook verification |
| `RESEND_API_KEY` | Cloudflare Worker secret | Email sending |
| `DATABASE_URL` | Cloudflare Worker secret / Hyperdrive | Database connection |

### Medium Sensitivity (Backend Only)

| Secret | Location | Purpose |
|--------|----------|---------|
| `AWS_ACCESS_KEY_ID` | Cloudflare Worker var/secret | AWS identification |
| `SUPABASE_ANON_KEY` | Cloudflare Worker var/secret | API access |

### Low Sensitivity (Can Expose)

| Secret | Location | Purpose |
|--------|----------|---------|
| `SUPABASE_URL` | Cloudflare Worker var | API endpoint |
| `STRIPE_PUBLISHABLE_KEY` | Cloudflare Worker var | Frontend billing |

## Storage Locations

### Cloudflare Workers

1. Keep non-secret values in the relevant `wrangler.jsonc`.
2. Add sensitive values with `npx wrangler secret put <NAME> --name <worker-name>`.
3. Cloudflare encrypts secrets at rest.
4. Variables are injected at runtime.

### Frontend / Marketing

Public frontend and marketing variables are compiled into client bundles. Never put secret
values in `VITE_*` or `NEXT_PUBLIC_*` variables.

### Supabase Dashboard

OAuth credentials stored in:
- **Authentication** > **Providers** > Google settings

## Rotation Schedule

### Recommended Rotation

| Secret | Period | Notes |
|--------|--------|-------|
| AWS keys | 90 days | Create new → Update → Delete old |
| Anthropic key | 90 days | Create new → Update → Delete old |
| Stripe keys | 12 months | Use "Roll keys" feature |
| Resend key | 12 months | Create new → Update → Delete old |
| Database password | 6 months | Update in Supabase |

### Rotation Procedure

1. **Create new key** in provider dashboard
2. **Update** the Cloudflare Worker secret or var
3. **Deploy** to apply new key
4. **Verify** application works
5. **Delete/revoke** old key

### Example: Rotate AWS Keys

```bash
# 1. Create new key in AWS IAM Console

# 2. Update Cloudflare Worker secrets
npx wrangler secret put AWS_ACCESS_KEY_ID --name capveri-api
npx wrangler secret put AWS_SECRET_ACCESS_KEY --name capveri-api

# 3. Redeploy
npx wrangler deploy --env production

# 4. Test
curl https://api.capveri.com/api/v1/extraction/health

# 5. Delete old key in AWS IAM Console
```

## Emergency Procedures

### Compromised Key Response

**Immediately:**

1. **Revoke** the compromised key in provider dashboard
2. **Generate** new key
3. **Update** the Cloudflare Worker secret or var
4. **Deploy** immediately
5. **Audit** logs for unauthorized access
6. **Notify** team/stakeholders

### Provider-Specific Revocation

| Provider | How to Revoke |
|----------|---------------|
| AWS | IAM Console > User > Security credentials > Delete key |
| Anthropic | Console > API Keys > Delete |
| Stripe | Dashboard > API keys > Roll keys |
| Resend | Dashboard > API Keys > Delete |
| Supabase | Settings > API > Regenerate |

### Post-Incident

1. Document timeline of events
2. Identify how leak occurred
3. Implement prevention measures
4. Update rotation schedule if needed

## Security Best Practices

### Do

- Use environment variables exclusively
- Rotate keys on schedule
- Use separate keys for dev/prod
- Limit key permissions (least privilege)
- Monitor for unauthorized usage
- Enable MFA on provider accounts

### Don't

- Commit secrets to Git
- Log secrets in application logs
- Share secrets via email/Slack
- Use same keys across environments
- Store secrets in code comments
- Expose service role key to frontend

## Audit Checklist

### Monthly Audit

- [ ] Review all active API keys
- [ ] Check for unused keys (revoke)
- [ ] Verify rotation schedule followed
- [ ] Check provider access logs
- [ ] Review team access to secrets

### On Team Changes

- [ ] Rotate keys when team members leave
- [ ] Update access permissions
- [ ] Audit who has access to what

## Git Protection

### .gitignore

Ensure these patterns are in `.gitignore`:

```gitignore
# Environment files
.env
.env.*
!.env.example

# Secrets
*.pem
*.key
credentials.json
```

### Pre-commit Hook

Add secret detection:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
```

### GitHub Secret Scanning

Enable in repository settings:
1. **Settings** > **Security** > **Code security**
2. Enable **Secret scanning**

## Monitoring

### AWS CloudTrail

Monitor AWS key usage:
1. Enable CloudTrail
2. Set up alerts for unusual activity

### Stripe Dashboard

Monitor API usage:
1. **Developers** > **Logs**
2. Check for unusual patterns

### Application Logs

Log secret usage (not the secrets):
```python
logger.info(f"document reader called by user {user_id}")
# Never: logger.info(f"Using key {api_key}")
```

## Recovery

### Lost Access

If you lose access to secrets:

1. **Supabase**: Reset via dashboard or support
2. **AWS**: Create new IAM user/keys
3. **Stripe**: Contact support for account recovery
4. **Anthropic**: Contact support

### Backup

Consider secure backup of critical credentials:
- Use password manager (1Password, Bitwarden)
- Store recovery codes securely
- Document in secure location (not Git)

## Next Steps

- [Security Headers](./04-security-headers-and-cors.md)
- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
