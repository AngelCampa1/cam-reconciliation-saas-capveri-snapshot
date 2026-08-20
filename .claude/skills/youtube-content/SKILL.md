---
name: youtube-content
description: Use when creating YouTube content for CapVeri, including scripts, titles, thumbnails, metadata, content calendars, or repurposing existing guides and blog posts into video packages. Triggers on: "YouTube video," "video script," "repurpose this guide," "turn this into a video," "YT content," "video funnel," "YouTube SEO," "video CTA," "content calendar," "video about CAM audits." Covers all funnel stages and the full AI-assisted E2E production workflow.
---

# YouTube Content for CapVeri

You are creating YouTube content for CapVeri, a forensic CAM audit SaaS that intercepts commercial tenants at the exact moment they're frustrated with an inflated reconciliation bill. The channel's job is not to get views. It's to put the right tenant in front of the product at the moment they're ready to act.

The audience: CFOs, lease administrators, small business owners, franchise operators, and multi-location regional tenants, often non-technical, time-poor, and skeptical of anything that asks them to upload sensitive documents.

**Primary use case: repurposing existing guides, blog posts, MDX articles, or research documents into YouTube video packages.** The AI handles the full transformation from source material to publish-ready assets.

**For automated video production at scale** (AI avatars, orchestration, zero-click publishing): see the `content-pipeline` skill. This skill covers the creative side; content-pipeline covers the infrastructure.

---

## Step 0: Repurposing source material (primary workflow)

When the user provides existing content to repurpose, do this before anything else.

**Read the source material and extract:**
1. **The core insight**: what is the single most important thing the reader learns? This becomes the Teaser.
2. **The pain mechanism**: what specific overcharge or calculation error does this explain? This drives the Issue section.
3. **The "Aha!" moment**: the moment the problem becomes undeniable (a number, a formula, a real example). This anchors the Solution section.
4. **Implied funnel stage**: is this explaining a concept (TOFU/MOFU) or showing how to act (BOFU)? Infer from content.

**Then apply the standard packaging + script workflow below.** The source material feeds the script — you're not summarizing it, you're extracting the tension and rebuilding it in video format.

**Conversion rules for written-to-video:**
- Replace passive/explanatory sentences with direct address: "The gross-up calculation allows..." becomes "Here's what your landlord is doing with gross-up..."
- Written articles can present information linearly; video scripts must front-load conflict: the problem must be clear in the first 10 seconds
- Long explanations need visual anchors noted in [brackets]: formulas, dollar amounts, and comparisons become on-screen graphics
- Jargon that's fine in a written guide needs a spoken definition the first time it appears in a script
- A case example buried in paragraph 4 of the article should be moved to the Teaser or Issue section: it's the most powerful element

---

## Step 1: Clarify what's needed

Identify which output is requested (default to full video package if unspecified):

- **Full video package**: title options + thumbnail brief + script + metadata + CTA
- **Script only**: 4-part script with visual direction notes
- **Title + thumbnail brief only**: packaging for an existing topic
- **Content calendar**: prioritized video ideas mapped to funnel stages
- **Metadata only**: description, chapters, tags for an existing script

Also identify:
- **Funnel stage**: TOFU (problem-aware), MOFU (solution-aware), BOFU (decision-ready) — if repurposing, infer from the source
- **Format**: talking head / product demo / case study walkthrough / explainer
- **Topic**: provided by user, extracted from source material, or suggest from `references/keyword-bank.md`

If topic + funnel stage are clear (or inferable from source material) — write the full package without asking.

---

## Step 2: Title and thumbnail

### Title rules

- Lead with the primary keyword (exact phrase the viewer is searching)
- Add a psychological hook: curiosity gap, loss aversion, or specific number
- 60–70 characters max (no mobile truncation)
- Never stuff keywords; the title must read naturally

**Transformation pattern:**
- Weak: "How to Check Your Commercial CAM Expenses"
- Strong: "5 Hidden CAM Overcharges Your Landlord Hopes You Ignore"

**High-performing structures:**
- "[Number] CAM [mistakes/errors/tricks] that [cost you / your landlord won't tell you about]"
- "How to [outcome] without [painful alternative]"
- "Why Your CAM Reconciliation Is [Probably Wrong / Costing You $X]"
- "The [Clause/Calculation/Strategy] Your Landlord Hopes You Never Read"
- "This Tenant Recovered $[X] in CAM Overcharges: Here's What They Found"

**AI assist:** Generate 10 title variations using GravityWrite or a Claude prompt, then select the best 3.

### Thumbnail brief

Use the **60-30-10 rule**:
- 60%: dominant saturated background (high-contrast solid)
- 30%: subject (presenter's face, or a striking visual like a redacted invoice or a split "before/after" dollar amount)
- 10%: accent — 3–5 bold words in high-contrast text (thumbnail text must complement the title, not duplicate it)

Thumbnail text must survive at 168x94px (mobile feed). If the core message isn't legible at that size, contrast is insufficient.

Deliver: background color suggestion, visual subject description, and exact text overlay copy (3–5 words).

---

## Step 3: Script (4-part framework)

Every CapVeri YouTube script follows this structure. The tenant is always the **Hero**; CapVeri is the **Guide**. Never position the software as the savior. It's the tool that gives the tenant the power to act.

**AI assist:** Draft the full script with Claude, then run it through Descript or CapCut for pacing review. Use an Elgato Prompter or equivalent to read on camera without looking off-screen.

### Part 1: Teaser (0:00–0:10)

One or two sentences. Deliver the outcome immediately. No logo intro, no "welcome back," no biography. The first words validate why the viewer clicked.

Example: *"In the next five minutes, I'm going to show you exactly how landlords use hidden capital expenditures to inflate your CAM bill, and how you can catch it without hiring a forensic accountant."*

### Part 2: Issue (0:10–1:30)

Agitate the problem before introducing the solution. Make the viewer think "yes, that's exactly what's happening to me." Explain the specific mechanism of overcharge: pro-rata math, gross-up methodology, CapEx buried as operating expenses, base year manipulation. Ground it in a real-sounding scenario. Avoid jargon without a spoken definition.

Use **But/Therefore** structure:
- Setup: "A regional retail tenant received a $60,000 CAM reconciliation..."
- But: "...the landlord had applied a gross-up factor to fixed costs like property taxes and insurance, which don't change with occupancy at all."
- Therefore: "...by running the statement through CapVeri, they flagged a $19,200 math error and recovered it."

[Visual direction: show on-screen text of the dollar amounts as they're spoken]

### Part 3: Solution (1:30–4:00)

Transition from problem agitation to the solution. For MOFU/BOFU videos, this is the **product demo segment**: show the upload flow, the flagged findings, the numbers. Deliver the "Aha!" moment on screen.

Demo narration:
1. "Drag and drop your lease PDF into the upload portal."
2. "Upload the reconciliation statement your property manager sent you."
3. "Watch as the engine parses the legal language and cross-references your pro-rata share."
4. "Here it flags a $24,000 discrepancy: CapEx for roof replacement in Section 4, explicitly excluded."

**AI assist for demo:** Use Screen Studio to record the product walkthrough. It applies automatic cursor smoothing, zoom, and cinematic motion blur with zero manual keyframing — transforms a screen recording into a polished demo.

For TOFU videos: skip the demo. Deliver the educational solution (what to look for, how to check manually) and position a free scan as the effortless shortcut at the CTA.

### Part 4: CTA (4:00–End)

**One ask only.** Never stack CTAs (like + subscribe + follow + sign up in one breath).

Primary CTA for BOFU/MOFU: upload their lease for a free automated audit at capveri.com.
Primary CTA for TOFU: grab the lead magnet (see `references/keyword-bank.md` for which magnet matches the topic).

**CTA timing rules:**
- Never place a CTA in the first 15 seconds (destroys hook credibility, signals ad)
- Add a **mid-roll soft CTA** when the Issue section peaks (~1:00–1:15): *"If you already suspect your bill is inflated, click the link in the description now and run a free audit while we keep going."*
- Add the **primary end CTA** at the close
- Use YouTube native End Screens and Cards for clickable links

---

## Step 4: Metadata

### Description

- First 2–3 sentences include the primary keyword naturally (these appear in search snippets)
- Summarize what the viewer learns (not what the video is "about")
- Include the free audit CTA and link to capveri.com
- List any downloadable resources with direct links
- Add 3–5 timestamp chapters — each chapter title should incorporate secondary long-tail keywords

### Chapter format

```
0:00 Introduction
0:10 [Problem name with keyword, e.g. "How gross-up overcharges work"]
1:30 [How the detection works, e.g. "Identifying fixed vs. variable cost errors"]
3:00 [Product demo / case example]
4:30 Run a free CAM audit: how to get started
```

### Tags

CAM charges, CAM reconciliation, common area maintenance, NNN lease, triple net lease, commercial lease audit, tenant rights, CAM overcharge, [topic-specific term], capveri

**AI assist:** Generate the full description and chapter list with a Claude prompt. Paste the script and say "write a YouTube description under 200 words with these timestamps and this primary keyword."

---

## Step 5: Lead magnet match

| Video topic | Lead magnet |
|---|---|
| TOFU awareness / "what are CAM charges" | CAM Audit Checklist (top 10 improperly billed items) |
| Pro-rata share, square footage errors | Pro-Rata Share Calculator template |
| Base year, full-service leases | Base Year Negotiation Guide |
| Any BOFU / product demo | Free automated audit at capveri.com (direct to product, no magnet) |

Mention the lead magnet verbally in the CTA and link it in the description.

---

## AI production stack (full pipeline)

The goal is to minimize manual work at every stage. Claude handles the creative; external AI tools handle recording, editing, and distribution.

| Stage | AI tool | What it does |
|---|---|---|
| **Ideation + script** | Claude (this skill) | Repurposes source material, writes 4-part script, generates metadata |
| **Title generation** | GravityWrite or Claude | Generates 10+ title variations for A/B testing |
| **Teleprompter** | Elgato Prompter | Reads script on-camera with eye contact maintained |
| **Screen recording** | Screen Studio | Auto cursor smoothing, zoom, cinematic blur for product demos |
| **Video editing** | Descript or CapCut | Text-based editing, AI filler word removal, auto captions |
| **Thumbnail** | Canva AI or Midjourney | Rapid thumbnail iteration based on the brief |
| **SEO validation** | TubeBuddy / Keywords Everywhere | Confirms keyword search volume before publishing |
| **Short-form clips** | CapCut or Opus Clip | Cuts long-form into YouTube Shorts, Reels, TikTok |
| **Avatar videos** | HeyGen or Zoice | AI clone of Angel for high-volume content without daily recording |
| **Automated distribution** | Make.com + Upload-Post.com | Zero-click publishing across platforms |

**For the full automated pipeline** (article-to-video without manual steps), see the `content-pipeline` skill. It covers orchestration (Make.com/n8n), avatar platform selection, B-roll generation, and multi-platform distribution architecture.

---

## Funnel-aware content angles

**TOFU (awareness)** — searchers who don't know they're being overcharged:
- "What are CAM charges and why do they keep going up?"
- "Why your Triple Net lease bill spikes every year"
- "Commercial landlord tenant rights: what most tenants never read"

**MOFU (education)** — tenants who suspect a problem and want to understand it:
- "How pro-rata share errors work (and how much they cost)"
- "Gross-up methodology: the calculation most landlords get wrong"
- "Base year manipulation in full-service commercial leases"
- "CAM cap violations: what triggers them and how to dispute"
- "Management fee double-dipping: the charge that compounds every year"

**BOFU (conversion)** — ready to act, comparing options:
- "Commercial lease audit software: how automated tools work"
- "How to dispute landlord CAM charges without a lawyer"
- "CapVeri walkthrough: what happens when you upload your lease"

---

## Voice and copy rules (mandatory)

- **Founder voice**: Angel Campa built CapVeri. Never "as an auditor" or "in my experience in CRE." Always "I built CapVeri because..." or "our tool flagged this."
- **Em dashes (—, --, –) are strictly prohibited** in ALL output: scripts, descriptions, titles, thumbnail text, chapter names, CTA copy. Every instance. No exceptions. Replace with commas, colons, periods, or restructure the sentence. Before delivering any output, scan it and replace every em dash.
  - Wrong: "the most common overcharge — and the hardest to catch"
  - Right: "the most common overcharge, and the hardest to catch"
  - Wrong: "property taxes, insurance, and management fees — costs that don't change"
  - Right: "property taxes, insurance, and management fees. None of these change"
- **Invoke the `humanizer` skill** (using the Skill tool) on all scripted dialogue and description copy before delivering the final version. Do not attempt a "humanizer pass" yourself. Actually invoke the skill.
- No legal promises about recovery amounts. Say "flagged a discrepancy," not "you're owed X."
- "Dispute letter draft" if referencing the letter feature. Never "demand letter."
- **Title length hard limit: 70 characters.** Count every title before including it. If over 70, rewrite shorter.

---

## Output format

For a **full video package**, deliver in this order:
1. **Video brief**: funnel stage, format, target keyword, 3 title options
2. **Thumbnail brief**: background color, visual subject, text overlay (3–5 words)
3. **Script**: labeled by part (Teaser / Issue / Solution / CTA), timed, with [visual direction notes in brackets]
4. **Description**: ~150 words with keyword, chapters, CTA, lead magnet link
5. **Tags**: comma-separated list

For a **content calendar**: deliver a table — Funnel Stage / Title / Format / Source Material / Primary Keyword / Lead Magnet / Publish Priority.

---

## References

For the full keyword bank, TOFU/MOFU/BOFU intent tables, top 10 prioritized video topics, competitive landscape, and performance benchmarks, read `references/keyword-bank.md`.
