# Runbook: Common Issues

Quick reference for troubleshooting common production issues.

## Authentication Issues

### JWT Expired

**Symptoms**: 401 errors, "token expired" message

**Solution**:
1. User should refresh the page (triggers token refresh)
2. If persists, clear browser storage and re-login
3. Check Supabase Auth settings for token expiration

### OAuth Callback Failure

**Symptoms**: Redirect loop, error after OAuth login

**Checklist**:
- [ ] Check redirect URL in Supabase Auth settings
- [ ] Verify OAuth provider callback URL
- [ ] Check browser console for CORS errors
- [ ] Verify `FRONTEND_URL` env var

**Fix**:
```
Supabase Dashboard > Authentication > URL Configuration
- Site URL: https://app.capveri.com
- Redirect URLs: https://app.capveri.com/auth/callback
```

### Rate Limited

**Symptoms**: 429 errors on login

**Solution**:
1. Wait 15 minutes for rate limit reset
2. Check if legitimate or attack
3. If attack, consider IP blocking

## Database Issues

### Connection Pool Exhausted

**Symptoms**: Timeout errors, "too many connections"

**Immediate**:
1. Check active connections in Supabase dashboard
2. Restart Railway service if needed

**Long-term**:
1. Enable connection pooling
2. Review connection usage in code
3. Consider Supabase upgrade

### RLS Blocking Legitimate Access

**Symptoms**: 404 for data that should exist

**Debug**:
```sql
-- Check if data exists
SELECT * FROM table_name WHERE id = 'uuid';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

**Fix**: Review and update RLS policy

### Migration Failed

**Symptoms**: Deployment fails on DB changes

**Solution**:
1. Check migration file syntax
2. Run locally first: `supabase db diff`
3. Check for constraint violations
4. If stuck, manually fix and mark as applied

## API Issues

### CORS Errors

**Symptoms**: Browser console shows CORS blocked

**Checklist**:
- [ ] `FRONTEND_URL` matches actual frontend domain
- [ ] No trailing slash in URL
- [ ] Backend redeployed after env change

**Fix**:
```bash
railway variables set FRONTEND_URL=https://app.capveri.com
# Redeploy
```

### 500 Internal Server Error

**Symptoms**: API returns 500

**Debug**:
1. Get correlation ID from response
2. Search Railway logs for correlation ID
3. Check stack trace

**Common causes**:
- Database connection failure
- Missing environment variable
- Null pointer / attribute error
- External service timeout

### Timeout Errors

**Symptoms**: 504 Gateway Timeout

**Causes and fixes**:
| Cause | Fix |
|-------|-----|
| Slow database query | Add index, optimize query |
| External API slow | Add timeout, retry logic |
| Large file processing | Use background job |

## External Service Issues

### document reader Failures

**Symptoms**: OCR fails, extraction errors

**Checklist**:
- [ ] Check AWS credentials valid
- [ ] Verify S3 bucket exists and accessible
- [ ] Check AWS region matches
- [ ] Review AWS CloudTrail for errors

**Test**:
```bash
curl https://api.capveri.com/api/v1/extraction/health
```

### Anthropic API Rate Limited

**Symptoms**: AI extraction fails with 429

**Solution**:
1. Check Anthropic dashboard for usage
2. Wait for rate limit reset
3. Consider request queuing
4. Contact Anthropic for limit increase

### Stripe Webhook Failures

**Symptoms**: Subscriptions not updating

**Debug**:
1. Check Stripe Dashboard > Webhooks > Events
2. View failed events and error messages
3. Verify webhook secret matches

**Common issues**:
- Wrong webhook secret
- Endpoint URL changed
- Request timeout

## Deployment Issues

### Build Fails

**Symptoms**: Railway deployment fails during build

**Checklist**:
- [ ] Check build logs for specific error
- [ ] Verify dependencies resolve
- [ ] Check Python/Node version compatibility

**Test locally**:
```bash
cd backend
pip install -e ".[dev]"
```

### Environment Variable Missing

**Symptoms**: KeyError or "not configured" errors

**Fix**:
1. Check Railway Variables tab
2. Add missing variable
3. Redeploy (variables applied on restart)

### Health Check Fails

**Symptoms**: Deployment marked unhealthy

**Debug**:
1. Check `/health` endpoint responds
2. Review startup logs
3. Check for crash loops

**Common causes**:
- Missing env var crashes on startup
- Database connection fails
- Port binding issue

## Quick Commands

### Check Service Health

```bash
# Backend
curl https://api.capveri.com/health

# Extraction services
curl https://api.capveri.com/api/v1/extraction/health
```

### Check Logs

```bash
# Railway CLI
railway logs --filter "ERROR"
railway logs --follow
```

### Restart Service

```bash
# Railway
railway service restart
```

### Rollback

1. Go to Railway > Deployments
2. Find last working deployment
3. Click "Redeploy"

## Escalation

### When to Escalate

- Service down > 15 minutes
- Data corruption suspected
- Security incident
- Cannot identify root cause

### Escalation Contacts

Document your team contacts:
- Primary on-call: [contact]
- Secondary: [contact]
- Supabase support: support@supabase.io
- Railway support: In-app chat

## Next Steps

- [Backup and Recovery](./02-database-backup-and-recovery.md)
- [Incident Response](./03-incident-response-playbook.md)
