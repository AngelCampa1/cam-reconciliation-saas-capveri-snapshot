---
slot_id: 111
scheduled_date: 2026-06-14
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

Name-only matching is fragile in CAM work.

MRI export QA should preserve tenant IDs across the recovery file, rent roll, and billing support whenever possible.

Why it matters:

Tenant names change.
Suite labels drift.
Abbreviations differ between leasing and accounting views.
Move-outs and partial-year tenants create timing noise.

A stable tenant ID makes the export set easier to match before the team starts testing gross-up, caps, or allocations.

This is a matching problem, not a feature problem.

If the final reconciliation uses a tenant-level result, the packet should show how that tenant was matched from source files to calculation output.

That small ID column can reduce a lot of avoidable ambiguity.

<!-- source_check: grounded in MRI rent roll tenant ID requirement and matching risks from source_file; humanizer_pass: avoided generic data-quality language and focused on the tenant match; self_review: no fake outcome, no integration claim, no em dash or en dash -->
