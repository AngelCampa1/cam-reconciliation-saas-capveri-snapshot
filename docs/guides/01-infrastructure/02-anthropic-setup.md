# Anthropic Claude Setup Guide

This guide covers configuring the Anthropic Claude API for AI-powered lease extraction in CapVeri.

## Overview

CapVeri uses Claude to extract "Financial DNA" from lease documents:
- Pro-rata share percentages
- Base year information
- Cap types and rates
- Admin fee percentages
- Excluded expense pools

## Prerequisites

- Anthropic account at [console.anthropic.com](https://console.anthropic.com)
- Credit card for API billing
- document reader configured (for OCR text extraction)

## 1. Create API Key

### Via Anthropic Console

1. Navigate to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Go to **API Keys** in the sidebar
4. Click **Create Key**
5. Name your key: `capveri-production`
6. Copy the key immediately (shown only once): `sk-ant-api03-...`

### Security Best Practices

- Use separate keys for development and production
- Rotate keys every 90 days
- Never commit keys to version control
- Store in environment variables or secrets manager

## 2. Environment Variables

Add to your backend `.env` file:

```env
# Anthropic Claude Configuration
ANTHROPIC_API_KEY=sk-ant-api03-...your-key...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

### Available Models (Claude 4.5 Series)

| Model | Use Case | Cost (per 1M tokens) |
|-------|----------|---------------------|
| `claude-sonnet-4-5-20250929` | **Recommended** - Best balance of speed/quality | $3 input / $15 output |
| `claude-opus-4-5-20251101` | Complex analysis requiring maximum accuracy | $5 input / $25 output |
| `claude-haiku-4-5-20251001` | Fast, simple tasks (not recommended for financial data) | $1 input / $5 output |

**Recommendation**: Use `claude-sonnet-4-5-20250929` for lease extraction.

**Why Sonnet 4.5?**
- Same pricing as Claude 3.5 Sonnet ($3/$15 per million tokens)
- Improved structured extraction capabilities
- Better understanding of financial terminology
- 200K+ context window (more than sufficient for lease documents)
- Excellent performance with temperature=0.0 for deterministic financial data

### Legacy Models (Claude 3.x)

These models are still available but superseded by the 4.5 series:

| Model | Cost (per 1M tokens) | Status |
|-------|---------------------|--------|
| `claude-3-5-sonnet-20241022` | $3 input / $15 output | Legacy (use 4.5 instead) |
| `claude-3-opus-20240229` | $15 input / $75 output | Legacy |
| `claude-3-haiku-20240307` | $0.25 input / $1.25 output | Legacy |

## 3. Data Retention Policy

### Standard API

By default, the Anthropic API:
- **Retains data for 30 days** (7 days after September 2025)
- **Does NOT use data for model training**
- Stores prompts and responses for abuse monitoring

This is suitable for most commercial use cases.

### Zero Data Retention (ZDR)

For organizations requiring immediate data deletion:

> **ZDR requires an enterprise agreement** with Anthropic. It cannot be enabled via headers or API settings.

**To request ZDR:**
1. Contact [Anthropic Sales](https://www.anthropic.com/contact-sales)
2. Sign enterprise agreement
3. Sign security addendum
4. Receive ZDR-enabled API keys

**When to consider ZDR:**
- HIPAA compliance required
- Highly sensitive financial data
- Regulatory requirements for immediate data deletion

For CapVeri, standard API retention is typically sufficient as:
- Lease data is not PHI/HIPAA regulated
- Data is retained only 30 days
- Data is not used for training

## 4. Rate Limits and Quotas

### Default Rate Limits (Tier 1)

| Limit | Value |
|-------|-------|
| Requests per minute | 60 |
| Tokens per minute | 40,000 |
| Tokens per day | 1,000,000 |

### Increasing Limits

As you use the API more, Anthropic automatically increases your tier:

| Tier | RPM | TPM | TPD |
|------|-----|-----|-----|
| Tier 1 (new) | 60 | 40K | 1M |
| Tier 2 | 1,000 | 80K | 5M |
| Tier 3 | 2,000 | 160K | 10M |
| Tier 4 | 4,000 | 400K | 50M |

Contact Anthropic for enterprise limits.

## 5. Application Configuration

### Client Configuration

The Anthropic client (`backend/app/services/extraction/anthropic_client.py`) is configured with:

| Setting | Value | Description |
|---------|-------|-------------|
| Temperature | 0.0 | Deterministic output (critical for financial data) |
| Max tokens | 4096 | Maximum response length |
| Retry attempts | 3 | Automatic retry on transient errors |
| Backoff | 1-30s exponential | Wait between retries |

### Retryable Errors

These errors trigger automatic retry:
- `RateLimitError` - Quota exceeded, retry after backoff
- `APITimeoutError` - Request timed out
- `APIConnectionError` - Network connectivity issue

### Token Usage Tracking

The client returns token usage for cost monitoring:

```python
response_text, tokens_used = await client.extract(
    prompt="Extract lease terms",
    document_text=ocr_text
)
print(f"Used {tokens_used} tokens")  # e.g., "Used 1247 tokens"
```

## 6. Cost Estimation

### Per-Lease Extraction Cost

Typical lease extraction:
- Input: ~5,000 tokens (OCR text + prompt)
- Output: ~500 tokens (extracted JSON)

**Cost per lease**: ~$0.02-0.03 with Claude Sonnet 4.5

**Calculation**:
- Input: 5,000 tokens × $3 / 1M = $0.015
- Output: 500 tokens × $15 / 1M = $0.0075
- **Total: ~$0.0225 per lease**

### Monthly Cost Examples

| Leases/Month | Est. Cost |
|--------------|-----------|
| 100 | $2-3 |
| 500 | $10-15 |
| 1,000 | $20-30 |
| 5,000 | $100-150 |

### Monitoring Costs

1. View usage in [Anthropic Console](https://console.anthropic.com) > **Usage**
2. Set up billing alerts in **Settings** > **Billing**
3. Monitor token usage in application logs

### Cost Optimization with Prompt Caching (Optional)

For high-volume lease extraction, consider enabling **Prompt Caching**:

**How it works:**
- Cache the static extraction prompt (reused across all leases)
- First request: Pay ~1.25× to write to cache
- Subsequent requests: Pay ~0.1× to read from cache (90% discount)

**Potential savings:**
- Without caching: $0.0225 per lease
- With caching (after first request): ~$0.010 per lease
- **~55% cost reduction for repeated extractions**

**Implementation:**
```python
# Mark cacheable content with cache_control parameter
response = await client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    system=[
        {
            "type": "text",
            "text": LEASE_EXTRACTION_PROMPT,
            "cache_control": {"type": "ephemeral"}  # Cache this prompt
        }
    ],
    messages=[{"role": "user", "content": document_text}]
)
```

See [Anthropic Prompt Caching Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) for details.

## 7. Testing Configuration

### Verify API Key

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

### Test via Application

The extraction health endpoint checks Anthropic connectivity:

```bash
curl http://localhost:8000/api/v1/extraction/health
```

Expected response:
```json
{
    "anthropic": {
        "healthy": true,
        "model": "claude-sonnet-4-5-20250929",
        "message": "Anthropic API is reachable"
    }
}
```

## 8. Best Practices

### Prompt Engineering

For financial data extraction, always:

1. **Use temperature 0.0** - Ensures deterministic, reproducible results
2. **Request structured output** - Ask for JSON format
3. **Include validation instructions** - "If not found, return null"
4. **Provide context** - Explain what lease terms mean

### Error Handling

```python
from anthropic import APIError, AuthenticationError

try:
    response = await client.extract(prompt, text)
except AuthenticationError:
    # Invalid API key
    logger.error("Invalid Anthropic API key")
except APIError as e:
    # Other API errors
    logger.error(f"Anthropic API error: {e}")
```

### Logging

Enable debug logging to see API requests:

```env
LOG_LEVEL=DEBUG
```

## 9. Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `AuthenticationError` | Invalid API key | Check `ANTHROPIC_API_KEY` |
| `RateLimitError` | Quota exceeded | Wait for rate limit reset |
| `APIConnectionError` | Network issue | Check internet connectivity |
| `InvalidRequestError` | Bad parameters | Check model name, max_tokens |

### Debug Checklist

1. Verify API key is set: `echo $ANTHROPIC_API_KEY`
2. Verify model exists: Check [Anthropic docs](https://docs.anthropic.com/claude/docs/models-overview)
3. Check rate limits: View [console.anthropic.com](https://console.anthropic.com) > Usage
4. Test with curl: Use the test command above

## 10. Security Considerations

1. **API Key Security**
   - Store in environment variables, not code
   - Use secrets manager in production (Railway/Render env vars)
   - Rotate keys every 90 days

2. **Data Handling**
   - Standard API has 30-day retention
   - Consider ZDR for highly sensitive data
   - Never log full document text at INFO level

3. **Access Control**
   - Limit who can access API keys
   - Audit API usage via Anthropic console

## Related Documentation

- [AWS Setup](./01-aws-setup.md) - Configure OCR (required before extraction)
- [Lease AI Extraction Setup](../lease-ai-extraction-setup.md) - Existing detailed guide
- [Environment Variables Reference](../02-deployment/05-environment-variables-reference.md) - All config options

## Next Steps

- [Stripe Setup](./03-stripe-setup.md) - Configure billing
- [Resend Setup](./04-resend-setup.md) - Configure email notifications
