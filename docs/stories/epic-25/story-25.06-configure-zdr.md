# Story 25.6: Configure Zero Data Retention with Anthropic

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: Contact Anthropic Sales
**Dependencies**: None
**Status**: `pending`
**Priority**: P1

---

## User Story

As a **commercial real estate landlord**, I want **guarantee that my financial data is never used to train AI models** so that **I can trust the platform with sensitive financial information**.

---

## Acceptance Criteria

- [ ] Anthropic Enterprise Agreement signed with ZDR clause
- [ ] ZDR configuration enabled in Anthropic API client
- [ ] Verification test confirms data is not retained
- [ ] Compliance documentation updated with ZDR status
- [ ] Privacy policy updated to reflect ZDR guarantee
- [ ] Sales/marketing materials highlight ZDR as competitive advantage

---

## Technical Specifications

### What is Zero Data Retention (ZDR)?

**Definition**: Anthropic's enterprise feature that guarantees:
1. Customer data is NOT used to train Claude models
2. Prompts and completions are NOT stored beyond 30 days (for abuse monitoring)
3. After 30 days, all data is permanently deleted
4. Customer maintains full IP rights to inputs/outputs

**Why it matters for CapVeri**:
- Lease documents contain confidential financial terms
- Tenant data may include PII (names, addresses, SSNs)
- Revenue recovery calculations are trade secrets
- GDPR/CCPA compliance requires data minimization

### Current State

From Story 24.12 audit of `backend/app/services/extraction/anthropic_client.py`:
```python
# Current implementation (lines 1-50)
import anthropic

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# ⚠️ NO ZDR CONFIGURATION PRESENT
# Default behavior: Data may be used for model training
```

**Risk**: Customer lease data could be included in future Claude training sets, violating confidentiality.

### How to Enable ZDR

**Step 1: Contact Anthropic Sales**

Email: enterprise@anthropic.com

Template:
```
Subject: Zero Data Retention (ZDR) Request for CapVeri

Hello Anthropic Sales Team,

We are building CapVeri, a SaaS platform for commercial real estate
financial operations. We use Claude 3.5 Sonnet for semantic extraction
of lease terms from PDF documents.

We need Zero Data Retention (ZDR) to ensure customer financial data
is never used to train Claude models. Our use case involves:
- Confidential lease agreements (NNN, Gross, Modified Gross)
- Tenant PII (names, addresses, business details)
- Proprietary financial calculations (CAM reconciliation)

Can you please provide:
1. Enterprise Agreement with ZDR clause
2. API configuration instructions
3. Compliance documentation (for SOC 2 audit)
4. Pricing for ZDR feature

Current usage:
- ~500 API calls/day (growing to 10,000/day at scale)
- Claude 3.5 Sonnet model
- Extraction tasks (not chat/conversational)

Please contact: [Your Name], [Your Email], [Your Phone]

Thank you,
[Your Company]
```

**Step 2: Sign Enterprise Agreement**

Anthropic will provide:
- Master Services Agreement (MSA)
- Data Processing Addendum (DPA) with ZDR clause
- Business Associate Agreement (BAA) if handling PHI

**Key clauses to verify**:
- "Customer Data will not be used to train or improve Anthropic's models"
- "Prompts and completions deleted after 30 days"
- "Customer retains all IP rights to inputs and outputs"

**Step 3: Update API Configuration**

Once ZDR is enabled on your account:

```python
# backend/app/services/extraction/anthropic_client.py
import anthropic

client = anthropic.Anthropic(
    api_key=settings.anthropic_api_key,
    # ZDR automatically enabled for enterprise accounts
    # No code changes required - enabled account-wide
)

# Verify ZDR is active (if API provides verification endpoint)
# Note: As of 2024, no public verification endpoint exists
# Trust is based on enterprise agreement
```

**Step 4: Document in Code**

Add comment to confirm ZDR status:

```python
# backend/app/services/extraction/anthropic_client.py

"""
Anthropic Claude API Client with Zero Data Retention (ZDR).

IMPORTANT: This application uses Anthropic's Enterprise tier with ZDR enabled.
Under our enterprise agreement:
- Customer lease data is NOT used to train Claude models
- Prompts/completions are deleted after 30 days
- Full IP rights retained by customer

ZDR Status: ✅ ENABLED (Enterprise Agreement signed 2024-XX-XX)
Account ID: [Your Account ID]
Contract: [Contract Reference Number]

For compliance documentation, see: docs/compliance/anthropic-zdr-agreement.pdf
"""

import anthropic
from app.core.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
```

---

## Implementation Plan

### Phase 1: Contact Anthropic (Week 1)

- [ ] Send initial email to enterprise@anthropic.com
- [ ] Provide use case details and volume estimates
- [ ] Request ZDR pricing and agreement templates
- [ ] Schedule call with account executive

### Phase 2: Negotiate Agreement (Weeks 2-3)

- [ ] Review Master Services Agreement
- [ ] Review Data Processing Addendum (DPA)
- [ ] Negotiate pricing (may be volume-based)
- [ ] Have legal counsel review ZDR clause
- [ ] Sign agreement

### Phase 3: Configure & Verify (Week 4)

- [ ] Anthropic enables ZDR on account (account-wide setting)
- [ ] Update API client code with ZDR documentation
- [ ] Test extraction pipeline still works
- [ ] Document ZDR status in compliance docs
- [ ] Update privacy policy and marketing materials

### Phase 4: Compliance Documentation (Week 4)

- [ ] Create `docs/compliance/anthropic-zdr-agreement.pdf` (signed contract)
- [ ] Update `docs/compliance/data-processing-inventory.md`
- [ ] Update privacy policy: "We use AI with Zero Data Retention"
- [ ] Update Terms of Service with ZDR guarantee
- [ ] Create customer-facing ZDR FAQ

---

## Test Cases

### Verification (Manual)

**Test 1: ZDR is enabled**
```
Contact: Anthropic support
Request: Confirmation that account [ID] has ZDR enabled
Expected: Email confirmation with ZDR status
```

**Test 2: Extraction still works**
```bash
cd backend
pytest tests/services/extraction/test_anthropic_client.py -v
# Expected: All tests pass (ZDR is transparent to API usage)
```

**Test 3: Data retention policy check**
```
Contact: Anthropic support
Request: Data retention policy for account [ID]
Expected: "30 days retention for abuse monitoring, then permanent deletion"
```

---

## Definition of Done

- [ ] Enterprise Agreement with ZDR signed
- [ ] Anthropic confirms ZDR enabled on account
- [ ] API client code documented with ZDR status
- [ ] Compliance documentation updated
- [ ] Privacy policy updated with ZDR guarantee
- [ ] Customer-facing ZDR FAQ created
- [ ] Sales materials highlight ZDR competitive advantage
- [ ] Extraction tests pass (no API functionality change)
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Files to Create/Modify

**Code changes**:
1. `backend/app/services/extraction/anthropic_client.py` - Add ZDR documentation comment

**Documentation**:
2. `docs/compliance/anthropic-zdr-agreement.pdf` - Signed enterprise agreement
3. `docs/compliance/data-processing-inventory.md` - Add ZDR status
4. `docs/legal/privacy-policy.md` - Add ZDR guarantee
5. `docs/sales/zdr-competitive-advantage.md` - Marketing materials

**Customer-facing**:
6. Update website FAQ with ZDR explanation
7. Update Terms of Service with ZDR clause

---

## Competitive Advantage

### Why ZDR Matters to Customers

**Problem**: Many AI tools train on customer data
- Jasper.ai: Trains on user inputs (until enterprise tier)
- OpenAI: Default training opt-in (must manually opt-out)
- Google Bard: Uses conversations for model improvement

**CapVeri's Guarantee**:
- ✅ Zero Data Retention from day one (enterprise tier)
- ✅ Financial data never used for AI training
- ✅ 30-day deletion guarantee
- ✅ Full IP rights retained by customer

**Marketing angle**:
> "Unlike other AI-powered platforms, CapVeri guarantees your financial
> data is never used to train AI models. Our Zero Data Retention agreement
> with Anthropic ensures your lease terms, tenant data, and calculations
> remain confidential—forever."

---

## Pricing Considerations

**Anthropic ZDR Pricing** (estimated, confirm with sales):
- Standard API: $15 per MTok (million tokens) - NO ZDR
- Enterprise API: $25 per MTok - WITH ZDR (+67% cost)
- Minimum commitment: Typically $1,000-5,000/month for enterprise

**CapVeri Volume Estimates**:
- Current: ~500 API calls/day × 2,000 tokens avg = 1M tokens/day = ~$25/day enterprise
- At scale: ~10,000 calls/day × 2,000 tokens = 20M tokens/day = ~$500/day enterprise

**Budget**: $750-$15,000/month (low to high volume)

**ROI justification**:
- Differentiation vs competitors (worth premium pricing)
- Required for SOC 2 Type II compliance
- Required for enterprise sales (Fortune 500 customers)
- Enables GDPR/CCPA compliance storytelling

---

## Important Notes

### Temporary Workaround (Before ZDR)

If ZDR is delayed, implement temporary mitigations:

```python
# backend/app/services/extraction/anthropic_client.py

def extract_with_anonymization(pdf_content: bytes) -> dict:
    """
    Extract lease data with PII anonymization (temporary until ZDR enabled).

    TEMPORARY: This function anonymizes tenant names, addresses, and
    financial amounts before sending to Claude. Remove after ZDR enabled.
    """
    # Replace tenant names with placeholders
    anonymized_text = re.sub(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', '[TENANT_NAME]', text)

    # Replace dollar amounts with ranges
    anonymized_text = re.sub(r'\$[\d,]+\.?\d*', '[AMOUNT]', anonymized_text)

    # Replace addresses
    anonymized_text = re.sub(r'\d+ [A-Z][a-z]+ (Street|Ave|Blvd)', '[ADDRESS]', anonymized_text)

    result = client.messages.create(...)

    # De-anonymize result (map back to original values)
    return result
```

**Disable workaround once ZDR enabled**:
```python
# After ZDR: Remove anonymization, send raw data
def extract_lease_data(pdf_content: bytes) -> dict:
    """Extract lease data (ZDR-enabled, no anonymization needed)."""
    result = client.messages.create(...)
    return result
```

---

## Resources

- [Anthropic Enterprise Page](https://www.anthropic.com/enterprise)
- [Anthropic Trust & Safety](https://www.anthropic.com/trust-safety)
- [GDPR Article 25: Data Protection by Design](https://gdpr-info.eu/art-25-gdpr/)
- [SOC 2 Third-Party Risk Management](https://www.aicpa.org/soc)
