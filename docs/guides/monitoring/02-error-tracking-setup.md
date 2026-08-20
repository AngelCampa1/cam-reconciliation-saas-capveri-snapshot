# Error Tracking Setup

Guide for setting up error tracking in CapVeri.

## Options for Small Scale

### 1. Railway Logs (Included)

**Cost**: Free (included with Railway)

**Pros**:
- No setup required
- Built into Railway dashboard
- Searchable

**Cons**:
- Basic search
- Limited retention
- No alerting

### 2. Sentry (Recommended)

**Cost**: Free tier (5,000 events/month)

**Pros**:
- Detailed error context
- Stack traces
- Release tracking
- Alerting

**Setup**:
```bash
pip install sentry-sdk
```

```python
# backend/app/main.py
import sentry_sdk

sentry_sdk.init(
    dsn="https://xxx@o123.ingest.sentry.io/456",
    environment=settings.environment,
    traces_sample_rate=0.1,
)
```

### 3. LogSnag (Simple Alerting)

**Cost**: Free tier available

**Use for**: Simple event tracking and alerts

## Backend Error Handling

### FastAPI Exception Handler

```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception: {exc}",
        extra={
            "path": request.url.path,
            "method": request.method,
        },
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )
```

### Custom Exceptions

```python
class CapVeriError(Exception):
    """Base exception with error code."""
    def __init__(self, message: str, code: str):
        self.message = message
        self.code = code

@app.exception_handler(CapVeriError)
async def capveri_error_handler(request: Request, exc: CapVeriError):
    logger.warning(f"Business error: {exc.code} - {exc.message}")
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message, "code": exc.code}
    )
```

## Frontend Error Handling

### Error Boundary

```tsx
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React error:', error, errorInfo);
    // Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

### API Error Handling

```tsx
// In TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onError: (error) => {
        console.error('Query error:', error);
        // Track error
      }
    },
    mutations: {
      onError: (error) => {
        console.error('Mutation error:', error);
        // Track error
      }
    }
  }
});
```

## Error Classification

### Severity Levels

| Level | Description | Response |
|-------|-------------|----------|
| Critical | System down | Page immediately |
| High | Feature broken | Alert within 1 hour |
| Medium | Degraded experience | Review daily |
| Low | Minor issue | Review weekly |

### Error Categories

| Category | Examples |
|----------|----------|
| Authentication | Login failed, token expired |
| Authorization | Permission denied, RLS block |
| Validation | Invalid input, schema error |
| External | AWS timeout, Stripe failure |
| Database | Connection error, constraint violation |

## Alert Configuration

### Recommended Alerts

| Condition | Action |
|-----------|--------|
| Any CRITICAL log | Email + Slack immediately |
| Error rate > 5% | Email within 15 min |
| 500 errors > 10/min | Email immediately |
| Database error | Email immediately |
| External service down | Email within 5 min |

### Setting Up Alerts

**Sentry**:
1. Go to Project > Alerts
2. Create alert rule
3. Configure conditions and actions

**Railway** (via webhook):
1. Deploy status webhooks
2. Log to Slack/Discord

## Investigation Workflow

### When Error Occurs

1. **Check alert** - Note time and error type
2. **Find correlation ID** - From error context
3. **Search logs** - Find all related entries
4. **Identify root cause** - Check stack trace
5. **Fix and deploy** - Or hotfix if critical
6. **Verify fix** - Monitor for recurrence

### Post-Mortem Template

```markdown
## Incident: [Title]
**Date**: 2024-01-15
**Duration**: 2 hours
**Severity**: High

### Summary
Brief description of what happened.

### Timeline
- 10:00 - Error started
- 10:15 - Alert triggered
- 10:30 - Root cause identified
- 11:00 - Fix deployed

### Root Cause
What caused the issue.

### Resolution
How it was fixed.

### Prevention
What will prevent recurrence.
```

## Monitoring Checklist

- [ ] Error logging configured
- [ ] Exception handlers in place
- [ ] Error tracking service connected
- [ ] Alerts configured for critical errors
- [ ] Frontend error boundary added
- [ ] API error handling standardized
- [ ] Investigation workflow documented

## Next Steps

- [Uptime Monitoring](./03-uptime-monitoring.md)
- [Database Monitoring](./04-database-monitoring.md)
