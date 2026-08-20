# Uptime Monitoring

Guide for monitoring service availability in CapVeri.

## Health Check Endpoints

### Backend Health

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Extraction Health

**Endpoint**: `GET /api/v1/extraction/health`

**Response**:
```json
{
  "s3": {"healthy": true, "bucket": "capveri-documents"},
  "document_reader": {"healthy": true, "region": "us-east-1"},
  "anthropic": {"healthy": true, "model": "claude-sonnet-4-5-20250929"}
}
```

## Free Monitoring Tools

### 1. UptimeRobot (Recommended)

**Cost**: Free (50 monitors)

**Setup**:
1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add new monitor
3. Configure:
   - **Monitor Type**: HTTP(s)
   - **URL**: `https://api.capveri.com/health`
   - **Interval**: 5 minutes

**Features**:
- Email/SMS alerts
- Status page
- Response time tracking

### 2. Better Uptime

**Cost**: Free (10 monitors)

**Setup**:
1. Sign up at [betteruptime.com](https://betteruptime.com)
2. Add new monitor
3. Configure URL and check interval

**Features**:
- Beautiful status page
- Incident management
- On-call scheduling

### 3. Pingdom

**Cost**: Free tier available

**Features**:
- Real user monitoring
- Transaction monitoring
- Global check locations

## What to Monitor

### Essential Monitors

| Service | URL | Interval |
|---------|-----|----------|
| Backend API | `https://api.capveri.com/health` | 5 min |
| Frontend | `https://app.capveri.com` | 5 min |
| Extraction | `https://api.capveri.com/api/v1/extraction/health` | 15 min |

### Expected Responses

| Endpoint | Status | Timeout |
|----------|--------|---------|
| `/health` | 200 | 5 sec |
| Frontend | 200 | 10 sec |
| Extraction health | 200 | 30 sec |

## Alert Configuration

### Alert Channels

| Channel | Use For |
|---------|---------|
| Email | All alerts (primary) |
| Slack | Team notification |
| SMS | Critical only |
| PagerDuty | On-call rotation |

### Alert Rules

| Condition | Alert Type | Delay |
|-----------|------------|-------|
| Site down | Email + Slack | Immediate |
| Down > 5 min | SMS | After confirmation |
| Slow response (>5s) | Email | After 2 occurrences |

## Status Page

### Public Status Page

Consider a public status page:
1. UptimeRobot: Built-in status page
2. Better Uptime: Beautiful status page
3. Statuspage.io: Full-featured (paid)

**What to include**:
- API status
- Frontend status
- Scheduled maintenance
- Incident history

### Example URL

```
https://status.capveri.com
```

## Response Time Monitoring

### Thresholds

| Response Time | Status |
|---------------|--------|
| < 500ms | Excellent |
| 500ms - 1s | Good |
| 1s - 2s | Acceptable |
| > 2s | Needs attention |
| > 5s | Critical |

### Slow Endpoint Investigation

1. Check logs for slow queries
2. Review database performance
3. Check external service latency
4. Consider caching

## Incident Response

### When Alert Fires

1. **Acknowledge** - Confirm you're investigating
2. **Verify** - Is it really down?
3. **Diagnose** - Check logs, recent deploys
4. **Fix** - Rollback or hotfix
5. **Communicate** - Update status page
6. **Post-mortem** - Document and prevent

### Quick Checks

```bash
# Is it DNS?
dig api.capveri.com

# Is it SSL?
curl -vI https://api.capveri.com

# Is it the server?
curl https://api.capveri.com/health

# Check Railway status
# https://status.railway.app
```

## Maintenance Windows

### Scheduled Maintenance

1. Update status page 24h before
2. Notify users via email if needed
3. During maintenance:
   - Update status page
   - Disable alerts temporarily
4. After maintenance:
   - Verify all services
   - Update status page
   - Re-enable alerts

### Maintenance Mode

For planned downtime:
```bash
# Railway can pause service
railway down

# Resume after maintenance
railway up
```

## Monitoring Checklist

- [ ] Backend health monitor configured
- [ ] Frontend monitor configured
- [ ] Alert channels set up
- [ ] Status page created
- [ ] Response time thresholds defined
- [ ] Incident response documented
- [ ] Team notified of monitoring setup

## Next Steps

- [Database Monitoring](./04-database-monitoring.md)
- [Incident Response Playbook](../operations/03-incident-response-playbook.md)
