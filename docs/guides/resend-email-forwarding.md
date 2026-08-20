# Email Forwarding with Resend and Other Services

## Overview

This guide explains how to set up email forwarding for your domains (capveri.com, ventoralabs.com, etc.) to your personal email address (angel.campa@capveri.com).

**Important**: Resend does NOT have native email forwarding built-in. This guide covers three approaches.

---

## Approach A: Cloudflare Email Routing (RECOMMENDED)

**Best for**: Simple forwarding needs, no custom logic required
**Cost**: FREE
**Setup Time**: 5-10 minutes

### Why Cloudflare?
- Completely free with any Cloudflare plan (including free tier)
- No code required
- Unlimited aliases
- Built-in spam protection
- Works with domains using Cloudflare DNS (or you can transfer)

### Prerequisites
- Domain must use Cloudflare DNS nameservers
- If not using Cloudflare, you'll need to transfer DNS (free and easy)

### Setup Steps

#### 1. Add Domain to Cloudflare (if not already)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click "Add a Site" → Enter domain → Select Free plan
3. Copy the Cloudflare nameservers (e.g., `dana.ns.cloudflare.com`, `walt.ns.cloudflare.com`)
4. Update nameservers at your domain registrar
5. Wait for DNS propagation (usually 5-15 minutes)

#### 2. Enable Email Routing
1. In Cloudflare dashboard, select your domain
2. Click **Email** in left sidebar → **Email Routing**
3. Click **Get Started**
4. Cloudflare will automatically configure MX records

#### 3. Create Email Forwarding Rules
1. Go to **Routing rules** tab
2. Click **Create address**
3. Configure forwarding:
   - **Email address**: `contact@capveri.com`
   - **Action**: Forward to
   - **Destination**: `angel.campa@capveri.com`
4. Click **Save**

#### 4. Verify Your Destination Email
1. Check `angel.campa@capveri.com` inbox
2. Click verification link from Cloudflare
3. Forwarding is now active!

### Example Forwarding Rules

For **capveri.com**:
```
contact@capveri.com    → angel.campa@capveri.com
support@capveri.com    → angel.campa@capveri.com
billing@capveri.com    → angel.campa@capveri.com
hello@capveri.com      → angel.campa@capveri.com
```

For **ventoralabs.com**:
```
operator@ventoralabs.com  → angel.campa@capveri.com
contact@ventoralabs.com → angel.campa@capveri.com
```

### Catch-All Address (Optional)
To forward ALL emails to a domain:
1. In Email Routing → **Routing rules**
2. Click **Create address**
3. Select **Catch-all address**
4. Forward to: `angel.campa@capveri.com`

### Verification
Send a test email to `contact@capveri.com` from another account and verify it arrives at `angel.campa@capveri.com`.

---

## Approach B: ImprovMX (Alternative)

**Best for**: Multiple domains, don't want to use Cloudflare
**Cost**: Free tier (25 aliases, 500 emails/day), Paid from $9/month
**Setup Time**: 10-15 minutes

### Setup Steps

#### 1. Sign Up
1. Go to [ImprovMX](https://improvmx.com)
2. Create free account

#### 2. Add Domain
1. Click **Add Domain** → Enter `capveri.com`
2. Add DNS records at your registrar:

**MX Records** (Priority 10 & 20):
```
MX Priority 10: mx1.improvmx.com
MX Priority 20: mx2.improvmx.com
```

**TXT Record** (for SPF):
```
v=spf1 include:spf.improvmx.com ~all
```

#### 3. Configure Aliases
1. In ImprovMX dashboard → Select domain
2. Click **Add Alias**
   - **Alias**: `contact@capveri.com`
   - **Forward to**: `angel.campa@capveri.com`
3. Repeat for other addresses

#### 4. Verify
Send test email to verify forwarding works.

### Limitations (Free Tier)
- 25 aliases per domain
- 500 emails/day
- No catch-all on free tier
- No SMTP sending (receive-only)

---

## Approach C: Resend Inbound + Custom Webhook (ADVANCED)

**Best for**: Need custom logic, programmatic handling, database logging
**Cost**: Included in Resend Pro ($20/month)
**Setup Time**: 1-2 hours of development

### When to Use This
Only if you need:
- Custom email processing logic
- Save emails to database
- Auto-respond with AI
- Parse email content programmatically
- Integrate with ticketing system

### Architecture
```
Inbound Email → Resend MX → Webhook → Your API → Forward via Resend
```

### Setup Steps

#### 1. Enable Resend Inbound
1. Go to [Resend Dashboard](https://resend.com/domains)
2. Select domain → **Inbound** tab
3. Add MX records to your domain:
```
MX Priority 10: inbound-smtp.resend.com
```

#### 2. Create Webhook Endpoint
Add to `backend/app/api/v1/webhooks.py`:

```python
from fastapi import APIRouter, Request
from app.services.email.resend_service import EmailService

router = APIRouter()

@router.post("/resend-inbound")
async def handle_inbound_email(request: Request):
    """Handle inbound emails from Resend and forward them."""
    payload = await request.json()

    # Extract email details
    from_email = payload.get("from")
    to_email = payload.get("to")  # e.g., contact@capveri.com
    subject = payload.get("subject")
    html = payload.get("html")
    text = payload.get("text")

    # Forward to your email
    email_service = EmailService(
        api_key=settings.resend_api_key,
        from_address=settings.resend_from_address
    )

    await email_service.send_forwarded_email(
        to_email="angel.campa@capveri.com",
        original_from=from_email,
        original_to=to_email,
        subject=f"[Fwd: {to_email}] {subject}",
        html=html,
        text=text,
    )

    return {"status": "forwarded"}
```

#### 3. Register Webhook in Resend
1. Resend Dashboard → Domain → **Inbound** → **Webhooks**
2. Add webhook URL: `https://api.capveri.com/api/v1/webhooks/resend-inbound`
3. Select events: `email.received`
4. Save webhook

#### 4. Add Forward Method to EmailService
In `backend/app/services/email/resend_service.py`:

```python
async def send_forwarded_email(
    self,
    to_email: str,
    original_from: str,
    original_to: str,
    subject: str,
    html: str,
    text: str,
) -> dict[str, Any]:
    """Forward an inbound email."""
    forwarded_html = f"""
    <div style="background: #f0f0f0; padding: 10px; margin-bottom: 20px;">
        <strong>Forwarded Message</strong><br>
        <strong>From:</strong> {original_from}<br>
        <strong>To:</strong> {original_to}<br>
    </div>
    {html}
    """

    response = resend.Emails.send({
        "from": self.from_address,
        "to": to_email,
        "subject": subject,
        "html": forwarded_html,
        "text": f"From: {original_from}\nTo: {original_to}\n\n{text}",
    })

    return {"status": "sent", "id": response["id"]}
```

### Limitations
- Requires Resend Pro plan ($20/month)
- Requires server-side code and hosting
- More complex to maintain
- Need public HTTPS endpoint

---

## Recommendation

### Use Cloudflare Email Routing if:
- You want simple, free forwarding
- No custom logic needed
- Domain already on Cloudflare (or willing to transfer DNS)

### Use ImprovMX if:
- You don't want to use Cloudflare
- Need forwarding for multiple domains
- Free tier limits (25 aliases, 500/day) work for you

### Use Resend Inbound if:
- You need custom email processing
- Want to build a support ticket system
- Need database logging of emails
- Already paying for Resend Pro

---

## Domain-Specific Setup Checklist

### For capveri.com
- [ ] Choose approach (Cloudflare recommended)
- [ ] Set up forwarding for:
  - `contact@capveri.com`
  - `support@capveri.com`
  - `billing@capveri.com`
  - `hello@capveri.com`
  - `noreply@capveri.com` (keep for Resend sending)
- [ ] Test forwarding
- [ ] Update email signature to use forwarded address

### For ventoralabs.com
- [ ] Choose approach (Cloudflare recommended)
- [ ] Set up forwarding for:
  - `operator@ventoralabs.com`
  - `contact@ventoralabs.com`
  - `hello@ventoralabs.com`
- [ ] Test forwarding

---

## Troubleshooting

### Emails Not Arriving
1. **Check MX records**: Use [MXToolbox](https://mxtoolbox.com) to verify MX records
2. **Check spam folder**: Forwarded emails may be flagged
3. **Verify destination email**: Make sure verification link was clicked
4. **DNS propagation**: Wait 15-60 minutes after DNS changes

### Emails Going to Spam
1. Add forwarding service to safe senders list
2. Check SPF/DKIM records are configured
3. Mark test emails as "Not Spam"

### Multiple Domains Not Working
1. Repeat setup for each domain individually
2. Verify each domain's MX records separately
3. Test each domain independently

---

## Next Steps

1. **Choose your approach** (Cloudflare recommended)
2. **Follow setup steps** for chosen approach
3. **Test forwarding** with sample emails
4. **Update email signatures** to use new addresses
5. **Monitor for issues** in first week

---

## Additional Resources

- [Cloudflare Email Routing Docs](https://developers.cloudflare.com/email-routing/)
- [ImprovMX Documentation](https://improvmx.com/guides/)
- [Resend Inbound Docs](https://resend.com/docs/api-reference/emails/inbound-emails)
- [MXToolbox](https://mxtoolbox.com) - Test DNS records
