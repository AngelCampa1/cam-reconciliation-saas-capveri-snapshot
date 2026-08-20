# Example LinkedIn Posts - CapVeri Voice Reference

These are the canonical voice anchors. Writer agents should match this quality and voice.

---

## Example 1: text-short / cam-math / stat-callout

SOURCE: https://www.capveri.com/blog/cam-reconciliation-errors

---

On a $200,000 CAM pool, a gross-up factor of 1.03 adds $6,000 in charges that don't belong there.

That's not a rounding error. That's a billing mistake that survives for years before a tenant auditor finds it.

The math behind it is simple: when actual occupancy already meets or exceeds the target, the gross-up factor should be exactly 1.0. Any factor above 1.0 in that situation means the building is being inflated past 100% occupancy. Which isn't possible.

Yardi or MRI will apply whatever factor you feed it. Neither one checks whether actual occupancy already cleared the threshold.

The fix is a two-column check at the start of every reconciliation cycle: target occupancy vs. actual occupancy. If actual >= target, the factor gets set to 1.0 before the run.

We've seen this error active across Q4 statements for three or four consecutive years on the same portfolio. Nobody flagged it because the numbers ran clean through the billing system.

#camreconciliation #cre #propertyaccounting

---

## Example 2: text-long / anti-integration / framework

SOURCE: https://www.capveri.com/blog/automate-cam-without-replacing-yardi

---

Replacing Yardi is not the answer to broken CAM reconciliation.

Most CAM problems are not ERP problems. They're validation problems. Yardi calculates exactly what you've configured it to calculate. The question is whether that configuration still matches what 47 lease agreements say.

Here's the workflow that actually fixes it, without touching your ERP:

Step 1. Export your GL as CSV.
Every major ERP (Yardi, MRI, RealPage, AppFolio) produces a standard GL export. No API credentials. No IT department. The same report your property accountant already pulls for year-end close.

Step 2. Run an independent calculation from the lease terms.
An independent layer reads the raw GL data and recalculates from scratch, applying each tenant's actual lease terms: gross-up threshold, cap type and percentage, exclusion list, pro-rata denominator. It doesn't inherit your ERP configuration. It starts from the lease.

Step 3. Compare outputs.
Any difference between the ERP's output and the independent calculation surfaces with: the specific tenant, the specific calculation element, the dollar amount, and the lease clause that supports the correct number.

Step 4. Correct or adjust.
Either update the ERP configuration to match the lease, or generate corrected statements from the independent calculation directly.

What stays the same: Yardi, MRI, your GL structure, your IT setup, your existing workflow.

What changes: you find configuration drift before statements go out, not after tenants dispute.

The IT director objection to ERP integrations is legitimate. CSV exports sidestep it entirely. A CSV is a CSV. No authentication. No API contracts. No maintenance burden when the ERP vendor changes their endpoint.

#yardicam #camreconciliation #propertymanagement

---

## Example 3: carousel / cam-math / carousel-outline

SOURCE: https://www.capveri.com/resources/cam-gross-up-calculation-guide

---

SLIDE 1:
The gross-up formula that breaks CAM statements
(And the two-line check that catches it)

SLIDE 2:
What gross-up is supposed to do
Normalize expenses to what the building costs at full occupancy.
Tenants in a half-empty building shouldn't benefit from artificially low costs.

SLIDE 3:
The formula
factor = target_occupancy / actual_occupancy
Apply factor to variable expenses only (not fixed costs like insurance or taxes).

SLIDE 4:
Where it goes wrong
When actual occupancy >= target, the factor should be 1.0.
If it's above 1.0, you're billing past 100% occupancy. That's not possible.

SLIDE 5:
Dollar impact
$200K CAM pool. Factor of 1.03.
Result: $6,000 in charges that don't belong there.
Multiplied across 8 tenants and 3 years: material.

SLIDE 6:
Fixed costs that should NEVER be grossed up
Property taxes. Insurance. Fixed-contract maintenance. Security.
These don't scale with occupancy. Grossing them up is a lease violation.

SLIDE 7:
The two-line check
1. Is actual occupancy >= target occupancy? If yes, set factor to 1.0.
2. Are all fixed costs excluded from the gross-up pool?
Run this before every reconciliation run.

SLIDE 8:
CapVeri runs this check automatically on every GL export.
Dollar impact per finding. No configuration required.
capveri.com/sample-report

#camreconciliation #grossup #cre

---

## Example 4: poll / engagement

---

SHORT CAPTION:
Curious where the most time actually goes in Q1 CAM reconciliation season.

QUESTION: What takes the most time during CAM reconciliation season?

OPTION A: Chasing missing GL data from the accounting team
OPTION B: Cross-checking lease terms against what's in Yardi/MRI
OPTION C: Responding to tenant questions and disputes
OPTION D: Getting the reconciliation package formatted and out the door

---

## Example 5: video / anti-integration / video-script

SOURCE: https://www.capveri.com/blog/automate-cam-without-replacing-yardi

---

Hook line (say on camera, first 3 seconds):
"You don't need to replace Yardi to fix your CAM reconciliation."

Talking points:
- Most CAM errors aren't ERP errors. They're configuration drift.
- Yardi calculates what you told it to calculate. The lease changed. Yardi didn't.
- The fix: export your GL as CSV, run an independent calculation from the actual lease terms, compare the two outputs.
- No API. No IT project. No implementation consultant. One CSV file.
- What you find: gross-up applied at the wrong threshold, cap rates entered as whole numbers, base years from anomaly years.
- How long it takes: your property accountant can run the comparison in under an hour once the leases are loaded.

Closing line:
"The integration is not the product. The verified output is the product."

ON-SCREEN TEXT (key moments):
- "Yardi calculates what you configured" (over point 2)
- "Export GL as CSV" (over point 3)
- "No API. No IT project." (over point 4)
- "capveri.com" (closing frame)
