# Domain and SSL Configuration

This guide covers configuring custom domains and SSL certificates for CapVeri.

## Domain Architecture

| Domain | Service | Purpose |
|--------|---------|---------|
| `app.capveri.com` | Cloudflare Worker `capveri-app` | Frontend React app |
| `api.capveri.com` | Cloudflare Worker `capveri-api` | Backend API |
| `*.supabase.co` | Supabase | Database, Auth, Storage |

Authenticated app routes are app-domain only. Marketing host
`www.capveri.com` must redirect app route prefixes to `app.capveri.com`.

## 1. Purchase Domain

### Recommended Registrars

| Registrar | Price | Features |
|-----------|-------|----------|
| Cloudflare | ~$10/year | Free DNS, no markup |
| Namecheap | ~$12/year | Good UI, WhoisGuard |
| Google Domains | ~$12/year | Simple, reliable |
| Porkbun | ~$9/year | Budget option |

### Domain Selection

- Use `.io` for tech products
- Keep it short and memorable
- Avoid hyphens if possible

## 2. DNS Configuration

### Required Records

Add these DNS records at your registrar:

#### Frontend (Cloudflare Worker)

Configure `app.capveri.com` as a Cloudflare Worker route for `capveri-app`.

#### Backend API (Cloudflare Worker)

Configure `api.capveri.com/*` as a Cloudflare Worker route for `capveri-api`.

#### Root Domain Redirect (Optional)

If you want `capveri.com` to redirect to `app.capveri.com`:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `@` | `76.76.21.21` | 3600 |

Then configure the redirect in Cloudflare/marketing routing.

### Email Records (For Resend)

| Type | Host | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:resend.com ~all` |
| TXT | `resend._domainkey` | `[From Resend dashboard]` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine` |

## 3. SSL Certificates

### Automatic SSL (Recommended)

Cloudflare provides automatic SSL for routed Worker domains:

1. Add custom domain in dashboard
2. Wait for DNS propagation
3. SSL certificate is auto-provisioned
4. Auto-renewal handled

### Verify SSL

```bash
# Check certificate
openssl s_client -connect app.capveri.com:443 -servername app.capveri.com

# Or use curl
curl -vI https://app.capveri.com 2>&1 | grep -A5 "Server certificate"
```

### Force HTTPS

Cloudflare forces HTTPS by default. Verify:
- `http://app.capveri.com` → redirects to `https://`
- `http://api.capveri.com` → redirects to `https://`

## 4. Configure Services

### Cloudflare Worker Domain Setup

1. Confirm Worker routes in each `wrangler.jsonc`.
2. Deploy the impacted Worker with Wrangler.
3. Verify `npx wrangler deployments status --name <worker-name>` shows the newest version at 100%.
4. Verify the live domain with `curl.exe -I`.

### Supabase (No Custom Domain on Free)

Supabase uses `*.supabase.co` subdomains. Custom domains require paid plan.

## 5. Update CORS Configuration

After setting up domains, update backend CORS:

### Backend Config

Update `FRONTEND_URL` environment variable:

```env
FRONTEND_URL=https://app.capveri.com
```

The backend automatically allows this origin for CORS.

### Verify CORS

```bash
# Test preflight request
curl -X OPTIONS https://api.capveri.com/api/v1/properties \
  -H "Origin: https://app.capveri.com" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

Expected headers:
```
Access-Control-Allow-Origin: https://app.capveri.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

## 6. Update OAuth Redirect URLs

### Supabase Auth Settings

1. Go to Supabase Dashboard > **Authentication** > **URL Configuration**
2. Update:
   - **Site URL**: `https://app.capveri.com`
   - **Redirect URLs**: Add `https://app.capveri.com/auth/callback`

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Go to **APIs & Services** > **Credentials**
4. Edit your OAuth 2.0 Client
5. Add to **Authorized redirect URIs**:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

## 7. Stripe Webhook URL

Update Stripe webhook for production:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) > **Developers** > **Webhooks**
2. Edit endpoint URL:
   ```
   https://api.capveri.com/api/v1/billing/webhook
   ```
3. Get new signing secret
4. Update `STRIPE_WEBHOOK_SECRET` as a Cloudflare Worker secret for `capveri-api`

## 8. DNS Propagation

### Check Propagation

Use online tools:
- [whatsmydns.net](https://www.whatsmydns.net)
- [dnschecker.org](https://dnschecker.org)

### Expected Timeline

| Record Type | Typical Time |
|-------------|--------------|
| A/CNAME | 5 min - 4 hours |
| TXT (email) | 1 - 24 hours |
| Full propagation | Up to 48 hours |

### Clear DNS Cache

```bash
# macOS
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Windows
ipconfig /flushdns

# Linux
sudo systemd-resolve --flush-caches
```

## 9. Security Headers

### Verify Headers

```bash
curl -I https://app.capveri.com
```

Expected headers (set by backend):
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### HSTS Preload (Optional)

For maximum security, submit to HSTS preload list:
1. Verify headers are correct
2. Submit at [hstspreload.org](https://hstspreload.org)

## 10. Monitoring DNS

### Set Up Alerts

Use DNS monitoring services:
- [DNSspy](https://dnsspy.io) - Free tier
- [Pingdom](https://www.pingdom.com) - DNS monitoring

### Regular Checks

Verify monthly:
- [ ] SSL certificates valid
- [ ] DNS records unchanged
- [ ] CORS working
- [ ] OAuth redirects working

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| SSL error | DNS not propagated | Wait, check with whatsmydns |
| CORS error | Wrong FRONTEND_URL | Update env var, redeploy |
| OAuth redirect fails | Wrong callback URL | Update in provider + Supabase |
| Stripe webhook 400 | Wrong secret | Get new secret, update env |

### Debug DNS

```bash
# Check A record
dig A app.capveri.com

# Check CNAME
dig CNAME app.capveri.com

# Check from specific DNS
dig @8.8.8.8 app.capveri.com
```

### SSL Debug

```bash
# Check certificate details
echo | openssl s_client -servername app.capveri.com -connect app.capveri.com:443 2>/dev/null | openssl x509 -noout -dates

# Check certificate chain
curl -vI https://app.capveri.com 2>&1 | grep -E "SSL|certificate"
```

## Summary Checklist

- [ ] Domain purchased and accessible
- [ ] Frontend Worker route (app.capveri.com → `capveri-app`)
- [ ] Backend Worker route (api.capveri.com → `capveri-api`)
- [ ] Email DNS records (SPF, DKIM, DMARC)
- [ ] SSL certificates provisioned
- [ ] HTTPS enforced on both
- [ ] CORS configured with correct domain
- [ ] OAuth redirect URLs updated
- [ ] Stripe webhook URL updated
- [ ] All propagation verified

## Next Steps

- [Security Checklist](../security/01-security-checklist.md)
- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
