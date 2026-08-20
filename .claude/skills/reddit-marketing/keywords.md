# Reddit Keyword Monitoring — CapVeri

Use this file with the `reddit-crawler` skill to find sniper comment opportunities on property management and landlord subreddits.

---

## Target Subreddits

### Tier 1 — High Volume, High Intent (Primary)

| Subreddit | Why |
|---|---|
| r/PropertyManagement | Property managers, PMC staff, owner-operators. Core audience. Questions about reconciliation, tenant disputes, CAM errors. |
| r/Landlord | Commercial and residential landlords. Commercial landlords asking about CAM, reconciliation, tenant audit demands. |
| r/CommercialRealEstate | CRE professionals — investors, brokers, asset managers, PMCs. Professional tone. High-quality conversations about lease math and operating expenses. |

### Tier 2 — Specific PMC/Investor Types

| Subreddit | Why |
|---|---|
| r/realestateinvesting | Investors who own commercial buildings and deal with PMCs and CAM. NOI-focused framing works here. |
| r/CFO | CFOs, VPs of Finance, controllers at PMCs and real estate companies. CAM liability forecasting, found revenue, Yardi gaps. |
| r/Accounting | CPAs who do lease accounting for commercial real estate clients. ASC 842, BOMA 2024, reconciliation accuracy. |
| r/FacilityManagement | Facilities directors dealing with CapEx/OpEx classification — a primary source of CAM errors. |
| r/RealEstate | Mixed residential/commercial. Commercial lease and reconciliation questions slip through regularly. |

### Tier 3 — Monitor Only (lower conversion)

| Subreddit | Notes |
|---|---|
| r/Entrepreneur | Business owners signing commercial leases — occasionally post landlord-side questions. |
| r/smallbusiness | Primarily tenants, but landlords/PMs occasionally post about billing and reconciliation. |
| r/legaladvice | Landlords facing tenant audit demands or CAM disputes. High urgency when they appear. |

---

## Keyword Groups

### Group 1: CAM Reconciliation — Core (highest intent — always engage)

```
CAM reconciliation
CAM reconciliation error
CAM reconciliation software
CAM reconciliation spreadsheet
CAM reconciliation Yardi
CAM reconciliation MRI
automate CAM reconciliation
CAM audit
CAM billing error
CAM calculation
gross-up CAM
CAM gross up calculation
CAM cap violation
CAM cap calculation
base year CAM calculation
pro-rata share calculation
pro-rata denominator
management fee CAM
CAM exclusions
CapEx vs OpEx lease
capital expenditure operating expense lease
```

### Group 2: Property Management Operations (high intent)

```
property management CAM
property management reconciliation
PMC reconciliation
lease reconciliation
operating expense reconciliation
annual reconciliation property management
Yardi CAM reconciliation
MRI software reconciliation
NNN reconciliation
triple net reconciliation
lease administration reconciliation
BOMA pro-rata
BOMA 2024
occupancy denominator
GLA vs GLOA
tenant pro-rata share
```

### Group 3: Tenant Audit Demands (high urgency — landlords in pain)

```
tenant audit request
tenant audit rights
tenant requesting audit
tenant disputing CAM
CAM dispute landlord
tenant questioning CAM charges
tenant hired auditor
tenant CAM overcharge claim
respond to tenant audit
landlord CAM dispute
CAM audit demand letter
right to audit commercial lease
```

### Group 4: ERP / Software Gaps (medium intent — explains the product)

```
Yardi CAM errors
Yardi lease calculation
Yardi reconciliation wrong
MRI reconciliation errors
ERP CAM validation
Yardi gross up
property management software reconciliation
spreadsheet CAM
CAM spreadsheet errors
manual reconciliation errors
reconciliation model
```

### Group 5: Specific Calculation Errors (medium intent — technical audience)

```
gross up calculation occupancy
non-cumulative CAM cap
cumulative CAM cap
base year gross up
management fee circular
management fee percentage base
pro-rata calculation error
denominator manipulation
GLA denominator
GLOA denominator
vacant space denominator
insurance pass-through lease
property tax reconciliation
```

### Group 6: NOI / Asset Management (medium intent — investor/CFO audience)

```
CAM recovery rate
CAM leakage
operating expense recovery
NOI impact CAM
recoverable expenses
recoverable CAM
expense pool
common area expenses
common area maintenance expenses
unrecoverable expenses
CAM reconciliation accuracy
reconciliation variance
operating budget vs actual
```

---

## Search Query Recipes

### Quick Daily Scan (run every 24h, site-wide)

```
q=CAM+reconciliation&sort=new&t=day
q=tenant+audit+request&sort=new&t=day
q=CAM+calculation+error&sort=new&t=day
q=property+management+reconciliation&sort=new&t=day
q=Yardi+CAM&sort=new&t=day
q=CAM+dispute+landlord&sort=new&t=day
q=gross+up+CAM&sort=new&t=day
```

### Tier 1 Subreddit Scans (daily, restrict_sr=1)

```
r/PropertyManagement + q=CAM
r/PropertyManagement + q=reconciliation
r/PropertyManagement + q=Yardi+calculation
r/PropertyManagement + q=tenant+dispute
r/Landlord           + q=CAM
r/Landlord           + q=reconciliation
r/Landlord           + q=operating+expenses
r/CommercialRealEstate + q=CAM+reconciliation
r/CommercialRealEstate + q=gross+up
r/CommercialRealEstate + q=pro-rata
```

### Tier 2 Subreddit Scans (2-3x per week)

```
r/realestateinvesting + q=CAM
r/realestateinvesting + q=reconciliation
r/realestateinvesting + q=operating+expenses
r/CFO                + q=CAM
r/CFO                + q=lease+reconciliation
r/CFO                + q=occupancy+costs
r/Accounting         + q=CAM
r/Accounting         + q=ASC+842+reconciliation
r/FacilityManagement + q=CAM
r/FacilityManagement + q=CapEx+OpEx
```

### Extended Scan (weekly — evergreen threads)

```
q=pro-rata+share+lease&t=week
q=CAM+cap+calculation&t=week
q=gross-up+clause&t=week
q=management+fee+lease&t=week
q=base+year+lease&t=week
q=Yardi+reconciliation+error&t=week
q=tenant+audit+rights&t=week
q=NNN+reconciliation&t=week
```

---

## Relevance Filter

After crawling, apply this filter before scoring. **Skip the post if any of these are true:**

| Rejection Rule | Why |
|---|---|
| Post is from a tenant complaining about their landlord | Wrong side — CapVeri serves the landlord/PMC |
| Residential property only (apartment, house, condo) | Not commercial |
| Generic "how to invest in real estate" question | No reconciliation pain |
| Post is asking about lease accounting compliance (ASC 842/IFRS 16) | That's Tango/LeaseQuery territory |
| No commercial real estate or property management context | Too generic |

**Pass the post if at least one of these is true:**

| Relevance Signal | What it means |
|---|---|
| Property manager or landlord is the OP | Right side of the table |
| Mentions CAM, NNN, reconciliation, or operating expenses in a PMC context | Direct match |
| Mentions Yardi, MRI, or a property management ERP with a calculation question | Core pain point |
| Mentions receiving a tenant audit demand or audit request | High urgency |
| Asks about gross-up, cap calculation, pro-rata denominator, or base year | Technical match |

---

## Scoring: When to Respond

Only score posts that passed the relevance filter. Prioritize threads that score 3+.

| Signal | Score |
|---|---|
| Posted in last 48 hours | +1 |
| Posted in last 24 hours (bonus) | +2 |
| Property manager or landlord is OP | +1 |
| Specific dollar amount or calculation mentioned | +1 |
| Yardi/MRI gap or calculation error evident | +1 |
| Tenant audit demand mentioned | +2 |
| No substantive answer yet | +1 |
| Post has 3+ upvotes (validated pain) | +1 |
| Keyword from Group 1 or 3 | +1 |
| Post is NOT archived and NOT locked | required |

**Score 3–4:** Leave a sniper comment.
**Score 5+:** Prioritize — high-value engagement opportunity.

---

## Noise Filters

- Posts older than 72 hours (unless still getting new comments)
- Posts where a property management consultant or attorney has already given a comprehensive answer
- Posts where the OP has already resolved the situation
- Posts with `archived: true` or `locked: true`
