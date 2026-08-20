# CapVeri Claim Bank

## export-qa: export-stack

- Source file: `marketing/content/resources/export-guide.mdx`
- Source URL: https://www.capveri.com/resources/export-guide
- Safe fact: A CAM review can start from rent roll, full-year GL detail, and recovery or billing exports.
- Review check: Match property, period, tenant, and charge codes before math starts.
- Risk wording: If the files do not tie, every variance review gets noisy.

## yardi: yardi-exports

- Source file: `marketing/content/resources/export-cam-yardi-voyager.mdx`
- Source URL: https://www.capveri.com/resources/export-cam-yardi-voyager
- Safe fact: Recovery Analysis, GL Analytics, and Rent Roll with Lease Charges are core Yardi exports.
- Review check: Use detail-level output for the same property and period.
- Risk wording: A summary report can hide the row that caused the charge.

## mri: mri-period

- Source file: `marketing/content/resources/export-cam-mri.mdx`
- Source URL: https://www.capveri.com/resources/export-cam-mri
- Safe fact: Recovery Reconciliation, GL Transaction Detail, rent roll, and Tenant Billing History are safe MRI lanes.
- Review check: Confirm entity, property, period, and tenant ID before export review.
- Risk wording: One wrong period can make a clean statement look wrong.

## gross-up: variable-only

- Source file: `marketing/content/resources/cam-gross-up-calculation-guide.mdx`
- Source URL: https://www.capveri.com/resources/cam-gross-up-calculation-guide
- Safe fact: Variable expenses can be grossed up. Fixed costs need separate treatment.
- Review check: Sort taxes, insurance, utilities, janitorial, and service costs before applying a factor.
- Risk wording: Grossing up fixed costs can overstate the recovery pool.

## pro-rata: denominator

- Source file: `marketing/content/resources/pro-rata-share-calculation.mdx`
- Source URL: https://www.capveri.com/resources/pro-rata-share-calculation
- Safe fact: Tenant RSF over the lease-defined denominator drives the CAM share.
- Review check: Store lease denominator, building RSF, excluded area, component area, or usage support.
- Risk wording: A percentage alone is hard to defend later.

## caps: cap-bank

- Source file: `marketing/content/resources/cumulative-vs-non-cumulative-cam-caps.mdx`
- Source URL: https://www.capveri.com/resources/cumulative-vs-non-cumulative-cam-caps
- Safe fact: Cumulative caps can bank unused capacity. Non-cumulative caps reset each year.
- Review check: Read the cap base, cap rate, and controllable cost language.
- Risk wording: The wrong cap type can change several years of billing.

## admin-fees: fee-base

- Source file: `marketing/content/resources/admin-fee-calculation-methods.mdx`
- Source URL: https://www.capveri.com/resources/admin-fee-calculation-methods
- Safe fact: The method, base, rate, cap interaction, and lease clause should be traceable.
- Review check: Confirm whether the fee applies before or after exclusions.
- Risk wording: A circular fee can make a clean pool look off.

## deterministic-math: same-inputs

- Source file: `marketing/content/resources/deterministic-vs-ai-cam.mdx`
- Source URL: https://www.capveri.com/resources/deterministic-vs-ai-cam
- Safe fact: AI can help read documents. Deterministic rules should calculate dollars.
- Review check: Humans verify extracted lease terms before they affect money.
- Risk wording: A plausible answer is not enough for tenant billing.

## packet: pre-send

- Source file: `marketing/content/resources/cam-presend-checklist.mdx`
- Source URL: https://www.capveri.com/resources/cam-presend-checklist
- Safe fact: GL, invoices, rent roll support, lease abstracts, worksheets, and fee support belong together.
- Review check: Review the support before the statement goes out.
- Risk wording: Late support review turns small questions into long disputes.

## tenant-questions: document-demand

- Source file: `marketing/content/resources/respond-tenant-documentation-demand.mdx`
- Source URL: https://www.capveri.com/resources/respond-tenant-documentation-demand
- Safe fact: The response should track lease audit rights, record scope, redactions, delivery, and follow-up.
- Review check: Confirm what the lease allows before sending files.
- Risk wording: A messy response can make a normal review feel adversarial.

## boma: parallel-proof

- Source file: `marketing/content/resources/boma-2024-implementation-guide.mdx`
- Source URL: https://www.capveri.com/resources/boma-2024-implementation-guide
- Safe fact: Measurement inputs should be checked against the lease and source records.
- Review check: Run old and new inputs side by side before billing changes.
- Risk wording: A label alone does not prove the charge is right.

## leakage: recovery-gap

- Source file: `marketing/content/resources/cam-leakage-guide.mdx`
- Source URL: https://www.capveri.com/resources/cam-leakage-guide
- Safe fact: Leakage can come from gross-up errors, missed cap adjustments, and pro-rata mistakes.
- Review check: Compare lease terms to actual billings tenant by tenant.
- Risk wording: Small missed rules can repeat across years.
