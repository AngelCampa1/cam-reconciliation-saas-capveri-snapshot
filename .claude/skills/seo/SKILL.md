---
name: seo
description: Use when optimizing a website for Google search rankings, implementing llms.txt, auditing Core Web Vitals or INP, doing prompt research instead of keyword research, building off-site entity authority via Reddit or digital PR, understanding query fan-out, or ensuring SQRG compliance. Also use when the user mentions "SEO strategy," "rank on Google," "llms.txt," "Core Web Vitals," "INP," "query fan-out," "prompt research," "SQRG," "digital PR," "entity authority," "technical SEO for AI," "Topical Coverage Gap," or "information gain." For AI-specific citation optimization (GEO, RAG mechanics, chunk engineering, platform biases), see ai-seo instead. For traditional technical SEO checklists (crawlability, indexation, meta tags), see marketing-skills:seo-audit.
---

# SEO: Technical Infrastructure and Off-Site Authority for Generative Search

Bridges traditional SEO and Generative Engine Optimization. Covers the technical infrastructure, off-site authority building, and measurement frameworks required for AI search visibility. Based on 2026 research including Google's Thematic Search patent (US12158907B1) and updated Search Quality Rater Guidelines.

**Companion skill:** `ai-seo` covers RAG mechanics, semantic chunk engineering, platform-specific biases (ChatGPT vs Gemini vs Claude), and the 7 core ranking determinants. This skill covers everything else.

## Query Fan-Out: How AI Search Decomposes Queries

Google's AI doesn't execute one search per query. The Thematic Search patent describes an orchestrator that decomposes a single prompt into 8-28 parallel sub-queries across multiple retrieval surfaces (web index, Knowledge Graph, Shopping Graph, structured data).

### The 8 Query Expansion Types

| Type | Function |
|------|----------|
| **Equivalent** | Alternative phrasings and synonyms to capture docs answering the intent without the user's exact vocabulary |
| **Follow-up** | Predicts logical next questions and preemptively retrieves that data |
| **Generalization** | Broadens scope to retrieve foundational context if query is too narrow |
| **Specification** | Drills into granular constraints (price, geography, specs) |
| **Canonicalization** | Standardizes colloquial phrasing into formal query language for database retrieval |
| **Language Translation** | Executes sub-query in multiple languages, translates best answer back |
| **Entailment** | Retrieves info based on implied or logically following conditions |
| **Clarification** | Disambiguates intent before finalizing retrieval |

### Fan-Out Multiplier Effect (FME)

```
FME = Q_orig x F_avg x (1 + S_exp)

Q_orig = original query volume
F_avg  = average fan-out factor (8-12 sub-queries)
S_exp  = secondary expansion rate from follow-ups (constant ~0.3)
```

**Example:** A keyword with 1,000 monthly searches expands into 10,400-15,600 total retrieval events. This is a 10-16x increase in addressable surface area.

**Critical stat:** 68% of pages cited in AI Overviews are NOT in the top 10 traditional organic results. The AI orchestrator bypasses generic pillar pages in favor of specific passages on lower-ranking domains.

### Topical Coverage Gap (TCG)

```
TCG = 1 - (Traditional_Overlap x Organic_Citation_Share)

Traditional_Overlap = 25-39% (overlap between traditional rankings and AI citations)
Organic_Citation_Share = ~32%
```

**Result:** Brands optimizing only for traditional blue links miss approximately 87.5-89.8% of all AI citation opportunities. Their content isn't architected to satisfy the granular sub-queries generated during fan-out.

**Action:** Map the 8 expansion types for your target queries. For each primary keyword, generate 20-30 sub-questions covering all 8 types. Structure content to address them via H2/H3 headers.

---

## llms.txt Protocol

A Markdown file at `/llms.txt` that functions as robots.txt for AI language models. Routes LLMs to clean, machine-readable content, bypassing HTML DOM clutter.

### Specification

| Markdown Element | Function |
|-----------------|----------|
| `#` (H1) | Main project/brand name |
| `>` (Blockquote) | One-sentence company summary |
| `##` (H2) | Content categories ("Core Resources," "Pricing," "API Docs") |
| `- [text](url)` | Links to clean `.md` documentation files (not HTML pages) |
| `` `code` `` | Technical specs, API endpoints, structured examples |

### Implementation

1. Create `/llms.txt` in root directory with your most critical pages mapped as Markdown links
2. Optionally create `/llms-full.txt` containing full documentation in a single machine-readable text file (for models with large context windows)
3. Serve as `text/plain` or `text/markdown`
4. Link to `.md` versions of pages when possible for maximum fidelity
5. Keep the standard file concise (fits typical AI context windows); the full file can be exhaustive

### Example Structure

```markdown
# CapVeri
> Tenant-side forensic CAM audit platform that detects landlord overcharges.

## Core Product
- [How It Works](/docs/how-it-works.md): Upload lease + reconciliation, get audit report
- [Pricing](/docs/pricing.md): Credit packs starting at $199

## Resources
- [CAM Audit Guide](/docs/cam-audit-guide.md): Complete guide to common area maintenance audits
- [Glossary](/docs/glossary.md): CAM, NNN, pro-rata share, gross-up definitions
```

---

## Core Web Vitals 2.0 and the INP Mandate

CWV 2.0 (early 2026) brought stricter, more dynamic measurement. Pages failing these thresholds are excluded from AI Overview snippets entirely.

### Thresholds

| Metric | Good | Description |
|--------|------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Hero element load time |
| **INP** (Interaction to Next Paint) | < 200ms | Full-lifecycle responsiveness (replaced FID) |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability |

### Critical Implications

- Pages at position 1 are 10% more likely to pass all CWV thresholds vs position 9
- Legacy SPAs with heavy client-side rendering frequently fail INP due to JavaScript execution overhead
- If AI crawlers perceive a page as sluggish, it's excluded from AI Overviews entirely (not just demoted)
- Modern architecture must use edge-side logic, SSR, or streaming to cut server overhead

### Action Items

1. Audit JavaScript payload - cut client-side rendering where possible
2. Shift to SSR or edge rendering for content pages
3. Test INP in the field (not just lab) via Chrome UX Report
4. Eliminate layout shifts from lazy-loaded images, ads, and dynamic content

---

## 2026 Search Quality Rater Guidelines (SQRG)

The 182-page SQRG update (September 2025 / January 2026) provides Google's blueprint for what algorithms reward.

### Expanded YMYL (Your Money or Your Life)

Now explicitly covers:
- **Groups of People:** Marginalization, systemic discrimination, gender identity, immigration status, caste, victims of violent events
- **Government, Civics, and Society:** Elections, civic institutions, institutional trust (added September 2025)

Content on these topics without expert consensus, objective tone, and authoritative reputation is algorithmically suppressed.

### Scaled Content Abuse (3 "Lowest Quality" Triggers)

1. **Low-Effort Generation:** Using AI to produce thousands of pages adding no unique value compared to existing web content
2. **Scraping and Paraphrasing:** Content scraped, paraphrased, translated, or synonymized from a single source without original editorial depth
3. **Content Stitching:** Main content stitched from multiple websites creating disjointed text without a unified, beneficial purpose

### Information Gain Requirement

The evaluation pivots on "Information Gain." If a page merely synthesizes what exists in the top 10 results without introducing:
- Novel data or proprietary research
- Firsthand experience
- Unique multimedia
- Expert commentary

...it is categorized as low-effort filler. Content must provide measurable Information Gain that an LLM cannot already deduce from its training data.

### Reputation Research and Ontological Core

The 2026 SQRG mandates that the specific **author** (not just the website) must have demonstrable expertise in the precise field they're discussing. Implementation:

1. Create detailed author biography pages linked to professional networks, publications, and verified social channels
2. Build off-site entity authority so AI systems find a consistent web-wide trail of expertise
3. Demonstrate first-hand experience: proprietary data, original case studies, photographic evidence of actual use
4. Use Person schema linking authors to their broader digital footprint

---

## Prompt Research: Replacing Keyword Research

Traditional keyword volume metrics are increasingly obsolete. Prompt Research investigates how and where LLMs gather information for specific conversational scenarios.

### How It Works

1. **Generate decision-stage queries:** Map how users phrase multi-step prompts, not just keywords. Search sessions are now sequential (initial question, review AI response, apply intent modifiers like "compare to X" or "limitations for solo use")
2. **Group into prompt clusters:** Organize queries by decision stage, not search volume
3. **Map citation sources:** For each prompt cluster, determine which domains the AI routinely cites as ground truth
4. **Identify gaps:** If AI cites third-party review sites or forums instead of your domain, you must secure presence on those specific URLs

### Key Difference from Keyword Research

| Keyword Research | Prompt Research |
|-----------------|----------------|
| Short-tail queries (3-4 words) | Conversational prompts (70-80 words avg) |
| Search volume as primary metric | Citation frequency as primary metric |
| Optimize for SERP position | Optimize for source-worthiness |
| One query = one search | One query = 8-28 sub-queries via fan-out |
| Monthly refresh cycle | Continuous monitoring of AI outputs |

---

## Off-Site Entity Authority

AI models synthesize answers from thousands of sources. A brand's presence on third-party platforms is a primary citation factor. Brands combining on-site GEO with proactive off-site engagement are 6.5x more likely to be cited.

### Reddit Strategy

Reddit threads index within hours (freshness over backlinks). LLMs heavily weight community discussions due to perceived authenticity.

**Account-Level Authority Signals:**
- Maintain genuine, verified expert presences in niche subreddits
- Earn expert flair (e.g., "Verified CPA" in r/personalfinance) - both human moderators and AI systems recognize these as trust markers
- Comment within the **first 2 hours** of a thread's creation - statistically far more likely to accumulate upvotes and rise to the top, ensuring ingestion by AI crawlers

**What doesn't work:**
- Marketing spam and overt self-promotion (AI detects and penalizes this)
- Thin comments without substance
- Ignoring negative brand mentions in archival threads (AI scrapes negative sentiment and repeats it)

### Digital PR for Entity Validation

Modern Digital PR focuses on Entity Validation, not raw PageRank:

1. **Press releases** via verified channels (e.g., AB Newswire) create documented records of legitimate business activity
2. When syndicated by high-authority publications, they create **citation consistency** across the web
3. This consistency helps LLMs definitively understand what a business does, reinforcing its Knowledge Graph position
4. Target placements on .gov, .edu, and peer-reviewed domains for 132% AI visibility increase

---

## Advanced Schema for AI Knowledge Graphs

Schema has evolved from generating rich snippets to serving as the foundational vocabulary for AI reasoning.

| Schema Type | 2026 Priority |
|-------------|--------------|
| **Organization & Person** | Bedrock of entity recognition. Establishes brand and authors as Knowledge Graph nodes supporting E-E-A-T |
| **Product & Offer** | Feeds Google's Shopping Graph for real-time pricing/availability in AI synthesis |
| **Review & AggregateRating** | Packages customer sentiment for generative summarization |
| **FAQ & HowTo** | Exact Q&A format AI Overviews prefer to extract |
| **Speakable** | Identifies content for audio playback via voice assistants (Siri, Alexa) |
| **SearchAction** | Enables sitelinks search boxes for direct in-SERP search |

---

## 3-Tier Reporting Model for AI Search

Traditional rank tracking is insufficient. Measure across the full lifecycle:

### Tier 1: Input Metrics
- Content update velocity and freshness
- Cosine similarity between content vectors and target intent
- Entity density (15+ recognized entities per 1000 words)
- Information Gain score vs existing top results

### Tier 2: Channel Metrics (Core of "New SEO")
- **Citation Frequency:** How often cited in AI answers
- **Share of Voice:** Your citations vs competitors in LLM outputs
- **AI-referred traffic:** GA4 attribution from chat.openai.com, perplexity.ai, gemini.google.com

### Tier 3: Performance Metrics
- Qualified traffic from AI referrals (converts 5x higher than traditional organic)
- Pipeline generation and revenue influence
- Brand sentiment in AI outputs (positive recommendation vs neutral mention)

### Google Search Console AI Configuration (2026)
GSC now supports natural language prompts in the Performance report:
- "Show me bottom of funnel searches on mobile over the last six months"
- "Show me queries with local intent like 'near me'"
- System applies filters automatically (query, page, country, device, date range)

---

## Multi-Modal Content Requirements

Text-only pages are algorithmically disadvantaged. Pages combining text + images + video see 156% higher selection rate. With schema markup: up to 317% more citations.

### Requirements
- **No stock photography** - LLMs recognize commodity imagery and attribute zero authority
- **Original infographics and data visualizations** that visually validate written claims
- **60-90 second instructional videos** embedded adjacent to relevant text blocks
- **Machine-readable transcripts** immediately below videos (dual-format allows AI to verify multimodal signals while extracting text via RAG)
- **Hyper-descriptive alt-text** on all images with VideoObject/ImageObject schema

---

## Strategic Roadmap (5 Phases)

### Phase 1: Baseline Audit and Prompt Mapping
- Execute prompt research for your sector (not keyword research)
- Audit citation share and sentiment across AI platforms
- Calculate your Topical Coverage Gap

### Phase 2: AI-Optimized Topic Clusters
- Define pillars via semantic intent (20-30 sub-questions per theme)
- Engineer passages of 134-167 words (optimal for AI extraction)
- Use Semantic Triples (Subject-Predicate-Object) - eliminate marketing fluff
- Target 80%+ subtopic coverage to push cosine similarity above 0.88

### Phase 3: Technical Infrastructure
- Deploy CWV 2.0 optimizations (especially INP)
- Implement llms.txt protocol
- Layer nested schema markup (Organization, Person, FAQ, VideoObject, ImageObject)
- Embed multi-modal assets

### Phase 4: E-E-A-T and Off-Site Entity Reinforcement
- Fortify author entities with comprehensive bios and external validation
- Execute digital PR targeting .gov/.edu/peer-reviewed placements
- Deploy verified experts in industry subreddits (first 2 hours, earn flair)

### Phase 5: Continuous Iteration
- Use GSC AI configuration to rapidly slice performance data
- Iterate based on Information Gain - inject novel data, fresh expert commentary, new multimedia
- Monitor AI citation share monthly; update content quarterly minimum

---

## Related Skills

- **ai-seo**: GEO mechanics, RAG internals, semantic chunk engineering, 7 ranking determinants, platform-specific biases
- **marketing-skills:seo-audit**: Traditional technical SEO audit checklists
- **marketing-skills:schema-markup**: Structured data implementation
- **marketing-skills:site-architecture**: Page hierarchy, URL structure, internal linking
- **marketing-skills:programmatic-seo**: Building SEO pages at scale
- **marketing-skills:content-strategy**: Planning what content to create
