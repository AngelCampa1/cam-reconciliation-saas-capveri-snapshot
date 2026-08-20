# Logging and Observability

Guide for understanding and using the logging system in CapVeri.

## Logging Configuration

### Log Format

**Development** (`LOG_FORMAT=text`):
```
2024-01-15 10:30:00.123 | INFO     | [abc123] app.services | Message here
```

**Production** (`LOG_FORMAT=json`):
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "logger": "app.services.ingestion",
  "message": "Document uploaded",
  "correlation_id": "abc123-def456",
  "extra": {"document_id": "xyz"}
}
```

### Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| `DEBUG` | Detailed debugging | Variable values, flow traces |
| `INFO` | Normal operations | Request completed, user login |
| `WARNING` | Unexpected but handled | Retry attempted, fallback used |
| `ERROR` | Operation failed | Database error, API failure |
| `CRITICAL` | System failure | Cannot start, data corruption |

### Environment Variables

```env
LOG_LEVEL=INFO        # Minimum level to log
LOG_FORMAT=json       # json or text
```

## Correlation IDs

### How It Works

Every request gets a unique correlation ID:

```
Request → Middleware adds X-Correlation-ID → All logs include it
```

### Using Correlation IDs

1. Find error in logs
2. Copy correlation ID
3. Search for all related log entries

```bash
# Search logs by correlation ID
grep "abc123-def456" /var/log/app.log
```

### In Railway

1. Go to **Deployments** > **Logs**
2. Search for correlation ID
3. View all related entries

## Structured Logging

### Log Fields

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp |
| `level` | Log level |
| `logger` | Module name |
| `message` | Human-readable message |
| `correlation_id` | Request tracking ID |
| `extra` | Additional context |

### Adding Context

```python
logger.info(
    "Document processed",
    extra={
        "document_id": doc.id,
        "pages": doc.page_count,
        "duration_ms": 1234
    }
)
```

## Viewing Logs

### Railway Dashboard

1. Go to your service
2. Click **Deployments**
3. Click **View Logs**
4. Use search to filter

### Railway CLI

```bash
railway logs
railway logs --follow
railway logs --filter "ERROR"
```

### Log Retention

Railway retains logs for:
- Free: 7 days
- Pro: 30 days
- Enterprise: Custom

## Log Aggregation (Future)

For advanced needs, consider:

### Datadog

```python
# Add to requirements
ddtrace

# In main.py
from ddtrace import tracer
tracer.configure(hostname="agent")
```

### Papertrail

Configure Railway log drain:
1. Get Papertrail URL
2. Railway Settings > Log Drain
3. Add URL

## What to Log

### Do Log

- Request start/end with duration
- User actions (login, create, delete)
- External API calls
- Errors with context
- Business events (snapshot finalized)

### Don't Log

- Passwords or secrets
- Full request/response bodies
- PII (full names, emails in DEBUG)
- Credit card numbers
- API keys

## Example Log Patterns

### Request Logging

```python
logger.info(
    "Request completed",
    extra={
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration
    }
)
```

### Error Logging

```python
logger.error(
    "Document upload failed",
    extra={
        "document_id": doc_id,
        "error_type": type(e).__name__,
        "error_message": str(e)
    },
    exc_info=True  # Include stack trace
)
```

### Business Event Logging

```python
logger.info(
    "Reconciliation finalized",
    extra={
        "snapshot_id": snapshot.id,
        "property_id": snapshot.property_id,
        "total_recovery": str(snapshot.total_recovery),
        "tenant_count": len(snapshot.tenant_shares)
    }
)
```

## Monitoring Dashboards

### Key Metrics to Track

| Metric | Query Pattern |
|--------|--------------|
| Error rate | Count of `level=ERROR` |
| Request latency | `duration_ms` histogram |
| Slow queries | `duration_ms > 1000` |
| Auth failures | `message contains "auth failed"` |

### Creating Alerts

In your log aggregation tool, set alerts for:

- Error rate > 1% of requests
- Any CRITICAL level log
- Response time > 5 seconds
- Database connection failures

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Logs not appearing | Check LOG_LEVEL setting |
| JSON parse errors | Verify LOG_FORMAT=json |
| Missing correlation ID | Check middleware order |
| Too verbose | Increase LOG_LEVEL to WARNING |

### Debug Logging

Temporarily enable debug:

```bash
# Railway
railway variables set LOG_LEVEL=DEBUG

# After debugging
railway variables set LOG_LEVEL=INFO
```

## Next Steps

- [Error Tracking](./02-error-tracking-setup.md)
- [Uptime Monitoring](./03-uptime-monitoring.md)
