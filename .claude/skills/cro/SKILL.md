---
name: cro
description: >
  Conversion Rate Optimization across the full funnel: pages, forms, signup flows, onboarding,
  paywalls, popups, and retention. Use this whenever you need to improve conversions on any page,
  form, flow, or UI element. Also use when someone asks why conversions are low, how to reduce
  drop-off, how to optimize a landing page, how to improve signup completion, how to design a
  cancel flow, or how to increase upgrade rates. Covers CTA design, psychological triggers,
  friction analysis, A/B test ideas, and funnel diagnostics. If the task involves getting more
  users to take an action (click, submit, sign up, pay, stay), this is the skill.
---

# Conversion Rate Optimization Playbook

Research-backed CRO framework covering the full conversion funnel. Built from 2026 benchmark data, behavioral psychology, and battle-tested tactical patterns.

## How to use this skill

1. **Diagnose first** (Step 1-2 below). Most CRO failures come from optimizing the wrong thing.
2. **Apply psychology** (Step 3). Every conversion is a human decision. Understand the decision.
3. **Execute tactically** (Step 4). Pick the right funnel stage and apply the patterns.
4. **Measure and iterate** (Step 5). Set up the test, not just the change.

For deep tactical guidance on specific funnel stages, read the relevant reference file:
- `references/page-and-forms.md` — Page CRO, form optimization, popup/modal design
- `references/signup-to-retention.md` — Signup flows, onboarding, paywalls, churn prevention
- `references/benchmarks.md` — 2026 industry benchmarks and conversion data

---

## Step 1: Identify the conversion type

Before touching anything, name what you're optimizing. Different conversion types have different ceilings, psychology, and tactics.

| Conversion Type | Typical Range | Elite Range | Primary Lever |
|---|---|---|---|
| Page CTA (general) | 3-5% | 11.5%+ | Value clarity + single CTA |
| SaaS landing page | 3.8% | 10-15% | Benefit specificity |
| Lead capture form | 20-30% | 40%+ | Field count reduction |
| Signup flow | 30-50% | 70%+ | Progressive commitment |
| Onboarding activation | 20-40% | 60%+ | Time-to-value compression |
| Free → paid upgrade | 2-5% | 10-15% | Trigger timing |
| Cancel flow save rate | 10-15% | 25-35% | Dynamic offer matching |
| Interactive content (quiz, calc) | 30-40% | 63-75% | Micro-commitment sequencing |

**Key insight**: a 4% page CTA rate is normal. Trying to hit 20% with copy tweaks alone is structurally impossible. If the gap between current and target is large, the fix is structural (different format, different funnel stage, different channel), not cosmetic.

Read `references/benchmarks.md` for full 2026 benchmark tables by industry, device, and channel.

---

## Step 2: Diagnose the real constraint

Run through these five questions in order. Stop at the first "yes" — that's your constraint.

### Is the page trying to do too many things?
Landing pages with a single CTA convert at 13.5%. Adding a second option drops it to 11.9%. Five or more options collapse it to 10.5%. Every additional choice fractures attention and triggers decision fatigue.

**Fix**: Strip competing CTAs, hide navigation on landing pages, isolate the one action you want.

### Is the traffic mismatched?
Sending low-intent traffic to a high-commitment ask inflates the denominator and kills conversion rate. A page converting at 2% on broad paid traffic might convert at 15% on retargeted visitors.

**Fix**: Segment by intent. Filter with intentional friction (quiz, calculator) before presenting the ask. Use suppression to stop messaging low-intent users.

### Is there a trust gap?
The visitor understands the offer but doesn't believe it, doesn't trust the brand, or perceives too much risk. Common when: no social proof near CTAs, no recognizable logos, vague guarantees, asking for sensitive info too early.

**Fix**: Place trust signals adjacent to CTAs (not just at page bottom). Use specific, attributed testimonials with real numbers. Add guarantees, security badges, and "no credit card required" where applicable.

### Is the value proposition unclear?
Can a visitor understand what this is and why they should care within 5 seconds? If the headline is clever but vague, feature-focused instead of benefit-focused, or written in company jargon instead of customer language, the page fails before the CTA is even seen.

**Fix**: Rewrite the headline as outcome-focused. Test: "Get [desired outcome] without [pain point]." Include specifics (numbers, timeframes, concrete details).

### Is the friction structural?
Forms too long, signup too many steps, mobile experience broken, page too slow. Every second of load time costs ~7% conversion. Mobile accounts for 82.9% of landing page traffic but converts ~8% lower than desktop on average.

**Fix**: Reduce fields to minimum viable. Mobile-first design with 44px+ touch targets. Defer non-essential data collection to post-conversion.

---

## Step 3: Apply the psychology

Every conversion is a human deciding to act. These are the six psychological levers that move the needle, ranked by reliability. Apply 2-3 per page, not all six.

### 1. Loss aversion (strongest lever)
The pain of losing is ~2x more powerful than the pleasure of gaining. "Don't miss" outperforms "Act now." Countdown timers, low-stock indicators, and expiring offers trigger competitive urgency.

**In practice**: Frame CTAs around what they'll lose by not clicking, not what they'll gain. "Don't lose your audit results" > "Get your audit results." Show what expires, what's limited, what others are claiming.

### 2. Cognitive ease / single-option framing
When the interface presents one clear path, the decision simplifies to act-or-exit. When it presents two or more paths, the user shifts from deciding whether to deciding which — and often defaults to neither.

**In practice**: One primary CTA per viewport. If you must offer alternatives, make the hierarchy unmistakable (primary button vs. text link). Never place "Free Trial" and "Book Demo" side by side as equal options.

### 3. Endowment effect / sunk cost
Users value things more when they feel they already own them, or when they've invested effort. Interactive elements (calculators, configurators, quizzes) that let users input personal data create psychological ownership before the ask.

**In practice**: Let users customize, calculate, or build something before showing the CTA. By the time they're asked to submit, abandoning feels like losing their work. Multi-step flows with progress bars exploit this — once 60% complete, completion rates soar to 63-75%.

### 4. Social proof / trust transference
Positive perception of trusted third parties transfers to your conversion event. Verifiable, specific proof near the CTA neutralizes risk perception.

**In practice**: Customer logos near CTAs (not just page header). Testimonials with real names, photos, specific numbers ("saved $47K"). Review scores with count ("4.8/5 from 2,400 reviews"). Place proof adjacent to the ask, not decoratively elsewhere.

### 5. Curiosity gap
An incomplete information pattern creates cognitive tension that the click resolves. The user clicks to relieve the tension, not because you asked them to.

**In practice**: Tease a specific, desirable piece of information without revealing it. "See how much your landlord overcharged" > "View your report." The CTA becomes the resolution, not the imposition.

### 6. Serial position effect
Humans remember the first and last items in a sequence. Critical value props and CTAs must appear above the fold (primacy) or as the final element of the scroll journey (recency). Anything buried in the middle gets filtered out.

**In practice**: Hero section gets the primary value prop + CTA. Repeat CTA at the end of every major content section. Never rely on a single mid-page CTA.

---

## Step 4: Execute by funnel stage

### Pages (landing, homepage, pricing, feature)

**Value proposition**: Can they understand what + why in 5 seconds? Benefit-focused, not feature-focused. Written in customer language.

**Headline patterns that work**:
- Outcome: "Get [desired outcome] without [pain point]"
- Specificity: Include numbers, timeframes, concrete details
- Social proof: "Join 10,000+ teams who..."

**CTA design** (research-backed):
- Rounded corners outperform sharp by 17-55%
- Directional arrows adjacent to CTAs increase clicks by 26%
- First-person copy ("Get My Report") outperforms second-person ("Get Your Report") by 28%
- 2-4 word verb-driven microcopy. "Start Free Audit" not "Submit" or "Click Here"
- High contrast against surrounding design. Isolated by whitespace
- Personalized CTAs convert 202% better than generic ones

**Visual hierarchy**: Human faces looking toward the CTA redirect viewer attention (gaze cueing). F-pattern reading: users scan horizontally at top, then down left side. Place CTAs within this natural scan path.

**Page-type specifics**:
- **Landing page**: Single CTA, remove nav, complete argument on one page, match ad/source messaging
- **Homepage**: Handle both "ready to buy" and "still researching" paths
- **Pricing**: Recommended plan indication, address "which plan?" anxiety, clear comparison
- **Feature page**: Connect feature → benefit → use case → try/buy path

For deep page CRO, form optimization, and popup design: read `references/page-and-forms.md`.

### Forms

**Every field has a cost.** 3 fields = baseline. 7+ fields = 25-50% reduction.

For each field ask: Do we need this before we can help them? Can we get it another way? Can we ask later?

**Field priority**: Email (essential) → Name (often deferrable) → Everything else (defer or enrich post-submit).

**Key patterns**:
- Labels stay visible (don't use placeholder-only). Placeholders disappear on focus.
- Inline validation on blur, not while typing
- Specific error messages near the field ("Please enter a valid email" not "Invalid input")
- Submit button copy states the outcome: "Get My Free Quote" not "Submit"
- Single column layout outperforms multi-column

**Multi-step forms** (5+ fields): Progress indicator, easy questions first, sensitive fields last, save progress, allow back navigation. Once users start a multi-step sequence, completion rates hit 63-75%.

### Signup flows

**Core**: Minimize fields. Show value before commitment. Reduce perceived effort.

- Social auth prominently placed (often higher conversion than email forms)
- Progressive commitment: email only → password + name → customization (optional)
- "No credit card required" if true
- Post-submit: immediate product access > email confirmation gate

### Onboarding

**Time-to-value is everything.** Remove every step between signup and experiencing core value.

- Define the activation metric: what do retained users do that churned users don't?
- One goal per first session. Save advanced features for later.
- Interactive > tutorial. Doing the thing > learning about the thing.
- Checklist pattern: 3-7 items, ordered by value, quick wins first, progress bar
- Empty states are onboarding opportunities, not dead ends

### Paywalls and upgrade screens

**Value before ask.** The upgrade should feel like a natural next step after experiencing real value, not an interruption.

- Trigger after the aha moment, not before
- Feature gates: clear explanation of why it's paid + preview of what it does + quick unlock path
- Usage limits: show what upgrading provides, don't block abruptly
- One primary offer + one fallback, not a wall of options
- Show specific dollar savings, not just percentages
- Respect the "no" — easy to continue free, maintain trust for future conversion

### Popups and modals

**Timing**: Not before 30 seconds. Scroll-based (25-50% depth) or exit-intent triggers outperform time-based.

- Click-triggered popups have 10%+ conversion (self-selected audience) vs. 2-5% for interruption popups
- One popup per session maximum. Remember dismissals for 7-30 days.
- Easy close (visible X, click outside, Esc key). No dark patterns.
- Mobile: bottom slide-ups, not full-screen overlays
- Google penalizes intrusive mobile interstitials — comply or lose SEO

### Churn prevention and cancel flows

**Cancel flow structure**: Trigger → Exit survey → Dynamic save offer → Confirmation → Post-cancel win-back.

**Match the offer to the reason** — a discount won't save someone who isn't using the product:

| Cancel Reason | Primary Offer | Fallback |
|---|---|---|
| Too expensive | 20-30% off for 2-3 months | Downgrade to lower plan |
| Not using it enough | Pause 1-3 months | Free onboarding session |
| Missing feature | Roadmap preview + timeline | Workaround guide |
| Switching to competitor | Comparison + discount | Feedback session |
| Technical issues | Escalate to support now | Credit + priority fix |

**Involuntary churn** (failed payments) = 30-50% of all churn and the easiest to fix. Smart retries + dunning emails recover 50-60% of failed payments.

For deep tactical guidance on signup, onboarding, paywalls, and churn: read `references/signup-to-retention.md`.

---

## Step 5: Measure and iterate

### What to test (by impact)

| Element | Expected Lift | Effort |
|---|---|---|
| Headline rewrite (benefit-focused) | 10-30% | Low |
| Reduce form fields | 25-50% | Low |
| Single CTA (remove competing actions) | 10-20% | Low |
| Add social proof near CTA | 5-15% | Low |
| CTA copy (outcome-focused, first-person) | 10-28% | Low |
| Multi-step form conversion | 30-50%+ | Medium |
| Interactive content (quiz/calc) pre-CTA | 2-5x engagement | Medium |
| Dynamic personalization | Up to 202% | High |
| Cancel flow with dynamic offers | 25-35% save rate | Medium |

### How to structure tests

1. **One variable at a time.** Changing headline + CTA + layout simultaneously tells you nothing.
2. **Statistical significance before declaring winners.** Minimum 100 conversions per variant for reliable results. Small sample sizes produce false positives.
3. **Measure downstream, not just the click.** A headline that increases clicks but decreases qualified leads is a loss. Track through to revenue.
4. **Time-bound experiments.** Set a duration before starting. Don't peek and stop early on a good day.

### Metrics by funnel stage

| Stage | Primary Metric | Secondary |
|---|---|---|
| Page | CTA click rate | Bounce rate, scroll depth |
| Form | Completion rate | Field-level drop-off, error rate |
| Signup | Signup completion | Social vs. email ratio, time to complete |
| Onboarding | Activation rate | Time to activation, Day 1/7/30 retention |
| Paywall | Upgrade rate | Revenue per user, churn post-upgrade |
| Cancel flow | Save rate | Offer acceptance by reason, 90-day re-churn |

---

## The friction paradox

Counter-intuitive but research-backed: intentional, structured friction can increase conversion quality and rate.

**Bad friction** (eliminate): Slow load times, cluttered nav, confusing layouts, unnecessary fields, double CTAs competing for attention. This is noise that destroys conversion.

**Good friction** (deploy strategically): Diagnostic quizzes, ROI calculators, multi-step configurators. These filter out low-intent visitors (cleaning your denominator) while building sunk-cost commitment in high-intent visitors. Users who complete a structured, value-building path click the final CTA at 63-75% because:
1. They've invested effort they don't want to waste (sunk cost)
2. The CTA reveals their personalized result (curiosity resolution)
3. They've self-qualified as high-intent (denominator filtering)

This is the single most important structural insight for hitting high conversion rates. You cannot A/B test your way from 4% to 40%. You must restructure the journey to present the CTA only to pre-qualified, psychologically committed users.

---

## Ethics guardrail

Dark patterns are illegal under expanded FTC enforcement. Fake countdown timers, hidden close buttons, confirmshaming ("No, I don't want to save money"), and deceptive UI are not aggressive marketing — they are prohibited.

Biometric data (eye tracking, facial coding) is protected personal information under California SB 1223. Explicit informed consent required.

The rule: optimize by providing value, reducing cognitive load, and facilitating intent. Never by exploiting cognitive vulnerabilities to trick unwanted clicks. A tricked click churns, chargebacks, and damages reputation — net negative ROI.

---

## Copy rules

- No em dashes in any output. Use commas, colons, or restructure.
- Run the `humanizer` skill on all user-facing copy.
- "Dispute letter draft" not "demand letter" in all client-facing text.
