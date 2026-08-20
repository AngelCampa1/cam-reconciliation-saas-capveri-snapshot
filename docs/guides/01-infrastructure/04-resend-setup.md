# Resend Setup Guide

This guide covers configuring Resend for transactional email in CapVeri.

## Overview

CapVeri uses Resend for:
- Tenant portal invitations
- New statement notifications
- Dispute status updates
- Password reset emails (via Supabase Auth)

## Prerequisites

- Resend account at [resend.com](https://resend.com)
- Domain with DNS access for verification

## 1. Create Resend Account

### Sign Up

1. Navigate to [resend.com](https://resend.com)
2. Click **Get Started**
3. Sign up with email or GitHub
4. Verify your email address

### Free Tier Limits

| Limit | Free Tier |
|-------|-----------|
| Emails/month | 3,000 |
| Emails/day | 100 |
| Domains | 1 |
| API keys | 1 |

Upgrade to paid plan for higher limits.

## 2. Verify Domain

### Why Verify?

Domain verification:
- Improves email deliverability
- Enables custom "from" addresses
- Adds SPF/DKIM authentication
- Reduces spam filtering

### Add Domain

1. Go to **Domains** in Resend dashboard
2. Click **Add domain**
3. Enter your domain: `capveri.com`
4. Click **Add**

### DNS Records

Add the following DNS records to your domain:

#### SPF Record (TXT)
```
Host: @
Type: TXT
Value: v=spf1 include:resend.com ~all
```

#### DKIM Record (TXT)
```
Host: resend._domainkey
Type: TXT
Value: [Provided by Resend dashboard]
```

#### DMARC Record (TXT) - Recommended
```
Host: _dmarc
Type: TXT
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@capveri.com
```

### Verify

1. After adding DNS records, click **Verify** in Resend
2. DNS propagation may take up to 48 hours
3. Status changes from "Pending" to "Verified"

## 3. Create API Key

### Generate Key

1. Go to **API Keys** in Resend dashboard
2. Click **Create API Key**
3. Name: `capveri-production`
4. Permission: **Sending access** (for sending only)
5. Domain: Select your verified domain
6. Click **Create**
7. Copy the key immediately: `re_...`

### Security

- Use separate keys for development/production
- Restrict to specific domain for security
- Store in environment variables only

## 4. Environment Variables

Add to your backend `.env`:

```env
# Resend Configuration
RESEND_API_KEY=re_...your-api-key...
RESEND_FROM_ADDRESS=Angel Campa <angel.campa@capveri.com>
```

### From Address Format

```
Display Name <email@domain.com>
```

Examples:
- `Angel Campa <angel.campa@capveri.com>` - Branded
- `Angel Campa <angel.campa@capveri.com>` - Specific
- `angel.campa@capveri.com` - Simple (no display name)

## 5. Application Integration

### Email Service

The email service (`backend/app/services/email/resend_service.py`) provides:

| Method | Purpose |
|--------|---------|
| `send_new_statement_notification()` | Notify tenant of new CAM statement |
| `send_tenant_invitation()` | Invite tenant to portal |
| `send_dispute_update()` | Notify of dispute status change |

### Email Templates

All emails use inline HTML with:
- Arial font family
- Max width 600px
- Blue (#2563eb) call-to-action buttons
- Responsive styling

### Example: Send Statement Notification

```python
from app.services.email.resend_service import EmailService

email_service = EmailService(
    api_key=settings.resend_api_key,
    from_address=settings.resend_from_address
)

await email_service.send_new_statement_notification(
    to_email="tenant@company.com",
    tenant_name="ABC Corp",
    property_name="123 Main Street",
    period="2024",
    amount="$12,500.00",
    portal_url="https://app.capveri.com/tenant/statements/123"
)
```

## 6. Rate Limits

### Application Limits

CapVeri enforces additional rate limits:

| Email Type | Limit |
|------------|-------|
| Per tenant/hour | 10 emails |
| Per organization/day | 100 emails |

### Resend API Limits

| Plan | Rate |
|------|------|
| Free | 2 requests/second |
| Pro | 10 requests/second |
| Enterprise | Custom |

## 7. Testing

### Test Email

Send a test email via curl:

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_...your-api-key...' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "Angel Campa <angel.campa@capveri.com>",
    "to": ["your-email@example.com"],
    "subject": "Test Email",
    "html": "<p>This is a test email from CapVeri.</p>"
  }'
```

### Test via Application

```python
# In Python shell or test file
import asyncio
from app.services.email.resend_service import EmailService

async def test_email():
    service = EmailService(
        api_key="re_...",
        from_address="Angel Campa <angel.campa@capveri.com>"
    )
    result = await service.send_tenant_invitation(
        to_email="test@example.com",
        invitation_token="test-token-123",
        expires_at=datetime.now() + timedelta(days=7)
    )
    print(result)

asyncio.run(test_email())
```

### Check Delivery

1. Go to Resend dashboard > **Emails**
2. View sent emails with status
3. Check for bounces or complaints

## 8. Email Content

### Statement Notification

```
Subject: New CAM Statement Available - [Property Name]

Body:
- Greeting with tenant name
- Property, period, and amount details
- "View Statement" button linking to portal
- Note about dispute process
```

### Tenant Invitation

```
Subject: You're Invited to CapVeri Tenant Portal

Body:
- Welcome message
- "Create Your Account" button
- Expiration notice (7 days)
```

### Dispute Update

```
Subject: Dispute Update - [Property Name]

Body:
- Greeting with tenant name
- Property name and new status
- "View Details" button
```

## 9. Deliverability Best Practices

### Improve Delivery Rates

1. **Verify domain** - Always verify with SPF/DKIM
2. **Use consistent sender** - Same from address
3. **Clean list** - Remove bounced addresses
4. **Add unsubscribe** - For marketing emails (not required for transactional)
5. **Monitor reputation** - Check Resend dashboard

### Avoid Spam Filters

1. **Don't use ALL CAPS** in subject
2. **Avoid spam trigger words** - "Free", "Act now", etc.
3. **Balance text and images**
4. **Include plain text version** (Resend handles automatically)

## 10. Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Domain not verified | DNS not propagated | Wait 24-48h, check records |
| Invalid API key | Wrong key | Regenerate in dashboard |
| Email not delivered | Spam filtered | Check spam folder, verify domain |
| Rate limited | Too many requests | Implement backoff/queue |

### Debug Steps

1. Check Resend dashboard for email status
2. View bounce/complaint reports
3. Check application logs for API errors
4. Verify DNS records with `dig` or online tools

### Check DNS Records

```bash
# Check SPF
dig TXT capveri.com

# Check DKIM
dig TXT resend._domainkey.capveri.com

# Check DMARC
dig TXT _dmarc.capveri.com
```

## 11. Cost Estimate

### Resend Pricing

| Plan | Emails/month | Price |
|------|-------------|-------|
| Free | 3,000 | $0 |
| Pro | 50,000 | $20/month |
| Business | 100,000 | $45/month |
| Enterprise | Custom | Contact sales |

### Usage Estimate (Small Deployment)

| Email Type | Volume/Month | Est. Count |
|------------|--------------|------------|
| Statement notifications | Per statement | ~100 |
| Tenant invitations | Per new tenant | ~20 |
| Dispute updates | Per status change | ~30 |
| **Total** | | **~150** |

Free tier is sufficient for small deployments.

## Related Documentation

- [Resend Docs](https://resend.com/docs) - Official documentation
- [DNS Setup](https://resend.com/docs/dashboard/domains/introduction) - Domain verification
- [Environment Variables Reference](../02-deployment/05-environment-variables-reference.md) - All config options

## Next Steps

- [Deployment Overview](../02-deployment/01-deployment-overview.md) - Deploy to production
- [Supabase Setup](../02-deployment/02-supabase-production-setup.md) - Configure database
