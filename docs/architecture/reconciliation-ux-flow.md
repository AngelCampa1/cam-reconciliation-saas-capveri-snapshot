# CapVeri Reconciliation Flow — ICP Guide

> How a CAM reconciliation goes from raw data to finalized tenant statements.
>
> For the engineering perspective, see [reconciliation-architecture.md](./reconciliation-architecture.md).

---

## Overview

CapVeri automates the reconciliation process that typically takes landlords and property managers weeks of spreadsheet work. You remain in control at every decision point — the platform handles the tedious parts.

A full reconciliation has five phases:

| Phase | You do | CapVeri does |
|-------|--------|---------------|
| 1. Import GL data | Upload your export file | Detects format, parses entries, deduplicates |
| 2. Import leases | Upload PDF leases | OCR + AI extracts financial terms, you verify |
| 3. Map expenses to pools | Review/adjust pool assignments | Auto-suggests mappings from account codes |
| 4. Review AI advisory | Read flagged risks, dismiss or fix | Surfaces CapEx/OpEx issues, non-recoverable items |
| 5. Finalize & distribute | Click Finalize | Locks snapshot, generates tenant packets, ERP files |

---

## Phase 1 — Import Your GL Export

**What you do**: Export a GL report from your system (Yardi, MRI, or any generic CSV) and upload it to CapVeri.

**What CapVeri does**:
- Reads the first 1KB of the file to auto-detect whether it came from Yardi, MRI, or a generic system
- Parses every line item into a structured GL entry (account code, description, vendor, amount, date)
- Deduplicates — uploading the same file twice won't double-count anything
- Flags and rejects garbage rows (missing amounts, invalid dates, non-numeric values)
- Auto-creates expense pools based on account codes so you have a starting structure

**What you see**: A batch summary with row count, any parse errors, and a preview of the imported entries.

**You're in control of**: Uploading when you're ready. Nothing is calculated yet.

---

## Phase 2 — Import Lease PDFs

**What you do**: Upload the PDF lease for each tenant.

**What CapVeri does**:
- Runs document reader OCR to extract all text and tables from the PDF
- Sends the extracted text to Claude AI to identify the "financial DNA" of the lease:
  - Pro-rata share (tenant's percentage of the building)
  - Base year (if applicable)
  - Gross-up target (typically 95%)
  - Admin fee percentage
  - Expense cap type and rate (non-cumulative, cumulative, or compounding)
  - Excluded expense pools
- Scores confidence per field — low-confidence fields are flagged for your review

**What you see**: A side-by-side verification screen — the original PDF on the left, the extracted values on the right. You can click any field to see exactly where in the document Claude found that value.

**You're in control of**: Approving or editing every extracted field before anything is committed to the system. No AI output is used without your sign-off.

> **Why this matters**: These lease terms are the inputs to every calculation. Getting them right here means the math downstream is correct.

---

## Phase 3 — Map Expenses to Pools

**What you do**: Review how GL account codes are assigned to expense pools (e.g., Utilities, Janitorial, Taxes & Insurance).

**What CapVeri does**:
- Auto-suggests pool assignments based on account code patterns from the GL import
- Supports a two-level pool hierarchy (parent → child) for detailed reporting
- Applies your mappings to all current and future imports for this property

**What you see**: A pool management screen where you can confirm, edit, or create custom mappings. Pool totals roll up automatically.

**You're in control of**: Which expenses are recoverable, which pools are excluded from certain tenants, and how pools are organized.

---

## Phase 4 — Review the AI Advisory

**What you do**: Before finalizing, read the AI-generated narrative about your GL data.

**What CapVeri does**:
- Sends the aggregated GL data (by pool and account code) to Claude AI
- Generates a plain-language advisory identifying:
  - Potential CapEx items incorrectly coded as OpEx (e.g., a $180,000 HVAC replacement)
  - Non-recoverable expenses that may have slipped into recoverable pools
  - Year-over-year anomalies (spikes, unusual vendors, one-time items)
  - Items that could trigger a tenant audit dispute

**What you see**: An expandable advisory panel on the reconciliation screen. It uses plain language with regulatory citations where relevant (GAAP, IRS guidance).

**You're in control of**: Whether to act on the advisory, dismiss it, or re-run it after making adjustments. The advisory never modifies your numbers — it's informational only.

> **Why this matters**: This is where CapVeri catches the things that used to require a CPA to review manually — before you send statements to tenants.

---

## Phase 5 — Finalize and Distribute

**What you do**: Review the reconciliation grid, make any final cell-level adjustments, then click Finalize.

**What CapVeri does**:
- Runs the full calculation for every tenant:
  1. Calculates the gross-up factor (based on actual vs. target occupancy)
  2. Applies gross-up to variable expenses only (not taxes/insurance)
  3. Applies each tenant's pro-rata share
  4. Applies expense caps (if configured in the lease)
  5. Adds the admin fee
- Locks the snapshot — finalized reconciliations cannot be modified (full audit trail)
- Generates tenant packets (PDF statements)
- Generates ERP write-back files for Yardi or MRI
- Updates the reconciliation campaign status to Completed

**What you see**: A grid showing every tenant × every expense pool, with the final billable amount. You can expand any cell to see the full calculation trace (every step, every input, every output).

**You're in control of**: The timing of finalization and any manual cell-level overrides before locking.

---

## Tenant Portal

Once finalized, tenants can log into their own portal to:
- View their reconciliation statement
- Download supporting documents
- Submit disputes with comments and document uploads

Disputes are routed back to you for review.

---

## What CapVeri Never Does

- **No API connections to Yardi or MRI** — all data comes from file exports you control
- **No AI-generated financial math** — all calculations are deterministic Python; Claude is used only for extraction and advisory
- **No auto-finalization** — you explicitly trigger every phase
- **No modifications after finalization** — locked snapshots protect you in a dispute

---

## Key Terms

| Term | Meaning |
|------|---------|
| **GL export** | General Ledger export from your property management system |
| **Recovery profile** | The set of lease terms that govern what a tenant owes (pro-rata, cap, gross-up, admin fee) |
| **Gross-up** | Adjusting variable expenses upward to reflect a hypothetically full building (prevents under-recovery when occupancy is low) |
| **Expense cap** | A lease clause limiting how much a tenant's CAM charges can increase year-over-year |
| **Pro-rata share** | The tenant's proportional share of the building (typically: tenant sqft / total rentable sqft) |
| **Base year** | The year used as a baseline — tenant only pays increases above that year's expense level |
| **Pool** | A category of expenses (e.g., Utilities, Janitorial) that can be included or excluded per tenant |
| **CAM reconciliation** | The annual process of comparing estimated CAM payments to actual expenses |
