# Board-Ready NOI Impact Dashboard — Design Document

**Date:** 2026-02-23
**Feature:** NOI Impact Calculator & Board Presentation Export
**Branch:** feature/noi-impact-dashboard

---

## Overview

Commercial real estate value is calculated as `NOI ÷ cap rate`. A CAM recovery that increases NOI by $25,000 at a 7% cap rate translates to $357,142 in additional building value. This feature makes that translation visible and board-presentable on finalized reconciliations.

---

## Backend Service (`backend/app/services/calculation/noi_impact.py`)

A standalone `calculate_noi_impact` service accepts a `NOIImpactInput` (recovery amount + cap rate) and returns a `NOIImpactResult` with `noi_lift` and `asset_value_lift`. All math uses Python `Decimal` with `ROUND_HALF_UP` rounding. Cap rate is validated to be between 1% and 25% (inclusive), raising `ValueError` outside that range. The formula is: `asset_value_lift = recovery_amount / cap_rate`. NOI lift equals the recovery amount directly, since CAM recovery is permanent recurring income.

---

## Frontend Component (`frontend/src/features/reconciliation/components/NOIImpactPanel.tsx`)

A collapsible inline card rendered on `ReconciliationPage` **only when the reconciliation is finalized** (`isFinalized` flag). Displays three stat cards (CAM Recovery, NOI Lift, Asset Value Lift) and a native range slider for cap rate (2%–12%, default 7%). Preview values are computed client-side via simple division — no API call for the interactive preview. An "Export Board Presentation" button triggers the backend PDF download via `useExportBoardDownload`. Toggle behavior: clicking the "NOI Impact" button opens/closes the panel.

---

## Export Tab (`frontend/src/features/reconciliation/components/ExportPanel.tsx`)

A fifth "Board" tab is added to the existing `ExportPanel` sheet (alongside PDF, Batch, ERP, History). The `BoardTab` sub-component includes a cap rate slider (matching the panel), a "Preview Presentation" button (opens PDF inline in a modal), and a "Download Presentation" button (triggers file download). The tab calls `useExportBoardPreview` and `useExportBoardDownload` hooks backed by the new backend endpoints `POST /api/v1/export/board/preview` and `POST /api/v1/export/board/download`. The `BoardPresentationGenerator` uses ReportLab (matching existing PDF style) and calls `calculate_noi_impact` for authoritative numbers.

---

## Marketing Updates (`frontend/src/components/landing/FeaturesGrid.tsx`, `frontend/src/pages/Pricing.tsx`)

The Features Grid on the landing page gains an 8th card: "NOI Impact Calculator" with a `Building2` icon, describing the cap-rate translation from recovery dollars to asset value. The Pricing page adds "NOI Impact Calculator" to the Growth plan feature list and to the feature comparison table (Growth ✓, Enterprise ✓).

---

## Key Constraints

- Cap rate math lives exclusively in the tested backend service; the UI panel uses client-side division only for interactive preview
- All monetary calculations use `Decimal`, never `float`
- The NOI Impact button and panel are hidden for draft/non-finalized reconciliations
- Board PDF export format matches existing PDF style (ReportLab, same margins and color scheme)
- Zero Data Retention must be maintained for all LLM calls (unchanged)
