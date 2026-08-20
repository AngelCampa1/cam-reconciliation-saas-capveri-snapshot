---
name: content-quality
description: |
  Enforce research-backed content quality standards when writing, editing, or
  updating any resource page, blog post, guide, article, or SEO page. Use this
  skill whenever you are creating new written content, revising existing content,
  reviewing a draft for quality, or updating any of the ~200+ MDX resource pages.
  Also use when the user says "improve this article," "write a blog post,"
  "update this page," "make this more engaging," "fix the intro," "rewrite this
  section," or any variant of content creation/editing for the site. This skill
  applies to ALL long-form written content, not just marketing copy.
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash
  - Agent
  - AskUserQuestion
---

# Content Quality: Research-Backed Writing Standards

You are applying empirically-grounded content quality standards distilled from research on audience psychology, narrative architecture, and editorial best practices. The source research lives at `docs/research/Crafting Engaging Internet Content.md` if you need deeper context on any framework mentioned here.

This skill works in two modes:
- **Writing mode**: Follow the frameworks top-to-bottom when creating new content
- **Editing mode**: Use the checklists to audit and improve existing content

---

## 1. Headlines

A headline's job is to convert a scroll into a click. Every headline must pass the **4 U's test** before you move on.

### The 4 U's Framework

Score each headline 1-4 on these dimensions:

| Dimension | What it means | Weak example | Strong example |
|---|---|---|---|
| **Urgent** | Creates time pressure or cost-of-inaction | "CAM Charges Explained" | "Your Lease Audit Window Closes in 90 Days" |
| **Unique** | Pattern-interrupts against the surrounding noise | "How to Review CAM Charges" | "The $14,000 Line Item Your Landlord Hopes You Ignore" |
| **Useful** | Communicates a concrete benefit the reader gets | "About CAM Reconciliation" | "How to Calculate Your Exact CAM Overcharge Amount" |
| **Ultra-specific** | Uses exact numbers, names, or details | "Save Money on CAM" | "5 Lease Clauses That Cap Your CAM Exposure" |

**Process:**
1. Write 5-10 headline variations
2. Score each on the 4 U's (1 = absent, 4 = nailed)
3. Pick the one that scores highest across all four
4. Frontload the core benefit within the first 6 words (truncation protection)

### Curiosity Gap + Negativity Bias

Headlines with negative framing ("overcharge," "mistake," "hidden," "missed") outperform positive framing by ~2.3% CTR per negative word. Sadness-adjacent framing outperforms anger or fear. But never over-promise what the body can't deliver. The hook must be paid off in the content.

**Good:** "Why Most Tenants Miss This CAM Overcharge" (curiosity gap + negative)
**Bad:** "SHOCKING CAM Secrets Landlords Don't Want You to Know" (clickbait, no payoff)

---

## 2. Introductions: Counter the 5 Skepticisms

The moment someone clicks, they're looking for a reason to leave. Your intro must neutralize all five forms of reader skepticism within the first 3 paragraphs.

| Skepticism | Reader thinks... | Counter it by... |
|---|---|---|
| **Superficial** | "This will be basic stuff I already know" | Tease a counter-intuitive finding or specific data point immediately |
| **Irrelevant** | "This won't address MY specific situation" | Explicitly list the specific scenarios or questions the article covers |
| **Sloppy** | "This looks like a wall of text" | Demonstrate crisp, scannable prose from sentence one |
| **Implausible** | "That headline claim is probably exaggerated" | Provide an immediate proof point: a number, a case, a calculation |
| **Untrustworthy** | "Who wrote this and why should I care?" | Establish authority early (CapVeri's detection engine, real audit data, specific lease clause references) |

**For CapVeri content specifically:** Authority comes from the tool, not personal CRE experience. Use phrases like "CapVeri's detection engine flagged..." or "after running reconciliations through CapVeri..." Never claim years of CRE auditing experience (see CLAUDE.md founder rules).

---

## 3. Content Structure

### Inverted Pyramid

Frontload the most valuable information. Every section, every paragraph, every sentence: lead with the answer, then explain.

- The first sentence of each section should be readable as a standalone takeaway
- If a reader bounces after 15 seconds, they should still leave with something useful
- Save supporting quotes, extended stats, and edge cases for later paragraphs

### Archipelago of Ideas

For long-form content (1500+ words), treat each section as a standalone island:

1. Gather all facts, examples, and data for the piece first
2. Group them into thematic clusters (islands)
3. Write each island as a self-contained mini-essay
4. Connect islands with structural bridges (transitions that explain why the next section follows)
5. Each island gets: one core claim, supporting evidence, a practical takeaway

### Section Outline Test

Before writing, create an outline where every H2/H3 passes the **elevator test**: someone reading only the headings should understand the full argument. Headings must be value-driven statements, not vague labels.

**Weak:** "Next Steps" / "Overview" / "Background"
**Strong:** "Why Sequence Matters: Audit First, Then Dispute" / "The $10,200 Management Fee Overcharge"

---

## 4. Storytelling Mechanics

Content that only informs is transactional. Content that transforms the reader's understanding is what earns links, shares, and trust. Use these three mechanics.

### Intention + Obstacle + Transformation

Every article benefits from at least one narrative thread:
- **Intention**: What does the tenant/reader want? (recover overcharges, understand their lease, protect their business)
- **Obstacle**: What stands in the way? (opaque reconciliation statements, tight audit windows, landlord pushback)
- **Transformation**: What changes? (the specific knowledge or tool that resolves the obstacle)

You don't need a full story arc in every article. Even a single paragraph that follows this pattern adds narrative gravity.

### Hooks vs. Frames

- **Hook**: The opening statement that captures attention (a surprising number, a provocative question, a pain point)
- **Frame**: The lens through which the entire piece is viewed

Before drafting, define:
1. What should the reader **feel** when they finish? (empowered, alarmed, confident, informed)
2. What should the reader **do** after finishing? (upload documents, review their lease, challenge a line item)

The frame determines every editorial decision. An article framed as "you're probably being overcharged" reads differently than one framed as "here's how the math works."

### Open Loops (Zeigarnik Effect)

The brain fixates on unresolved questions. Use this deliberately:
- Introduce a question or tension early, resolve it later
- Preview a finding or number in the intro that isn't explained until a later section
- Never leave loops unresolved by the end of the piece

**Example:** "The management fee looked correct at first glance. It wasn't." (The reader needs to know why, and will keep reading to find out.)

---

## 5. The POP Test

Every section of content should be evaluated against three dimensions. If a section scores zero on all three, cut it or rewrite it.

| Dimension | What it means | How to achieve it |
|---|---|---|
| **Personal** | Connects through shared experience or feeling | Reference real tenant frustrations, common "aha" moments, the feeling of reading a reconciliation statement for the first time |
| **Observational** | Surfaces a pattern others miss | Point out things that don't make sense: "Why would a management fee be 15% when the lease says 5%?" |
| **Playful** | Makes complex ideas digestible through analogy or conversational rhythm | Use metaphors, conversational questions, concrete examples instead of abstract definitions |

**The Thanksgiving Test:** If you can't explain the article's core concept to a non-CRE person at a dinner table and have them understand it, the writing is too complex.

---

## 6. Scannability

Internet readers scan before they read. A scannable layout improves comprehension by 47-58%. These rules are non-negotiable.

### Paragraph Density
- **Max 4 lines per paragraph on desktop** (2-3 is better)
- One idea per paragraph, no exceptions
- If a paragraph covers two concepts, split it

### Heading Hierarchy
- H2s are the article's table of contents (a reader skimming H2s should get the full argument)
- H3s break H2 sections into digestible chunks
- Never skip levels (no H2 → H4)

### Visual Anchors
- Use bulleted/numbered lists for any set of 3+ items
- Bold key terms on first use (but don't over-bold: see humanizer skill)
- Use tables for any comparison or multi-dimensional data
- White space is a feature, not a waste

### Bucket Brigades

Transitional micro-copy that prevents momentum stalls between paragraphs. Use 2-4 per article, placed at points where a reader might disengage.

| Type | Function | Examples |
|---|---|---|
| **Hooks** | Pull reader into a new premise | "Here's the thing:" / "But that raises a question:" |
| **Interrupters** | Force a pause before a key point | "Not so fast." / "Think about it:" / "Here's what most tenants miss:" |
| **Bridges** | Transition from abstract to concrete | "In practice, that looks like this:" / "For example:" |
| **Validators** | Make the reader feel heard | "If that sounds familiar, you're not alone." / "That's the right instinct." |

Don't overdo it. Bucket brigades lose power when every paragraph starts with one.

---

## 7. Editing Checklist

After drafting, apply these passes in order. Never draft and edit simultaneously.

### Pass 1: Chainsaw Edit (Structure)

Cut ruthlessly. Ignore word choice, focus on structure.

- [ ] Delete the first 1-3 paragraphs of the draft (most drafts start with throat-clearing)
- [ ] For each section, apply the **Goal-So-What test**: does this paragraph let the reader DO something (actionable), LEARN something (backed by facts), or FEEL something (backed by strong opinion)? If none, cut it.
- [ ] Remove any section that restates what a previous section already covered
- [ ] Verify the inverted pyramid: is the most valuable information at the top of each section?

### Pass 2: Sentence-Level Flow

Read the piece from the beginning. The moment a sentence feels awkward, fix it, then **start reading from the top again**. This recursive loop (from James Clear's process) ensures frictionless transitions.

- [ ] Vary sentence length: short punchy sentences mixed with longer explanatory ones
- [ ] Active voice over passive ("The landlord billed $27,200" not "A charge of $27,200 was billed")
- [ ] Strip filler words: very, really, just, quite, actually, basically, essentially, literally
- [ ] Strip weak adverbs (words ending in -ly) in favor of stronger verbs
- [ ] Replace abstract language with concrete specifics

### Pass 3: Anti-AI Audit

Run the humanizer skill's checklist. Key things to catch:

- [ ] No em dashes (CapVeri copy rule: use commas, colons, or restructure)
- [ ] No "serves as" / "stands as" / "represents" (use "is")
- [ ] No significance inflation ("pivotal," "groundbreaking," "testament")
- [ ] No rule-of-three lists where two items suffice
- [ ] No -ing tack-ons ("highlighting," "showcasing," "underscoring")
- [ ] No generic conclusions ("the future looks bright," "exciting times ahead")
- [ ] Varied paragraph openings (not every paragraph starts with "The" or "This")

### Pass 4: CapVeri-Specific Rules

- [ ] "Dispute letter draft" not "demand letter" in all user-visible text
- [ ] No em dashes anywhere
- [ ] Author attribution: "Angel Campa, Founder" (not "CapVeri Team" for bylined articles)
- [ ] Founder voice: "I built CapVeri because..." not "as an auditor with years of experience..."
- [ ] All numbers are specific, not rounded ("$14,200" not "thousands of dollars")
- [ ] Every claim about what CapVeri does is accurate per the PRD

---

## Quick Reference: Content Type Checklists

### New Article (Writing Mode)

1. Define the frame: what should the reader feel and do after reading?
2. Write 5-10 headline variations, pick the highest 4 U's scorer
3. Outline using archipelago method (islands + bridges)
4. Verify outline headings pass the elevator test
5. Write each island as a standalone mini-essay
6. Draft the intro last (counter all 5 skepticisms)
7. Plant 1-2 open loops in the intro, resolve them in the body
8. Run all 4 editing passes
9. Run the humanizer skill on the final draft

### Existing Article (Editing Mode)

1. Read the full article
2. Score the headline against the 4 U's (rewrite if <12/16 total)
3. Check the intro against the 5 skepticisms
4. Verify every section passes Goal-So-What
5. Check scannability: paragraph density, heading quality, visual anchors
6. Check for at least one narrative thread (intention/obstacle/transformation)
7. Apply the POP test to each section
8. Run all 4 editing passes
9. Run the humanizer skill on changed sections

---

## What This Skill Does NOT Cover

- **SEO keyword strategy**: Use the `content-strategy` or `seo-audit` marketing skills for keyword research and placement
- **Social media adaptation**: Use `linkedin-content`, `x-content`, `reddit-marketing`, or `short-form-video` skills for platform-specific formatting
- **AI writing detection**: Use the `humanizer` skill for the full anti-AI pattern library (this skill's Pass 3 is a quick check, not a replacement)
- **Email copy**: Use the `email-marketing` skill for email-specific patterns
