# CapVeri LinkedIn Content - 285-Post Batch

21 days of pre-scheduled LinkedIn content for the CapVeri company page.
Schedule: **Tuesday 2026-05-12 through Monday 2026-06-01**
Cadence: 15 posts/workday, 10 posts/weekend day

## Directory Structure

```
marketing/content/linkedin/
├── README.md - this file
├── strategy.md - full content strategy doc
├── content-matrix.csv - 285-row scheduling + source grid
├── postiz-import.csv - bulk import for Postiz (CSV format)
├── postiz-import.json - bulk import for Postiz (JSON/API format)
└── posts/
    └── YYYY-MM-DD-HHMM-pillar-NNN.md   (285 files)
```

## Importing into Postiz

### Option A - CSV Import

1. Open your Postiz instance.
2. Go to **Bulk Import** (or equivalent in your version).
3. Upload `postiz-import.csv`.
4. Map columns: `date` → Post Date, `time` → Post Time, `content` → Post Body, `hashtags` → Tags.
5. Set platform = LinkedIn, account = CapVeri company page.
6. Review and confirm.

CSV columns: `slot_id, scheduled_date, scheduled_time, timezone, platform, account, content, hashtags, has_limited_offer, pillar, format`

### Option B - JSON / API Import

Use `postiz-import.json` with the Postiz API endpoint:
```
POST /api/posts/bulk
Content-Type: application/json
Authorization: Bearer <your-api-key>
```

Body: the contents of `postiz-import.json`

### Option C - Manual (individual posts)

Each `posts/*.md` file contains full YAML frontmatter + the post body. Copy the body directly into Postiz's composer. The frontmatter tells you the scheduled date/time, pillar, and format.

## Post File Format

```markdown
---
scheduled_date: 2026-05-12
scheduled_time: "08:00"
timezone: America/Chicago
author: capveri
pillar: cam-math
format: text-short
source_url: https://www.capveri.com/blog/cam-reconciliation-errors
cta_url: ""
has_limited_offer: false
hashtags: [camreconciliation, cre, propertyaccounting]
media_brief: ""
---

Post body here...
```

## Regenerating Import Files

If you edit individual posts, regenerate the import files:

```bash
cd marketing/content/linkedin
python build_postiz_import.py
```

## 80OFF Posts

11 posts reference the 80OFF promo code (80% off the first year, first 300 redemptions).
Filter: `has_limited_offer: true` in frontmatter, or `has_limited_offer` column = `true` in the CSV.
When the offer closes, set `has_limited_offer: false` on any unscheduled posts, or delete the 80OFF line from the post body before publishing.

## Content Pillars

| Pillar slug | Description | Count |
|---|---|---|
| cam-math | CAM calculation explainers, errors, formulas | 99 |
| war-stories | Audit findings, billing disputes, dollar impacts | 42 |
| anti-integration | Anti-ERP-replacement POV, CSV-first workflow | 42 |
| erp-workarounds | Yardi/MRI/RealPage-specific tips | 30 |
| founder | CapVeri founder perspective (company-voiced) | 21 |
| engagement | Polls, open questions | 21 |
| product | Soft product CTAs, 80OFF offer | 15 |
| industry-news | BOMA 2024, SB-1103, vacancy trends | 15 |
