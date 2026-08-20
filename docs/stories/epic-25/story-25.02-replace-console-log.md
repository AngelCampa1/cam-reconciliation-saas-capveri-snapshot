# Story 25.2: Replace console.log with Proper Logger

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 2 hours
**Dependencies**: None
**Status**: `pending`
**Priority**: P2

---

## User Story

As a **platform developer**, I want **all console.log statements replaced with a structured logger** so that **we can properly track application behavior in production**.

---

## Acceptance Criteria

- [ ] All 62 console.log statements replaced with proper logger
- [ ] No console.log statements remain in production code (excluding comments)
- [ ] Logger configuration supports different log levels (debug, info, warn, error)
- [ ] Sensitive data (passwords, tokens, API keys) never logged
- [ ] Logger format includes timestamp, level, context/module
- [ ] Development mode shows verbose logs, production shows warnings/errors only
- [ ] All existing functionality works unchanged after replacement

---

## Technical Specifications

### Current State

From Story 24.12 audit, 62 console.log statements found in production code:
```bash
grep -r "console.log" frontend/src/ --exclude-dir=node_modules | wc -l
# Result: 62 instances
```

**Common patterns to replace:**
```typescript
// BEFORE (console.log)
console.log('User logged in:', user)
console.log('API request failed:', error)
console.log('[DEBUG] Reconciliation data:', data)

// AFTER (structured logger)
logger.info('User logged in', { userId: user.id })
logger.error('API request failed', { error: error.message })
logger.debug('Reconciliation data loaded', { rowCount: data.length })
```

### Implementation Approach

**Option 1: Use existing logger library** (Recommended)
- **Frontend**: Use `loglevel` or `winston-browser`
- **Backend**: Already using Python's `logging` module

**Option 2: Custom lightweight logger**
```typescript
// frontend/src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private level: LogLevel = import.meta.env.PROD ? 'warn' : 'debug';

  debug(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog('debug')) {
      console.debug(`[${new Date().toISOString()}] DEBUG:`, message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog('info')) {
      console.info(`[${new Date().toISOString()}] INFO:`, message, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog('warn')) {
      console.warn(`[${new Date().toISOString()}] WARN:`, message, context);
    }
  }

  error(message: string, context?: Record<string, unknown>) {
    if (this.shouldLog('error')) {
      console.error(`[${new Date().toISOString()}] ERROR:`, message, context);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}

export const logger = new Logger();
```

### Files to Modify

**High-priority files** (likely to have sensitive data):
1. `frontend/src/contexts/AuthContext.tsx` - Login/auth flows
2. `frontend/src/api/client.ts` - API request/response logging
3. `frontend/src/features/verification/` - Extraction results
4. `frontend/src/components/billing/` - Payment information

**Search and replace pattern:**
```bash
# Find all console.log instances
grep -rn "console\.log" frontend/src/ --exclude-dir=node_modules

# Replace pattern (manual review required for context)
console.log(...) → logger.info(...) or logger.debug(...)
```

### Security Checklist

**Never log these values:**
- `password`, `hashed_password`, `token`, `api_key`
- `stripe_secret_key`, `stripe_publishable_key`
- `credit_card_number`, `cvv`, `ssn`
- Full request/response bodies (may contain PII)

**Safe to log:**
- User IDs (UUIDs)
- Request URLs (without query params containing tokens)
- Counts, lengths, status codes
- Non-sensitive field names

---

## Test Cases

### Unit Tests

Create `frontend/src/lib/logger.test.ts`:
```typescript
describe('Logger', () => {
  it('logs info messages in development mode', () => {
    const spy = vi.spyOn(console, 'info');
    logger.info('Test message', { key: 'value' });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('INFO:'),
      'Test message',
      { key: 'value' }
    );
  });

  it('does not log debug messages in production mode', () => {
    // Set production mode
    vi.stubEnv('PROD', true);
    const spy = vi.spyOn(console, 'debug');
    logger.debug('Debug message');
    expect(spy).not.toHaveBeenCalled();
  });

  it('never logs sensitive data', () => {
    const spy = vi.spyOn(console, 'info');
    const sensitiveData = { password: 'secret123' };

    // Should throw or sanitize
    expect(() => logger.info('User data', sensitiveData)).toThrow();
  });
});
```

### Manual Verification

After replacement, verify:
1. Open browser console in dev mode → see structured logs with timestamps
2. Build production bundle → no debug logs in console
3. Check Network tab → no sensitive data in logged requests
4. Trigger error → error logs appear in console with proper context

---

## Definition of Done

- [ ] Logger utility created in `frontend/src/lib/logger.ts`
- [ ] All 62 console.log instances replaced
- [ ] Unit tests for logger utility pass
- [ ] No sensitive data logged (manual audit)
- [ ] Development mode shows verbose logs
- [ ] Production mode only shows warnings/errors
- [ ] No console.log statements in `grep -r "console.log" frontend/src/`
- [ ] All existing tests still pass
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Implementation Notes

**Recommended approach:**
1. Create logger utility first (30 min)
2. Write logger tests (15 min)
3. Replace console.log in batches (60 min):
   - Auth/API files (high priority)
   - Feature components
   - UI components
   - Utility files
4. Manual audit for sensitive data (15 min)
5. Test in dev and production builds (10 min)

**Future enhancement** (out of scope):
- Send errors to Sentry/monitoring service
- Add log filtering by module/component
- Implement structured JSON logging for production
