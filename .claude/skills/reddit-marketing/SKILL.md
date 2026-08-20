---
name: reddit-marketing
description: Draft Reddit posts, comments, and engagement strategy for CapVeri marketing. Use this whenever you want to write a Reddit post, respond to a property manager's question about CAM reconciliation, craft a subreddit comment, plan a Reddit marketing campaign, or identify which subreddits to target. Also useful for writing AMA intros, sniper comments, or organic case study posts for r/PropertyManagement, r/Landlord, r/CommercialRealEstate, r/realestateinvesting, or r/CFO.
---

# Reddit Marketing for CapVeri

You are helping market CapVeri on Reddit using a value-first, community-native approach. Reddit's culture demands that you be a Redditor-with-a-product, not a company-with-a-Reddit-account. Any post that feels promotional gets removed and banned.

## The Core Rule: 90/10

90% of content is genuine, unbranded community value. 10% is a soft, natural product mention — at the end, framed as a personal observation, never as a pitch.

## Step 1: Identify the task

- **New post** (educational deep-dive, case study, AMA)
- **Sniper comment** (responding to a specific thread about CAM issues)
- **Campaign planning** (which subreddits, what content types, what timing)
- **Paid ad creative** (native-format ad copy)

If the user pastes a Reddit thread and asks how to respond — that's a sniper comment. Respond to that specific situation.

## Account Age Strategy

Reddit enforces karma thresholds at the subreddit level. New accounts that post get auto-filtered by AutoModerator before any human ever sees it. Comments from new accounts are more likely to survive than posts.

**Phase 1 — Comments only (0–100 karma)**

Do not post original content. Focus entirely on Archetype D (sniper comments) in response to existing threads. This is the highest-ROI activity for a new account anyway:
- Sniper comments on active posts from the last 24–48 hours
- Subreddits with lighter new-account restrictions: r/legaladvice, r/smallbusiness
- No links in comments until account is established
- One comment per subreddit per day max — new account velocity triggers spam filters

**Phase 2 — Posts unlocked (100+ karma)**

Once the account has demonstrated consistent, well-upvoted comment activity, original posts become viable. Start with r/smallbusiness (lower threshold) before r/Franchises or r/CFO.

**Phase 3 — AMA eligible (500+ karma + credibility)**

AMAs require both karma and visible history in the subreddit. Build the reputation before attempting.

**Banned subreddits (permanent):**
- r/CommercialRealEstate — account banned, do not attempt under any circumstances

---

## Step 2: Select the right subreddit

> **r/CommercialRealEstate is banned.** Account was banned — do not use this subreddit under any circumstances.

| Subreddit | Audience | Best Content Type | Key Rule |
|---|---|---|---|
| **r/PropertyManagement** | Property managers, PMC staff, owner-operators | Reconciliation workflows, Q1 crunch, tenant dispute handling | High value for authentic operational content. Avoid sales language. |
| **r/Landlord** | Individual and portfolio landlords | CAM math, NNN lease reconciliation, tenant audit letters | Highly receptive to tools that reduce tenant disputes. |
| **r/CommercialRealEstate** | CRE professionals, investors, brokers | Cap tracking, BOMA 2024, ERP gaps, reconciliation errors | Professional tone. Data-backed claims preferred. |
| **r/realestateinvesting** | Investors, syndicators, asset managers | Found revenue, NOI impact of CAM errors, asset management | Focus on financial impact — NOI and asset value framing. |
| **r/CFO** | CFOs, VPs of Finance, controllers | CAM liability forecasting, EBITDA, AI in finance | Peer-to-peer tone. Avoid vendor language. |

## Step 3: Choose content archetype

### Archetype A: Deep-Dive Educational Post
Best for: r/smallbusiness, r/Franchises

Structure:
1. Title: First-person expert authority ("I'm a former commercial lease auditor. Here are the 5 ways…")
2. Body: 800–1200 words, native text only (no external links until the very end if at all)
3. Specific, named examples (not "a client" — "a 35-building PMC in Harris County" or "a boutique office property manager in Houston")
4. Actionable checklist or framework
5. Soft product mention near the end, framed as personal journey: "I eventually built software to automate this, but whether you use tech or a yellow highlighter, don't sign off on your reconciliation without checking [specific thing] first."

### Archetype B: Transparent Case Study
Best for: r/smallbusiness, r/Franchises

Structure:
1. Title: Specific dollar amount and PMC type ("How we found a $47,000 gross-up error in a 200K SF office building — and the exact lease clause that made it wrong")
2. Full narrative: discovery → landlord pushback → forensic process → resolution
3. Focus on methodology and human stakes, not software
4. Product appears only as "the tool that helped find it"

### Archetype C: AMA (Ask Me Anything)
Best for: r/Accounting, r/Entrepreneur (requires mod coordination)

Title: "I build AI engines that catch commercial real estate landlords committing CAM fraud. I've reviewed thousands of NNN leases. AMA."

Rules:
- Contact moderators in advance to schedule and verify credentials
- Personal, conversational tone — no corporate language
- Answer questions thoroughly with follow-up questions to deepen threads
- Roll with criticism honestly

### Archetype D: Sniper Comment
Best for: Daily use in any subreddit where property managers or landlords ask about CAM reconciliation issues

Structure:
1. Highly specific, technically informed response to their exact situation
2. Include: the correct formula for what they're asking about (gross-up, pro-rata denominator, cap math), the common error pattern, and what their lease clause likely says
3. No pitch. If the response is exceptional, users will ask about your product themselves.
4. End with a question that invites them to share more detail about their lease structure.

**This is the highest-ROI daily activity.** Each sniper comment becomes a permanent, searchable resource on Google for future PMCs with the same reconciliation problem.

## Step 4: Write the content

Apply the archetype. For educational posts, the product mention must feel like a natural afterthought — not the point.

**Never:**
- Use corporate tone or marketing jargon
- Post the same URL to multiple subreddits (triggers spam filter)
- Create fake accounts to upvote your content (sock puppeting — site-wide ban)
- Post in r/CommercialRealEstate with a link to your website

**Always:**
- Match the lexicon of the community (use "NNN lease" not "triple-net lease agreement", use "reconciliation statement" not "CAM billing document")
- Build karma in a subreddit before posting (at least 50+ karma from genuine comments)
- Acknowledge valid criticism — Reddit users respect humility, punish defensiveness

## Keyword Monitoring

For the full keyword list, subreddit priorities, search query recipes, scoring rubric, and noise filters, read `keywords.md` in this skill directory.

To fetch live Reddit data using those keywords (no API key needed), invoke the `reddit-crawler` skill. It covers URL patterns, JSON response structure, comment thread fetching, pagination, and the daily monitoring workflow.

## Output format

- For posts: Deliver full post text with a suggested title, ready to paste
- For sniper comments: Deliver the comment text only, no preamble
- For AMA: Deliver the intro post + 5 example answers to likely questions
- For campaign plans: Deliver a table (Subreddit / Content Type / Frequency / Rules to Follow)

## Copy Rules (Mandatory)

- **Run the humanizer skill on all output.** After drafting any content, invoke the `humanizer` skill to remove AI writing patterns before delivering the final version.
- **Em dashes are strictly prohibited.** Never use em dashes (—) in any output. Use commas, colons, parentheses, or restructure the sentence instead.

## References

For paid ad strategy, bidding frameworks, message validation hacks, and ROI tracking methodology, read `references/paid-playbook.md`.
