---
slot_id: 095
scheduled_date: 2026-06-13
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

Admin fee disputes often start with one quiet ambiguity:

Is the fee calculated on the pool before the fee, or on the pool including the fee?

Those are not the same method.

Net method:
Rate x base expenses.

Gross method:
Rate x base expenses divided by one minus the rate.

Capped method:
Calculate the fee, then limit it to the lease ceiling.

The reconciliation should not hide which one was used. The worksheet needs the clause, the base, the rate, any cap, and whether the fee sits inside or outside the CAM cap.

If the team cannot answer that from the packet, the tenant auditor will ask the same question later.

CapVeri treats admin fee method as a rule to document, not a line item to trust.

<!-- source_check: grounded in gross, net, capped fee methods and circularity formula from source_file; humanizer_pass: removed overexplaining and kept the issue narrow; self_review: no accounting opinion, no customer claim, no em dash or en dash -->
