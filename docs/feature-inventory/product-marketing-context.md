# Product Marketing Context

_Last updated: 2026-07-01_

This is the short marketing context used by local marketing skills. If this file
conflicts with a higher source, use the source order below.

## Source Order

1. `plan-tiers.json` controls pricing, trial terms, offer codes, offer dates,
   and feature packaging.
2. `knowledge/source/product.ts` controls approved public product claims, CTAs,
   personas, AI and math guardrails, and support contacts.
3. Generated public knowledge mirrors those sources into the app, marketing
   site, backend, and AI contexts. Do not edit generated files by hand.
4. `.agents/product-marketing.md` is the working positioning file for marketing
   skills.
5. This file summarizes that positioning for older skills that still read
   `docs/feature-inventory/product-marketing-context.md`.

## Product Overview

**One-liner:** CapVeri helps commercial landlords check CAM reconciliation from
the files they already export.

**What it does:** CapVeri imports GL, rent roll, billing, and lease files. It
checks gross-up, cap, base-year, pro-rata, expense-pool, and billing logic with
deterministic math. AI-assisted lease extraction can suggest terms, but users
review those terms before they affect money.

**Product category:** CAM reconciliation software, CRE FinOps software,
landlord-side CAM verification.

**Product type:** B2B SaaS.

**Business model:** Reconcile is an annual subscription priced by rentable unit
count. The public offer is a 30-day free trial with no credit card required.
Current prices, unit bands, and launch offers come from `plan-tiers.json` and
generated public knowledge.

## Target Audience

**Target companies:** Commercial landlords and property management companies
that manage office, retail, industrial, medical, mixed-use, or similar
commercial portfolios.

**Decision-makers:** Property controllers, CFOs, financial controllers,
directors of property management, property accountants, lease administrators,
and asset managers.

**Primary use case:** Check CAM reconciliation before tenant statements go out.

**Jobs to be done:**

- Catch over-billing and under-billing before tenants do.
- Replace fragile spreadsheet review with repeatable checks.
- Create tenant-ready support packets with a clear calculation trail.

## Personas

| Persona | Cares about | Challenge | Value we promise |
| --- | --- | --- | --- |
| Property Controller | Clean statements and fewer tenant disputes | Q1 reconciliation overload and spreadsheet risk | Check every building before statements go out |
| CFO / Financial Controller | NOI, risk, and budget confidence | CAM risk is hidden inside property-level work | See exposure and plan value before buying |
| Property Accountant | GL coding and close accuracy | Miscoded lines roll into tenant bills | Flag likely coding issues before close |
| Lease Administrator | Lease-term accuracy | Amendments and caps drift from ERP settings | Check reconciliation math against lease terms |
| Director of Property Management | Team throughput and consistency | Every controller has a different process | Standardize review across the portfolio |
| Asset Manager | NOI and diligence risk | Recovery gaps are hard to see asset by asset | Model CAM risk before reporting or closing |

## Problems and Pain Points

**Core problem:** CAM reconciliation mixes lease language, GL data, rent rolls,
billing history, and manual review. Small mistakes can become tenant disputes,
missed recovery, or bad reporting.

**Why alternatives fall short:**

- ERPs are systems of record, not independent checks on their own CAM setup.
- Spreadsheets are flexible but hard to audit and easy to break.
- Consultants are useful for hard cases, but slow and costly for routine review.

**What it costs them:** Time during year-end close, missed recoveries, tenant
disputes, audit exposure, and executive uncertainty.

**Emotional tension:** Controllers do not want a tenant auditor to find the
mistake first. CFOs do not want hidden NOI leakage. Teams do not want another
heavy implementation.

## Competitive Landscape

**Direct:** CAM-specific reconciliation tools when they are positioned as
landlord-side reconciliation systems.

**Secondary:** Yardi, MRI, RealPage, AppFolio, and other property management
systems. They remain the system of record. CapVeri checks exported data.

**Indirect:** Excel, outsourced CAM consultants, and internal review checklists.

## Differentiation

- Works from file exports. No ERP API integration is required for the core
  workflow.
- Financial math is deterministic and traceable.
- AI-assisted extraction requires human review before financial use.
- Built for landlord-side CAM reconciliation and tenant-ready support packets.
- Pricing is public and unit-based for Reconcile.

CapVeri sits beside the ERP. Users export files, upload them, review terms, run
checks, and export support.

## Objections

| Objection | Response |
| --- | --- |
| We already use Yardi or MRI. | Keep it. CapVeri checks exported files from the system you already use. |
| We use spreadsheets and they work. | Keep the spreadsheet if you want. Use CapVeri to catch the errors a workbook can hide. |
| We do not want an integration project. | There is no ERP API integration for the core workflow. Export a file and upload it. |
| We do not have budget yet. | Start with the 30-day trial. Add billing before the trial ends if the value is clear. |
| Is AI doing the math? | No. Money math is deterministic. AI only helps extract lease terms for human review. |

**Anti-persona:** Teams looking for a full ERP replacement, a tenant-side
overcharge recovery service, or legal/accounting opinions instead of
software-assisted reconciliation review.

## Customer Language

**How they describe the problem:**

- "I need to know the CAM statement is right before it goes out."
- "Yardi has the data, but I still check the math in Excel."
- "Every lease has a different cap or exclusion."

**How they describe us:**

- "A second check on CAM math."
- "A way to review the exported files before tenants see the statement."

**Words to use:** check, verify, export, upload, no integration needed,
deterministic math, human review, support packet, trial, Reconcile, BOMA 2024
aligned workflows.

**Words to avoid:** Anti-Integration in public copy, Operation Sovereign Wedge,
lead magnet, funnel-stage labels, fake customer proof, guaranteed recovery, BOMA
certification claims, and retired free-audit CTAs.

## Brand Voice

**Tone:** Direct, practical, calm.

**Style:** Plain language for property finance teams. Short sentences. Specific
claims only.

**Personality:** Careful, useful, financially serious, founder-led.

## Proof Points

Use only sourced or generated facts. Public pricing comes from `plan-tiers.json`.
Dated traction snapshots must keep their date. Do not claim paid customers,
named customers, live revenue, rankings, or exact customer savings unless a
verified source approves the claim.

| Theme | Proof |
| --- | --- |
| No ERP replacement | Product works from CSV, Excel, and lease PDF exports |
| Deterministic math | Public knowledge states LLMs do not calculate money |
| Human-reviewed AI | Extracted lease terms require review before financial use |
| Current pricing | `plan-tiers.json` and generated public knowledge |

## Goals

**Business goal:** Convert qualified commercial landlord and property management
prospects into paid Reconcile subscribers.

**Conversion action:** Start a 30-day free trial, then add billing before the
trial ends.

**Current metrics:** Treat fundraising and analytics metrics as dated snapshots
unless refreshed live.

## Funnel Summary

1. Traffic: founder-led LinkedIn, email, search, resources, tools, and referrals.
2. Value before payment: useful calculators, guides, product walkthroughs, and
   the no-card trial.
3. Product proof: upload files, review checks, see output, and understand the
   support packet.
4. Paid conversion: add billing from the app before the trial ends.
5. Holding pattern: prospects who are not ready should go to useful education,
   not a dead end.

For the full public page and SEO operating map, see
[`docs/marketing/funnel-system-map.md`](../marketing/funnel-system-map.md).

## Corrections

| Wrong | Correct |
| --- | --- |
| BOMA certification or compliance claims | "BOMA 2024 aligned workflows" |
| "AI calculates CAM" | "Money math is deterministic. AI-assisted lease extraction requires human review." |
| Retired free-audit CTA language | "Start Free Trial" |
| Retired credit-based packaging | Remove. Current packaging is Reconcile subscription. |
| "No integrations" as a blanket claim | "No ERP API integration needed for the core workflow" when precision matters. |
| Fake wins, testimonials, rankings, or exact savings | Remove unless sourced and approved. |

Run the copy guardrails before publishing public copy: humanizer,
third-grade-copy, zero lies, and whole-context fit.
