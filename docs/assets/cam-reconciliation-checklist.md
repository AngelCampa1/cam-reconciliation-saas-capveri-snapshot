# CAM Reconciliation Review Checklist - Resource Reference

> **File**: `docs/assets/cam-reconciliation-checklist.pdf`
> **Generator**: `scripts/build_exit_intent_resources.py`
> **Compatible with**: Any modern PDF reader

## Overview

This PDF is a controller-ready checklist for reviewing annual CAM reconciliation packages before they are sent to tenants. It focuses on the areas most likely to create tenant disputes, leakage, or rework:

- Lease and abstract alignment
- Expense pool review
- Gross-up and occupancy calculations
- Caps, floors, and admin fees
- Final statement package QA

## Lead Magnet Use

The resource is enabled in the backend lead magnet registry under:

```text
cam-reconciliation-checklist
```

It uses the existing `checklist_audit` Resend sequence. The exit-intent popup can offer this PDF alongside the two existing spreadsheet resources.

## QA Checklist

- [ ] Generate with `python scripts/build_exit_intent_resources.py`
- [ ] Publish and fetch-verify remote R2 assets with `python scripts/build_exit_intent_resources.py --upload-remote`
- [ ] Confirm both copies exist:
  - `generated/lead-magnets/cam-reconciliation-checklist.pdf`
  - `docs/assets/cam-reconciliation-checklist.pdf`
- [ ] Confirm PDF text extraction includes the title and main sections
- [ ] Render or open the PDF and check spacing, page numbers, and table readability
