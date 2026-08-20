---
slot_id: 050
scheduled_date: 2026-06-10
scheduled_time: "10:00"
timezone: America/Chicago
platform: linkedin
account: capveri
pillar: cam-math
format: text-short
source_url: https://www.capveri.com/resources/admin-fee-calculation-methods
source_file: marketing/content/resources/admin-fee-calculation-methods.mdx
review_status: drafted_humanized_self_reviewed
---

Admin fee circularity is easy to miss because the rate looks right.

The problem is the base.

If the lease defines the fee as a percentage of total CAM expenses and total CAM includes the fee, the fee depends on a number that includes itself.

That needs an explicit method.

Otherwise the spreadsheet may quietly do something else:

Calculate on the pool before the fee.
Calculate on the pool after the fee.
Stop after one pass.
Apply a cap late.

Same rate. Different answer.

The backup should show the method, not just the percentage.

<!-- source_check: grounded in circularity problem and gross versus net methods from source_file; humanizer_pass: made the math issue readable without hype; self_review: no accounting opinion, no fake result, no em dash or en dash -->
