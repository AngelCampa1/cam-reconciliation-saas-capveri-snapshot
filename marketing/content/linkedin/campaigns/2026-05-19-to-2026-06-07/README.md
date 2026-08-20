# CapVeri LinkedIn company-page campaign

Schedule: 2026-05-19 through 2026-06-07
Cadence: 15 posts per day, every day
Total posts: 300
Timezone: America/Chicago

## Files

- `posts/`: individual markdown posts with frontmatter.
- `content-matrix.csv`: scheduling matrix and source references.
- `postiz-import.csv`: CSV import artifact.
- `postiz-import.json`: JSON import artifact.
- `claim_audit.csv`: source and claim review table.
- `qa_report.json`: automated count, style, and fabrication-risk audit.

## Guardrails

- Company-page voice, not founder personal voice.
- No em dashes.
- No fabricated client stories, customer quotes, customer counts, or scarcity counters.
- Numerical examples are labeled as examples and are not presented as observed customer outcomes.
- CapVeri positioning is limited to export-based CAM verification, deterministic lease-term calculation, exception review, and traceable tenant-level support.

## Regenerate

Run:

```bash
cd marketing/content/linkedin/campaigns/2026-05-19-to-2026-06-07
python generate_campaign.py
```
