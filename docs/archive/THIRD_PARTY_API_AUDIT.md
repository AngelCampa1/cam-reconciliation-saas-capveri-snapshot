# Third-Party API Audit Report

**Date**: 2025-12-29
**Audited By**: Claude Code
**Purpose**: Verify user stories accurately reflect real-world third-party APIs

---

## Executive Summary

Reviewed all user stories with third-party dependencies against current API documentation. Found **4 critical issues** requiring story updates and **3 minor issues** for awareness.

### Stories Updated:
- Story 15.1: Anthropic Claude Client
- Story 21.1: Stripe Client Configuration
- Story 21.4: Subscription Lifecycle Endpoints
- Story 9.10: Social Login Buttons

---

## 1. Anthropic Claude API (Epic 15)

### Story 15.1: Configure Anthropic Client

#### Critical Issue: Zero Data Retention (ZDR) Misconception
**Original Spec**: Used `"anthropic-beta": "zdr-2024-10-22"` header
**Reality**: ZDR is **NOT** enabled via a header. It requires:
1. An enterprise agreement with Anthropic
2. A signed security addendum
3. Specially configured API keys from Anthropic

**Sources**:
- [Anthropic ZDR FAQ](https://privacy.claude.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to)

**Standard API Data Retention**:
- Currently: 30 days
- After September 2025: 7 days
- API data is NOT used for model training

#### Issue: Async/Sync Client Mismatch
**Original Spec**: Used `anthropic.Anthropic()` (sync) with `await`
**Reality**: Must use `AsyncAnthropic` for async methods

```python
# WRONG
self.client = anthropic.Anthropic(...)
await self.client.messages.create(...)  # ERROR: Can't await sync client

# CORRECT
from anthropic import AsyncAnthropic
self.async_client = AsyncAnthropic(...)
await self.async_client.messages.create(...)
```

**Sources**:
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)

**Action Taken**: Updated story 15.1 with correct implementation and documented ZDR requirements.

---

## 2. Stripe Billing API (Epic 21-22)

### Story 21.1: Configure Stripe Client

#### Issue: Outdated API Version
**Original Spec**: `stripe.api_version = "2023-10-16"`
**Current Version**: `"2024-12-18.acacia"` (as of Dec 2024)

**Note**: Stripe frequently releases new API versions with the naming pattern `YYYY-MM-DD.codename`. Check [Stripe Changelog](https://docs.stripe.com/changelog) for latest.

**Action Taken**: Updated story 21.1 to use `2024-12-18.acacia`.

### Story 21.4: Subscription Lifecycle Endpoints

#### Critical Issue: Wrong Cancellation Method
**Original Spec**: `stripe.Subscription.delete(subscription_id)`
**Correct Method**: `stripe.Subscription.cancel(subscription_id)`

**Important Distinction**:
- `Subscription.cancel()` - Cancels a customer's subscription
- `SubscriptionItem.delete()` - Removes an item from a subscription (different!)

There is **no** `Subscription.delete()` method in Stripe's API.

**Sources**:
- [Cancel a Subscription](https://docs.stripe.com/api/subscriptions/cancel)
- [Cancel Subscriptions Guide](https://docs.stripe.com/billing/subscriptions/cancel)

**Action Taken**: Updated story 21.4 to use `stripe.Subscription.cancel()`.

### Stories 21.3, 21.5, 21.6: Generally Correct
- Customer creation/retrieval methods are correct
- SetupIntent for payment methods is correct
- Webhook signature verification is correct
- Proration behavior options are correct

---

## 3. Supabase OAuth (Epic 9)

### Story 9.10: Social Login Buttons

#### Issue: OAuth Scopes Configuration
**Original Spec**:
```tsx
await supabase.auth.signInWithOAuth({
  provider,
  options: {
    scopes: 'openid email profile',  // WRONG
  },
})
```

**Correct Usage**:
```tsx
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    queryParams: {
      access_type: 'offline',  // Required for refresh_token
      prompt: 'consent',
    },
  },
})
```

**Notes**:
- Google scopes are configured in Supabase dashboard, not in code
- Use `queryParams` for Google-specific parameters like `access_type`
- Apple scopes are handled by Supabase configuration

**Sources**:
- [Supabase signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

**Action Taken**: Updated story 9.10 to use `queryParams` correctly.

### Stories 9.8, 9.9, 9.11: Generally Correct
- `signInWithOAuth` provider options are correct
- `linkIdentity` and `unlinkIdentity` methods are correct
- OAuth callback handling is correct
- **Note**: Manual linking must be enabled in Supabase dashboard settings

---

## 4. document reader (Epic 14)

### Stories 14.1-14.6: Mostly Correct

All document reader API usage is accurate:
- `start_document_analysis()` with S3 location
- `get_document_analysis()` with pagination via `NextToken`
- `FeatureTypes=['TABLES', 'FORMS']` is correct
- Job polling logic with status checking is correct

**Minor Enhancement Opportunity**:
- Consider adding `'LAYOUT'` to FeatureTypes for layout detection (newer feature)
- Layout block types: LAYOUT_TITLE, LAYOUT_HEADER, LAYOUT_FOOTER, etc.

**Sources**:
- [start_document_analysis - boto3](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/document_reader/client/start_document_analysis.html)
- [get_document_analysis - boto3](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/document_reader/client/get_document_analysis.html)

---

## Summary of Changes Made

| Story | Issue | Change Made |
|-------|-------|-------------|
| 15.1 | ZDR header incorrect | Documented ZDR requirements (enterprise agreement needed) |
| 15.1 | Async/sync mismatch | Updated to use `AsyncAnthropic` for async methods |
| 21.1 | Outdated API version | Updated to `2024-12-18.acacia` |
| 21.4 | Wrong cancel method | Changed `Subscription.delete()` to `Subscription.cancel()` |
| 9.10 | Wrong scopes param | Changed to use `queryParams` for Google OAuth |

---

## Recommendations

1. **Anthropic ZDR**: Before production, contact Anthropic Sales to establish an enterprise ZDR agreement if handling sensitive lease data.

2. **Stripe API Version**: Pin to a specific version and test before upgrading. Monitor [Stripe Changelog](https://docs.stripe.com/changelog).

3. **Supabase OAuth**: Enable "Manual Linking" in Supabase dashboard before using `linkIdentity`/`unlinkIdentity`.

4. **document reader**: Consider adding `'LAYOUT'` FeatureType for enhanced document structure detection.

---

## API Documentation References

- **Anthropic**: https://docs.anthropic.com/en/api
- **Stripe Python**: https://docs.stripe.com/api?lang=python
- **Supabase JS**: https://supabase.com/docs/reference/javascript
- **document reader (boto3)**: https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/document_reader.html
