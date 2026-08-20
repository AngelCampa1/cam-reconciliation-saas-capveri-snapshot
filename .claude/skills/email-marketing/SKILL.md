---
name: email-marketing
description: Draft email campaigns, sequences, and individual emails for CapVeri marketing. Use this whenever you need to write a cold outreach email, nurture sequence, onboarding flow, re-engagement campaign, product announcement, or follow-up email for CapVeri leads, trial users, or paying customers. Audience is landlords and property managers (controllers, CFOs, Yardi/MRI users at PMCs). Also useful for subject line optimization, A/B test variants, segmentation strategy, and compliance review.
---

# Email Marketing for CapVeri

You are drafting email content informed by AI-driven email marketing best practices for 2026. CapVeri's email strategy spans cold outreach (property controllers, CFOs, Yardi admins at PMCs), free-audit-to-paid nurture, post-conversion onboarding, and partner/channel development.

## Step 1: Identify the email type

| Type | Trigger | Goal |
|---|---|---|
| **Cold outreach** | Prospect hasn't heard of CapVeri | First touch — earn a reply or site visit |
| **Lead nurture** | Signed up but hasn't scanned | Move to first scan |
| **Free scan → paid** | Ran free scan, saw blurred report | Convert at the paywall |
| **Post-purchase onboarding** | Just bought | Ensure success, reduce churn |
| **Upsell / expansion** | Using Growth tier (1–10 buildings) | Upgrade to Portfolio tier or add buildings to subscription |
| **Re-engagement** | Inactive 30–90 days | Reactivate or clean list |
| **Referral ask** | Happy customer | Drive referral or partner channel |
| **Partner / white-label** | Broker / PM firm | B2B channel development |

Ask the user which type, or infer from their request.

## Step 2: Define the audience segment

CapVeri audiences need different messaging:

- **Property Controller ("Patricia")**: Operational pain, manual reconciliation, Q1 deadline pressure. Champion persona. Lead with "what if your reconciliation validated itself before Q1." She wants to look smart to her CFO.
- **CFO / Financial Controller ("Charles")**: ROI-focused, unforecastable CAM liability, skeptical of new software. Economic buyer. Lead with found-revenue report — a specific dollar amount in errors — before any ask. Loss aversion: "This error would have triggered a tenant audit demand."
- **Director of Real Estate / Lease Admin (multi-building)**: Portfolio accuracy, reconciliation efficiency across many buildings, Q1 crunch across 20–200 locations.
- **IT Director / Yardi Admin**: Detractor. Anti-integration message: "CSV exports, not APIs. No credentials. No firewall changes. No security review." Neutralize the blocker.
- **CPA / Partner (channel)**: Commission or referral framing. Positions CapVeri as a value-add for their PMC clients.

## Step 3: Write the email

### Subject line
- Mobile preview: ≤50 characters (41 characters optimal)
- Personalization token increases open rate (+26% average)
- Best-performing subject line types:
  - Curiosity gap: "The clause your landlord hopes you missed"
  - Direct benefit: "How [Company] recovered $47,000 in CAM overcharges"
  - Loss aversion: "Your Q1 reconciliation statements go out in 60 days. One error triggers a tenant audit demand."
  - Question: "Is your landlord double-charging the management fee?"
  - Ultra-low friction: "Quick question about your CAM statement"

**Avoid:** spam trigger words (free, guarantee, 100%), all-caps subject lines, misleading RE: prefixes

### Email body
- **Opening**: never start with "I", "My name is", or company name in the first sentence
- Lead with the recipient's problem, not your product
- **Length by type**: Cold = 150–200 words. Nurture = 200–350 words. Educational = up to 500 words.
- One topic per email. One CTA per email.
- Plain text outperforms HTML for cold outreach (higher deliverability)
- HTML with minimal design for product/transactional emails

### CTA
- One action only — don't give three choices
- Low-friction: "See your results" / "View the report" / "Start your free scan"
- Create urgency where legitimate: "Q1 reconciliation statements go out in [N] weeks — validate before they do" / "First audit is free — run it before Q1"

## Step 4: Sequences

For multi-email sequences, deliver each email labeled with:
- Email # and subject line
- Timing: "Send Day 1" / "Send Day 3 if no open" / etc.
- Goal of that specific email

### Free-scan-to-paid nurture (example structure)
- Day 0 (immediate): Scan complete — "Your results are ready" (blur hook, total savings visible, CTA to unlock)
- Day 1: Educational email — "Here's what the management fee error means for your bottom line"
- Day 3: Social proof — "[Tenant type] recovered $X using the same findings we found for you"
- Day 7: Urgency — "Q1 reconciliation window is closing. Validate before you send."
- Day 14: Re-engagement / last chance

### Cold outreach sequence (5-touch)
- Email 1: Ultra-short (<150 words), problem-focused, no pitch
- Email 2 (+3 days): Value drop — useful insight they didn't ask for
- Email 3 (+5 days): Case study or specific finding ("We found $28k in overcharges for a franchise operator like yours")
- Email 4 (+7 days): Direct ask — simple question, not a demo request
- Email 5 (+10 days): Break-up email ("Closing the loop")

## Step 5: Compliance check

Before finalizing any cold email, confirm:
- Physical mailing address in footer (CAN-SPAM)
- One-click unsubscribe link
- No deceptive subject lines
- For EU recipients: explicit consent/opt-in required (GDPR)
- No purchased lists for GDPR targets — only opted-in contacts

## Output format

- **Single email**: Subject line (2–3 variants) + body text, ready to paste
- **Sequence**: All emails labeled with timing, subject lines, and goal
- **A/B test**: Two subject line variants with rationale for which to test as champion/challenger

## CapVeri Email Angles That Convert

- **Q1 urgency**: "Your reconciliation statements go out in [N] weeks. Here's what happens when the math is wrong." (Tenant dispute = audit demand = months of back-and-forth.)
- **The specific error type**: Name the error — gross-up on fixed costs, circular management fee, wrong denominator — not "CAM errors" generically. Specificity builds credibility.
- **Found revenue framing**: "CapVeri found $47K in a 200K SF office building on the first audit. That's money the landlord was leaving uncollected — or overbilling without realizing it."
- **The Yardi gap**: "Yardi processes your AP invoices correctly. It cannot tell you if the lease math is wrong. These are two different problems."
- **Risk framing for CFOs**: "An incorrect reconciliation is a liability. When the tenant's auditor finds it, you're negotiating credits under pressure."
- **Anti-integration for IT**: "No API. No credentials. No security review. Just the CSV you're already exporting from Yardi every month."

## Copy Rules (Mandatory)

- **Run the humanizer skill on all output.** After drafting any content, invoke the `humanizer` skill to remove AI writing patterns before delivering the final version.
- **Em dashes are strictly prohibited.** Never use em dashes (—) in any output. Use commas, colons, parentheses, or restructure the sentence instead.

## References

For AI personalization architecture, deliverability infrastructure, send-time optimization, AI inbox filtering strategy, and advanced sequence types, read `references/tactics.md`.
