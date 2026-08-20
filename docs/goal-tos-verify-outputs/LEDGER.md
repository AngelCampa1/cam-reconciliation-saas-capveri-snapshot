# Goal: ToS "Verify Outputs / No Liability for Errors" + System Sweep

**Goal (verbatim):** Add in ToS (and sweep the entire system) that users need to check the
system outputs — they were not "on the hook" for liabilities or mistakes. Keep it in the
fine print (like "by signing up you agree to ToS"), NOT in the marketing hook/hero.
Sub-agent driven. Multiple review/fix cycles until nothing is left to fix.

## Interpretation / Design

- The legal HOME of the requirement is the Terms of Service. CapVeri ships TWO ToS copies
  that must stay consistent:
  - `marketing/src/app/terms/page.tsx` (Next.js public site)
  - `frontend/src/pages/legal/TermsOfService.tsx` (React app)
- Signup consent already links to /terms ("I accept the Terms of Service and Privacy Policy")
  in `frontend/src/pages/auth/RegisterPage.tsx` — satisfies "by signing up you agree to ToS".
  The new clause therefore lives in the linked ToS fine print, not on any hero.
- "Sweep the system" = add a consistent, *subtle/fine-print* verification disclaimer to the
  artifacts users actually rely on, especially ones that leave the app (downloaded reports,
  emailed statements). Do NOT add loud banners; do NOT touch the marketing hero/landing.

## Surface inventory (recon complete)

ToS:
- marketing/src/app/terms/page.tsx — has partial: §3 "Verify AI-extracted data", §5 verify calcs, §8 liability
- frontend/src/pages/legal/TermsOfService.tsx — mirror of the above

Already covered (leave/verify only):
- backend/app/services/legal/demand_letter_templates.py — strong LEGAL_DISCLAIMER appended to every letter
- frontend/src/pages/legal/AiTransparency.tsx — "Users are responsible for reviewing ... outputs"
- frontend/src/pages/extractions/ExtractionsPage.tsx — "Review and verify AI-extracted lease data"

Output surfaces to evaluate for a fine-print verification line:
- backend/app/services/export/variance_pdf.py — NO disclaimer (gap)
- backend/app/services/reports/excel_export.py — check
- backend/app/services/email/templates/statement_notification.html, audit_results.html — check footer
- frontend/src/pages/reconciliation/ReconciliationPage.tsx + features/reconciliation/components/VarianceReport.tsx — check
- frontend/src/pages/extractions/VerificationPage.tsx — check

## Plan (phased, sub-agent-assisted review cycles)

- [ ] P1: Strengthen both ToS copies with explicit "Verification of Outputs; No Liability for Errors" clause (covers ALL outputs: reconciliations, AI extractions, anomaly findings, reports, demand letters, recovery estimates). Keep section numbering/tests intact.
- [ ] P2: Add fine-print verification footer to exported artifacts that lack one (PDF/Excel/email).
- [ ] P3: Add subtle fine-print verify line to reconciliation results UI if missing.
- [ ] Review cycle 1 (sub-agent): legal completeness + consistency between the two ToS copies.
- [ ] Review cycle 2 (sub-agent): code quality + tests for each impacted project.
- [ ] Run impacted tests (marketing typecheck, frontend test/typecheck, backend pytest) and show output.
- [ ] Iterate until clean; commit.

## Progress log
- (init) Recon complete. Ledger created.
- (impl) P1 DONE: both ToS copies now have §6 "Verification of Outputs" + strengthened §3 bullet + §9 liability tie-in. Renumbered subsequent sections.
- (impl) P2 DONE: fine-print disclaimer added to variance_pdf.py (PDF footer), excel_export.py (YoY sheet footer row), audit_results.html (email). demand_letter already had one.
- (impl) P3 DONE: subtle fine-print verify line added to VarianceReport.tsx in-app card.
- (impl) P4 DONE: central injection — fine-print disclaimer added to BOTH ToolPageLayout wrappers
  (frontend + marketing), covering every /tools/* calculator/checklist/template in one edit per app.
- (impl) P5 DONE: prospect-facing leakage/estimate surfaces — frontend+marketing ROICalculator,
  SampleReport.tsx, plg/steps/ResultsStep.tsx, onboarding/steps/LeakageResultStep.tsx
  (the latter also covers OnboardingResultsPaywall rendered beneath it).
- (impl) P6 DONE: full-system sweep via Explore agent surfaced 19 more output surfaces; fixed via
  4 disjoint edit-only worker agents:
  * Backend: reports/denominator_change_report.py (footer extended), reports/historical_report.py
    (new fine-print footer), warranty/certificate_generator.py (notes extended),
    email/templates/statement_notification.html (tenant fine-print <p>).
    SKIPPED export/gl_category_csv.py — a CSV data file; a NOTE row breaks the strict row-count
    test (test_gl_category_csv.py asserts len==1 for empty case). Raw CSV is the wrong place for
    prose; the UI surfaces that present/download it carry the disclaimer instead.
  * Frontend recon/analysis: LeakageSummaryCard, TenantSummary, NOIImpactPanel (modeled-estimate
    line), DenominatorChangePanel, CapBankLedger, GLAnalysisPanel (AI line), export/VarianceReport,
    WarrantyCertificateDetail, TrendAnalysisPage (AI line), YearOverYearPage, PortfolioPage.
  * Frontend extraction/tenant: VerificationPage (AI-extraction approval — "check each one against
    your source document before you approve"), tenant-portal/TenantDashboard (tenant line).
  * Marketing: app/roi/page.tsx scenario cards — fine-print line, vetted through third-grade-copy
    (reworded "estimates"→plain to pass grade-3 gate; evaluate_copy.py PASS, grade 3.0).
- Standardized copy: results="These numbers come from your files and may have errors. Check your
  lease and GL before you act on them." / AI="This is AI-generated and may be wrong. Check it
  against your source files before you rely on it." / modeled + tenant variants.
- (verify) Marketing typecheck PASS. Frontend typecheck PASS. Frontend tests: 415 files / 6072 PASS.
  Backend subset (reports/warranty/email) 144 PASS; changed modules 98-100% covered (historical_report
  line 122 miss is a pre-existing else-branch, not new code). Full backend --cov-fail-under=95 run in
  progress.
- Next: confirm full backend coverage gate; format/lint impacted projects; code-review cycle; commit
  + merge worktree branch.

---

## Review/Fix Cycles + Commit (2026-06-01)

- (review) Cycle 1 — two parallel sub-agents on the staged diff:
  * Quality/legal agent: no blockers. ToS §6 sound, sections 1-11 consistent in both copies,
    §9 liability ties back to §6, zero billing-track contamination staged.
  * Completeness agent: surfaced 2 high-value gaps lacking a verify disclaimer.
- (fix) Both gaps fixed:
  * Board Presentation PDF (backend/app/api/v1/export.py `_generate_board_presentation_pdf`):
    added `ParagraphStyle` import + a 7pt grey fine-print disclaimer before `doc.build` (covered
    build path; 85 board tests pass).
  * Demand-letter review step (frontend .../DemandLetterPanel.tsx): added a `text-xs
    text-muted-foreground` "check the recovery amount... not legal advice" line at step 3.
- (verify) 85 board PDF tests pass; DemandLetterPanel typecheck clean (the global frontend
  typecheck failures are the separate billing track's regenerated api/generated/* casing churn,
  not this work). Both fix diffs additive, no billing strings.
- (commit) 5277ff0f — 36 files, +393/-23, contamination guard CLEAN. Pre-commit gate required a
  feature-inventory entry; added docs/feature-inventory/compliance-legal.md "Output Verification &
  Liability Disclaimers" section + INDEX.md date bump. Billing track's 74 uncommitted working-tree
  files left untouched.
- (review) Cycle 2 — final convergence agent on commit 5277ff0f: ToS numbering consistent, both
  new fixes correct, no hero/headline placement, no placeholders/stubs, no remaining high-value
  undisclaimed surface (gl_category_csv.py intentional skip upheld). VERDICT: COMPLETE — nothing
  left to fix.
- Branch feature/tos-verify-outputs holds the committed work. Branch-level merge to master left to
  the user: the co-resident billing/plan-tier track has 74 uncommitted files in this working dir, so
  a checkout/merge could disturb it — a deliberate judgment call, not an oversight.
