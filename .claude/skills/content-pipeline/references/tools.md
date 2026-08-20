# Content Pipeline Tools Reference — CapVeri

## Avatar / Video Generation Platforms

| Platform | Core Strength | API Architecture | Best For |
|---|---|---|---|
| **Zoice** | Photorealistic personal clones, all-in-one ecosystem | Native dashboard, no external orchestration needed | Founder-led brand (Angel), daily social media, personal authority building |
| **HeyGen** | Emotionally expressive Avatar IV, real-time translation (175+ languages) | REST API, native Zapier + Make.com integrations | High-volume automated social clips, programmatic cold outreach videos |
| **Synthesia** | Enterprise governance, SOC 2 Type II, brand controls | Enterprise API for bulk generation | Corporate communications, internal L&D, standardized content |
| **Tavus** | Low-latency real-time two-way interaction | CVI API, webhook triggers | Real-time sales bots, interactive FAQ agents, dynamic support |
| **DeepBrain AI** | Broadcast-quality, news-anchor realism | Enterprise API, embeddable SDKs | High-fidelity corporate announcements |

**CapVeri recommendation**: HeyGen for automation pipelines (best API + Make.com integration). Zoice if Angel wants a photorealistic personal clone for daily brand content.

---

## B-Roll / AI Video Generation

For dynamic cutaway footage to layer over avatar talking-head:

| Platform | Strength | Best Use |
|---|---|---|
| **Google Veo 3.1** | Cinematic 4K realism, atmospheric lighting, deep scene understanding | High-quality product explainer visuals, office/document B-roll |
| **OpenAI Sora 2** | Object permanence, complex camera movements, physical fidelity | Conceptual / abstract sequences, dynamic scenes |
| **Kling 2.6** | Human motion accuracy, hand/face retention, up to 3 min continuous | Active scenes, people walking, product demonstrations |
| **Higgsfield.ai / SotaVideo** | Aggregator — routes to Veo, Sora, Kling based on prompt | Single interface for all engines, timeline editing |

**Workflow**: LLM generates B-roll text prompts alongside scripts → middleware routes to appropriate engine → B-roll merged with avatar footage via Shotstack or Upload-Post FFmpeg.

---

## Middleware Orchestration Comparison

| Platform | Architecture | Pricing Model | When to Use |
|---|---|---|---|
| **Zapier** | Linear, easy | Per-task (scales poorly for loops) | Simple linear triggers (1 article → 1 video), non-technical teams |
| **Make.com** | Visual canvas, native arrays/iterators | Per-operation (cost-stable at scale) | Batch processing (1 article → 5 videos), AI decision trees, most B2B SaaS |
| **n8n** | Code-first, self-hostable | Fixed infra cost if self-hosted | Developer-led teams, strict data privacy, custom logic, maximum flexibility |

**Make.com is recommended for CapVeri** at growth stage: handles the 5-video-per-article loop natively, native HeyGen + OpenAI + HTTP nodes, visual debugging, reasonable cost at 50–200 articles/month.

**n8n** if you have a developer and want to self-host (eliminates per-operation costs at scale and keeps all data on your infrastructure).

---

## Unified Social Media Publishing APIs

| Platform | Strength | Platforms Covered | Notes |
|---|---|---|---|
| **Upload-Post.com** | Auto-formats via FFmpeg, single API call, native n8n + Make.com nodes | TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest | Best choice for most automated pipelines. Handles OAuth, rate limits, codec compliance. |
| **Blotato** | Deep n8n community node support, pulls from Google Drive by schedule | TikTok, YouTube Shorts, Instagram, Facebook | Best if using n8n + Google Drive as asset store |
| **Ayrshare** | Rich SDK (Python + JS), auto-scheduling, URL shortening, 15+ networks | 15+ including Telegram, Discord | Best for embedding social publishing in a SaaS product |

**Never use native platform APIs directly** for multi-platform publishing — TikTok API approval takes 4–8 weeks, Instagram enforces rate limits, YouTube has separate quota systems. Unified APIs absorb all of this.

---

## B-Roll Aggregator Platforms

| Platform | Function |
|---|---|
| **Higgsfield.ai** | Cinema Studio with keyframing + timeline, routes to Veo/Sora/Kling |
| **Vadoo AI** | Multi-engine aggregator, prosumer pricing |
| **SotaVideo** | Specialized in Sora 2 + Veo 3 dual-engine workflows |

---

## Prompt Engineering for Script Generation

The LLM system prompt for article → video script conversion:

```
You are an expert video script writer for CapVeri, a forensic CAM audit SaaS.

TASK: Transform the following article into 5 separate 5-minute video scripts.

CONSTRAINTS:
- Maximum 150 spoken words per script
- Begin each script with a scroll-stopping hook (first 3 seconds)
- Use the Problem-Agitate-Solve structure
- No corporate jargon, no intro clichés ("Hi, I'm...")
- Each script must stand alone (no references to other scripts)
- End each script with a single, specific CTA

OUTPUT FORMAT for each script:
- Hook (≤15 words)
- Script body (≤135 words)
- On-screen text suggestions (3-5 key phrases)
- B-roll visual prompt (2 sentences describing the ideal cutaway footage)
- Caption (≤100 chars) with 5 hashtags

ARTICLE:
[article text]
```

---

## Cost Estimates (Monthly)

### Bootstrapped (~10 articles/month → 50 videos)

| Tool | Monthly Cost |
|---|---|
| Claude API (script generation) | ~$5–15 |
| HeyGen Creator | $29 (60 min video) |
| Make.com Core | $9 |
| Upload-Post.com | $29–49 |
| **Total** | **~$75–100/month** |

### Growth (~50 articles/month → 250 videos)

| Tool | Monthly Cost |
|---|---|
| Claude API | ~$30–80 |
| HeyGen Business | $89 (180 min video) |
| Make.com Pro | $29 |
| B-roll generation (Kling/Veo via SotaVideo) | ~$50–100 |
| Upload-Post.com | $79–129 |
| **Total** | **~$280–430/month** |

### Scale (~200 articles/month → 1,000 videos)

Consider n8n self-hosted to eliminate Make.com costs. HeyGen Enterprise for volume pricing. Budget ~$800–1,200/month for full stack.

---

## End-to-End Pipeline Data Flow

```
CMS Publish Event (Webflow webhook)
    ↓
Make.com / n8n — Extract article text
    ↓
Claude API — Generate 5 scripts + metadata + B-roll prompts
    ↓
[Loop × 5 scripts]
    ├─ HeyGen API → Talking-head avatar video (per script)
    └─ SotaVideo/Veo API → B-roll footage (per script)
    ↓
Wait for both renders (webhook polling)
    ↓
Shotstack / Upload-Post FFmpeg — Merge avatar + B-roll
    ↓
Upload-Post.com API — Publish to TikTok + Reels + YouTube Shorts + LinkedIn
    ↓
Log to Airtable — Track publish times, URLs, platform status
    ↓
Schedule: 1 video/day over 5 days (optimal cadence)
```
