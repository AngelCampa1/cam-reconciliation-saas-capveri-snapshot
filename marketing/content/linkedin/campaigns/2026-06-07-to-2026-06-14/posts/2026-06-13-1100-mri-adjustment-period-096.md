---
slot_id: 096
scheduled_date: 2026-06-13
scheduled_time: "11:00"
timezone: America/Chicago
platform: linkedin
account: capveri
pillar: erp-workarounds
format: text-short
source_url: https://www.capveri.com/resources/export-cam-mri
source_file: marketing/content/resources/export-cam-mri.mdx
review_status: drafted_humanized_self_reviewed
---

An MRI recovery report can run correctly and still miss the close.

One common reason: adjustment periods.

If period 13 or 14 belongs in the reconciliation year, the GL Transaction Detail export has to include it. Otherwise the recovery file, the GL support, and the financials can all tell slightly different stories.

That is not a cap formula problem.

It is an export scope problem.

The practical check is simple enough to miss:

Same entity.
Same property.
Same period.
Adjustment periods handled intentionally.
Detail-level recovery output.
Tenant IDs present on the rent roll.

Only after those checks pass should the team argue about allocations, gross-up, or caps.

<!-- source_check: grounded in MRI export stack, period 13 or 14 treatment, and QA sequence from source_file; humanizer_pass: kept operator language and avoided MRI blame framing; self_review: no fake system behavior, no API or integration claim, no em dash or en dash -->
