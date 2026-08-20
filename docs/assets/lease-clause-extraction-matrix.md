# Lease Clause Extraction Matrix

**File:** `lease-clause-extraction-matrix.xlsx`
**Tool URL:** https://www.capveri.com/tools/lease-clause-extraction-matrix
**Generator:** `backend/scripts/lead_magnets/generate_lease_clause_extraction_matrix.py`

## Purpose

Structured template for extracting and comparing 19 key CAM-related lease clauses across a portfolio. Pre-populated with 5 sample rows. Conditional formatting flags no-cap leases (red) and short audit windows (yellow).

## Sheets

| Sheet | Contents |
|-------|----------|
| Matrix | 20-column grid covering all key CAM clause fields; 5 sample rows; conditional formatting |
| Summary | COUNTIF/AVERAGEIF portfolio stats: cap type distribution, audit rights, gross-up, avg admin fee |
| Instructions | Column-by-column guidance, what to look for, red flags to escalate |

## Matrix Columns (20)

Property Name, Tenant Name, Suite, Lease Start/End, CAM Definition, Exclusions, Cap Type, Cap %, Base Year, Gross-Up Threshold, Gross-Up Method, Admin Fee %, Mgmt Fee Cap, Audit Rights, Audit Window (days), Recon Deadline (months), Pro-Rata Method, Denominator Definition, Notes/Flags.

## Conditional Formatting

- Red fill: Cap Type = "None"
- Yellow fill: Audit Window (numeric) < 60 days
