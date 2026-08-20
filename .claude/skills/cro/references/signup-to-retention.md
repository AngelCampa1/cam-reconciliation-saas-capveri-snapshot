# Signup Flows, Onboarding, Paywalls, and Churn Prevention

Deep tactical reference for post-click conversion optimization. Read this when the task involves optimizing signup completion, user activation, upgrade flows, or reducing churn.

## Table of Contents
- [Signup Flow Optimization](#signup-flow-optimization)
- [Onboarding and Activation](#onboarding-and-activation)
- [Paywall and Upgrade Screen Design](#paywall-and-upgrade-screen-design)
- [Churn Prevention](#churn-prevention)
- [Involuntary Churn and Dunning](#involuntary-churn-and-dunning)
- [Health Scoring and Proactive Retention](#health-scoring-and-proactive-retention)

---

## Signup Flow Optimization

### Core principles
1. **Minimize required fields.** Every field reduces conversion. For each field: Do we need this before they can use the product? Can we collect it later? Can we infer it from other data?
2. **Show value before asking for commitment.** What can you show/give before requiring signup? Can they experience the product first?
3. **Reduce perceived effort.** Progress indicators, smart defaults, pre-fill when possible.
4. **Remove uncertainty.** "Takes 30 seconds," show what happens after signup, no hidden requirements.

### Field priority
- **Essential**: Email (or phone), Password
- **Often needed**: Name
- **Usually deferrable**: Company, Role, Team size, Phone, Address

### Social auth
- Place prominently (often higher conversion than email)
- B2C: Google, Apple, Facebook
- B2B: Google, Microsoft, SSO
- Clear visual separation from email signup
- Consider "Sign up with Google" as primary action

### Single-step vs. multi-step

**Single-step** works when: 3 or fewer fields, simple B2C, high-intent visitors (from ads, waitlist).

**Multi-step** works when: 4+ fields needed, complex B2B needing segmentation, different types of info required.

### Progressive commitment pattern
1. Email only (lowest barrier, gets them in)
2. Password + name (committed now, sunk cost active)
3. Customization questions (optional, framed as value-add: "Help us personalize your experience")

### Post-submit experience
- **Immediate product access > email confirmation gate.** If you must verify email, let them explore while awaiting verification.
- Clear confirmation with specific next step
- Magic link as alternative to password (reduces one field)
- Easy email resend + "check spam" reminder if verification required

### Signup flow patterns by product type

| Product Type | Recommended Flow |
|---|---|
| B2B SaaS trial | Email + Password (or Google auth) → Name + Company (optional) → Onboarding |
| B2C app | Google/Apple auth OR Email → Product experience → Profile later |
| Waitlist / early access | Email only → Role/use case (optional) → Confirmation |
| E-commerce | Guest checkout default → Account creation optional post-purchase |

---

## Onboarding and Activation

### The activation metric
The single most important thing to define: **what action correlates most strongly with retention?**

What do retained users do that churned users don't? What's the earliest indicator of future engagement?

| Product Type | Typical Activation Event |
|---|---|
| Project management | Create first project + add team member |
| Analytics | Install tracking + see first report |
| Design tool | Create first design + export/share |
| Marketplace | Complete first transaction |
| Audit tool (CapVeri) | Upload first document + see scan results |

### Core principles
1. **Time-to-value is everything.** Remove every step between signup and experiencing core value.
2. **One goal per session.** Focus first session on one successful outcome. Save advanced features for later.
3. **Do, don't show.** Interactive > tutorial. Doing the thing > learning about the thing.
4. **Progress creates motivation.** Show advancement. Celebrate completions. Make the path visible.

### Immediate post-signup (first 30 seconds)

| Approach | Best For | Risk |
|---|---|---|
| Product-first | Simple products, B2C, mobile | Blank slate overwhelm |
| Guided setup | Products needing personalization | Adds friction before value |
| Value-first (demo data) | Products where empty state is confusing | May not feel "real" |

Whatever the approach: clear single next action, no dead ends, progress indication if multi-step.

### Onboarding checklist pattern
When to use: multiple setup steps, several features to discover, self-serve B2B.

- 3-7 items (more is overwhelming)
- Ordered by value (most impactful first)
- Start with quick wins for early momentum
- Progress bar / completion percentage
- Celebration on completion (confetti, success message)
- Dismissable (don't trap users)

### Empty states
Empty states are onboarding opportunities, not dead ends.

Good empty state:
- Explains what this area is for
- Shows what it looks like with data (screenshot, illustration)
- Clear primary action to add first item
- Optional: pre-populate with example data

### Tooltips and guided tours
- Max 3-5 steps per tour (more causes fatigue)
- Dismissable at any time
- Don't repeat for returning users
- Reserve for complex UI or features that aren't self-evident

### Multi-channel onboarding (email + in-app)
Trigger-based emails reinforce in-app actions, don't duplicate them:

| Email | Trigger | Purpose |
|---|---|---|
| Welcome | Immediate post-signup | Set expectations, quick-start link |
| Incomplete setup | 24h inactive | Nudge to complete, offer help |
| Activation reminder | 72h, not activated | Surface value, address common blockers |
| Activation celebration | Activation achieved | Celebrate + suggest next step |
| Feature discovery | Days 3, 7, 14 | Introduce advanced features progressively |

### Handling stalled users
Detection: X days inactive, incomplete setup, login frequency dropping.

1. **Email sequence**: Reminder of value, address blockers, offer help
2. **In-app recovery**: "Welcome back" with pick-up-where-you-left-off
3. **Human touch**: For high-value accounts, personal outreach from CS or founder

### Key metrics

| Metric | What It Measures |
|---|---|
| Activation rate | % reaching activation event |
| Time to activation | Speed to first value |
| Onboarding completion | % completing setup steps |
| Day 1/7/30 retention | Return rate by timeframe |
| Step-level drop-off | Where users abandon in the funnel |

---

## Paywall and Upgrade Screen Design

### Core principles
1. **Value before ask.** User should have experienced real value first. Upgrade should feel like a natural next step.
2. **Show, don't just tell.** Demonstrate paid feature value. Preview what they're missing.
3. **Friction-free path.** Easy to upgrade when ready. Don't make them hunt for pricing.
4. **Respect the no.** Don't trap or pressure. Easy to continue free. Maintain trust for future conversion.

### Trigger points (when to show)

| Trigger | Context | Design |
|---|---|---|
| Feature gate | User clicks a paid-only feature | Explain why it's paid + preview + quick unlock + continue-without option |
| Usage limit | User hits a plan limit | Clear indication + what upgrading provides + don't block abruptly |
| Trial expiration | Trial ending | Early warnings (7, 3, 1 day) + summarize value received + clear "what happens" |
| Time-based | After X days of free use | Gentle reminder + highlight unused paid features + easy dismiss |

### When NOT to show
- During onboarding (too early, value not experienced yet)
- When user is in a focused flow (mid-task interruption)
- Repeatedly after dismissal (cool-down: days, not hours)

### Paywall screen components
1. **Headline**: "Unlock [Feature] to [Benefit]" (outcome-focused)
2. **Value demonstration**: Preview, before/after, "With Pro you could..."
3. **Feature comparison**: Key differences highlighted, current plan marked
4. **Pricing**: Clear, simple, annual vs. monthly with savings shown
5. **Social proof**: Customer quotes, "X teams upgraded this month"
6. **CTA**: Specific and value-oriented: "Start Getting [Benefit]"
7. **Escape hatch**: Visible "Not now" or "Continue with Free" (no dark patterns)

### Paywall patterns

**Feature lock**:
```
[Lock Icon]
This feature is available on Pro

[Feature preview/screenshot]

[Feature name] helps you [benefit]:
- [Capability 1]
- [Capability 2]

[Upgrade to Pro - $X/mo]
[Maybe Later]
```

**Usage limit**:
```
You've reached your free limit

[Progress bar at 100%]

Free: 3 audits | Pro: Unlimited

[Upgrade to Pro]  [Contact Support]
```

**Trial expiration**:
```
Your trial ends in 3 days

What you'll keep: [features on free plan]
What you'll lose: [paid features they've used]

What you've accomplished:
- Scanned X documents
- Found $Y in potential overcharges

[Continue with Pro]
[Remind me later]  [Downgrade to Free]
```

### Anti-patterns (never do these)
- Hiding the close button
- Confusing plan selection with dark patterns
- Guilt-trip copy ("Are you sure you want to miss out?")
- Asking before value is delivered
- Too frequent prompts (track annoyance signals)
- Blocking critical flows
- Complicated upgrade process

---

## Churn Prevention

Voluntary churn (customer chooses to cancel) = 50-70% of total churn. Involuntary churn (payment fails) = 30-50%. Both need different strategies.

### Cancel flow structure
Every cancel flow follows this sequence:

```
Trigger → Exit Survey → Dynamic Save Offer → Confirmation → Post-Cancel
```

### Exit survey design
Single question, single-select with optional free text. 5-8 reason options max.

| Reason | What It Tells You |
|---|---|
| Too expensive | Price sensitivity, may respond to discount or downgrade |
| Not using it enough | Low engagement, may respond to pause or onboarding help |
| Missing a feature | Product gap, show roadmap or workaround |
| Switching to competitor | Competitive pressure, understand what they offer |
| Technical issues / bugs | Product quality, escalate to support |
| Temporary / seasonal | Usage pattern, offer pause |
| Business closed / changed | Unavoidable, let go gracefully |

Frame as "Help us improve" not "Why are you leaving?"

### Dynamic save offers (match offer to reason)

| Cancel Reason | Primary Offer | Fallback |
|---|---|---|
| Too expensive | 20-30% off for 2-3 months | Downgrade to lower plan |
| Not using it enough | Pause 1-3 months | Free onboarding session |
| Missing feature | Roadmap preview + timeline | Workaround guide |
| Switching to competitor | Competitive comparison + discount | Feedback session |
| Technical issues | Escalate to support immediately | Credit + priority fix |
| Temporary / seasonal | Pause subscription | Downgrade temporarily |
| Business closed | Skip offer (respect the situation) | Graceful exit |

### Save offer guidelines
- **Discount**: 20-30% off for 2-3 months is the sweet spot. Avoid 50%+ (trains customers to cancel for deals). Show dollar amount saved, not just percentage.
- **Pause**: 1-3 month maximum (longer rarely reactivates). 60-80% of pausers return. Auto-reactivation with advance notice email.
- **Downgrade**: Position as "right-size your plan" not "downgrade." Show what they keep vs. lose.
- **Personal outreach**: For top 10-20% by MRR. Route to CS or founder email.

### Cancel flow UI principles
- One primary offer + one fallback (not a wall of options)
- "Continue cancelling" option always visible (no dark patterns, FTC mandates easy cancellation)
- Show specific dollar savings
- Use customer's name and account data
- Mobile-friendly (many cancellations happen on mobile)

### Post-cancel
- Clear end-of-billing-period messaging
- Easy reactivation path
- Trigger win-back email sequence
- Some churned users will return if the door stays open

---

## Involuntary Churn and Dunning

Failed payments = 30-50% of all churn and the most recoverable type.

### The dunning stack
```
Pre-dunning → Smart retry → Dunning emails → Grace period → Hard cancel
```

### Pre-dunning (prevent failures)
- Card expiry alerts: 30, 15, 7 days before expiry
- Backup payment method prompt at signup
- Card updater services (Visa/Mastercard auto-update reduces hard declines 30-50%)
- Pre-billing notification 3-5 days before charge for annual plans

### Smart retry logic

| Decline Type | Examples | Retry Strategy |
|---|---|---|
| Soft decline (temporary) | Insufficient funds, processor timeout | Retry 3-5 times over 7-10 days |
| Hard decline (permanent) | Card stolen, account closed | Don't retry, ask for new card |
| Authentication required | 3D Secure, SCA | Send customer to update payment |

Retry timing: Day 1, Day 3, Day 5, Day 7. After 4 retries: hard cancel with reactivation path.

**Smart retry tip**: Retry on the day of month the payment originally succeeded. Stripe Smart Retries handles this automatically.

### Dunning email sequence

| Email | Timing | Tone | Content |
|---|---|---|---|
| 1 | Day 0 | Friendly alert | "Your payment didn't go through. Update your card." |
| 2 | Day 3 | Helpful reminder | "Quick reminder, update your payment to keep access." |
| 3 | Day 7 | Urgency | "Your account will be paused in 3 days. Update now." |
| 4 | Day 10 | Final warning | "Last chance to keep your account active." |

**Dunning email principles**:
- Direct link to payment update page (no login required if possible)
- Show what they'll lose (their data, their team's access)
- "Your payment didn't go through" not "you failed to pay" (no blame)
- Include support contact
- Plain text outperforms designed emails for dunning

### Recovery benchmarks

| Metric | Poor | Average | Good |
|---|---|---|---|
| Soft decline recovery | <40% | 50-60% | 70%+ |
| Hard decline recovery | <10% | 20-30% | 40%+ |
| Overall payment recovery | <30% | 40-50% | 60%+ |

---

## Health Scoring and Proactive Retention

The best save happens before the customer ever clicks "Cancel."

### Risk signals

| Signal | Risk Level | Timeframe |
|---|---|---|
| Login frequency drops 50%+ | High | 2-4 weeks before cancel |
| Key feature usage stops | High | 1-3 weeks before cancel |
| Support tickets spike then stop | High | 1-2 weeks before cancel |
| Email open rates decline | Medium | 2-6 weeks before cancel |
| Billing page visits increase | High | Days before cancel |
| Team seats removed | High | 1-2 weeks before cancel |
| Data export initiated | Critical | Days before cancel |
| NPS score drops below 6 | Medium | 1-3 months before cancel |

### Simple health score model (0-100)

```
Health Score = (
  Login frequency   x 0.30 +
  Feature usage     x 0.25 +
  Support sentiment x 0.15 +
  Billing health    x 0.15 +
  Engagement score  x 0.15
)
```

| Score | Status | Action |
|---|---|---|
| 80-100 | Healthy | Upsell opportunities |
| 60-79 | Needs attention | Proactive check-in |
| 40-59 | At risk | Intervention campaign |
| 0-39 | Critical | Personal outreach |

### Proactive interventions

| Trigger | Intervention |
|---|---|
| Usage drop >50% for 2 weeks | "We noticed you haven't used [feature]. Need help?" |
| No login for 14 days | Re-engagement email with recent product updates |
| NPS detractor (0-6) | Personal follow-up within 24 hours |
| Support ticket unresolved >48h | Escalation + proactive status update |
| Annual renewal in 30 days | Value recap email + renewal confirmation |

### Churn measurement

| Metric | Formula | Target |
|---|---|---|
| Monthly churn rate | Churned / Start-of-month customers | <5% B2C, <2% B2B |
| Net revenue churn | (Lost MRR - Expansion MRR) / Start MRR | Negative (net expansion) |
| Cancel flow save rate | Saved / Total cancel sessions | 25-35% |
| Offer acceptance rate | Accepted / Shown offers | 15-25% |
| Pause reactivation rate | Reactivated / Total paused | 60-80% |
| Dunning recovery rate | Recovered / Total failed | 50-60% |

### Cohort analysis dimensions
Segment churn by: acquisition channel, plan type, tenure (30/60/90 day clusters), cancel reason, save offer type. Look for patterns that inform where to invest.
