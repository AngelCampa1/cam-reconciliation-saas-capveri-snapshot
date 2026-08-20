# Security Headers and CORS

Configuration and verification of HTTP security headers and CORS in CapVeri.

## Current Security Headers

The backend sets these headers on all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |

## Verify Headers

### Using curl

```bash
curl -I https://api.capveri.com/health
```

Expected output:
```
HTTP/2 200
x-content-type-options: nosniff
x-frame-options: DENY
x-xss-protection: 1; mode=block
strict-transport-security: max-age=31536000; includeSubDomains
```

### Using Browser

1. Open DevTools (F12)
2. Go to Network tab
3. Make any request
4. Click request > Headers > Response Headers

## CORS Configuration

### How CORS Works

```
Browser (app.capveri.com) → Preflight OPTIONS → API (api.capveri.com)
                         ← Access-Control-Allow-Origin ←
Browser → Actual Request → API
```

### Current CORS Settings

**Development Mode:**
```python
# Allows localhost origins
cors_origins = [
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
]
```

**Production Mode:**
```python
cors_origins = [
    "https://app.capveri.com",
    "https://www.capveri.com"
]
```

### Environment Variable

Set `FRONTEND_URL` to your production frontend:

```env
FRONTEND_URL=https://app.capveri.com
```

## Verify CORS

### Allowed Origin

```bash
curl -X OPTIONS https://api.capveri.com/api/v1/properties \
  -H "Origin: https://app.capveri.com" \
  -H "Access-Control-Request-Method: GET" \
  -I
```

Expected:
```
Access-Control-Allow-Origin: https://app.capveri.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: authorization, content-type
```

### Blocked Origin

```bash
curl -X OPTIONS https://api.capveri.com/api/v1/properties \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: GET" \
  -I
```

Expected:
- No `Access-Control-Allow-Origin` header
- Browser will block the request

## Content Security Policy (Future)

Currently not implemented. Recommended CSP for future:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.capveri.com https://*.supabase.co;
  frame-ancestors 'none';
```

### Adding CSP

In frontend (Vercel), add `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; ..."
        }
      ]
    }
  ]
}
```

## HSTS Preload

### Current Status

HSTS is enabled with:
- `max-age=31536000` (1 year)
- `includeSubDomains`

### Enable Preload

To add to browser preload list:

1. Add `preload` directive:
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```

2. Submit at [hstspreload.org](https://hstspreload.org)

3. Wait for browser inclusion (several months)

## Common Issues

### CORS Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "No 'Access-Control-Allow-Origin'" | Origin not whitelisted | Add to `FRONTEND_URL` |
| "Method not allowed" | Method not in allowed list | Check CORS middleware |
| "Credentials not supported" | Missing credentials config | Add credentials handling |

### Debug CORS

1. Check browser console for specific error
2. Verify origin in request matches allowed
3. Check preflight response headers
4. Verify `FRONTEND_URL` env var

### Missing Headers

If headers are missing:

1. Verify middleware is registered in `main.py`
2. Check middleware order (security should be early)
3. Verify no other middleware overwriting

## Testing Checklist

- [ ] Security headers present on all endpoints
- [ ] HSTS enabled with long max-age
- [ ] X-Frame-Options blocks embedding
- [ ] CORS allows production frontend
- [ ] CORS blocks unknown origins
- [ ] Preflight requests handled correctly
- [ ] Credentials properly supported

## Implementation Reference

Headers are set in `backend/app/main.py`:

```python
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    return response
```

CORS is configured via FastAPI's CORSMiddleware.

## Next Steps

- [Pre-Launch Checklist](../go-live/00-pre-launch-checklist.md)
- [Logging Setup](../monitoring/01-logging-and-observability.md)
