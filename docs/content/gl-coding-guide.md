---
seo_title: "GL Coding Guide: CAM Recoverable Expenses | CapVeri"
meta_description: "GL coding guide for CAM recoverable expenses: categorized reference for property accountants covering recoverable costs, capital exclusions, and gray-area disputes."
primary_keyword: "gl coding guide cam recoverable expenses"
canonical:"/resources/gl-coding-guide"
cross_links:
  - /resources/cam-presend-checklist
  - /tools/cam-leakage-estimator
  - /resources/what-is-cam-reconciliation
---

# GL Coding Guide for CAM Recoverable Expenses

GL code is the first and last line of defense in a CAM dispute. One wrong account code turns a routine invoice into a multi-year liability.

---

## 1. Clearly Recoverable Operating Expenses

| GL Code | Expense Category | Typical Examples | Governing Standard |
|---------|-----------------|------------------|--------------------|
| 6110 | R&M: Roof | Patching, flashing repair, gutter clearing | IRS Â§162 routine maintenance |
| 6120 | R&M: HVAC | Annual PM contracts, coil cleaning, single RTU in multi-unit system | IRS Routine Maintenance Safe Harbor (UOP doctrine: one of several units) |
| 6130 | R&M: Parking Lot | Sealcoating, restriping, pothole fill, crack seal | IRS Â§162 |
| 6140 | Landscaping | Mowing, weeds, seasonal annuals, mulch, irrigation PM | Industry standard / BOMA EER |
| 6150 | Security Services | Guard wages, monthly monitoring, alarm response fees | BOMA EER |
| 6510 | Real Estate Taxes | Municipal property taxes, special assessments | NNN lease standard; uncontrollable |
| 6520 | Property Insurance | Hazard, fire, liability premiums | NNN lease standard; uncontrollable |
| 6530 | Common Area Utilities | Lobby/lot electricity, water, gas | NNN lease standard; uncontrollable |
| 6810 | Amortized Cost-Saving CapEx | Annual fraction of LED retrofit or efficient HVAC replacement | BOMA exception: cost-saving capital, amortized over useful life |

**Note:** Items 6100â€“6150 are controllable and typically subject to tenant-negotiated annual caps (3â€“5%). Items 6500â€“6530 are uncontrollable and pass through uncapped. Never commingle these in the same parent account.

---

## 2. Clearly Non-Recoverable Capital Expenses

| GL Code | Expense Category | Typical Examples | Why It's Capital |
|---------|-----------------|------------------|-----------------|
| 1510 | Roof & Structural Replacements | Full tear-off, new membrane, structural overhaul | IRS Â§263(a): Restoration of major building component |
| 1520 | HVAC Capital | Sole-chiller replacement, complete ductwork overhaul, all RTUs replaced simultaneously | IRS Â§263(a): Restoration of HVAC UOP |
| 1530 | Land & Parking Improvements | Mill-and-overlay, full-depth repave, new parking structure | IRS Â§263(a): Betterment/Restoration; RioCan precedent |
| 1540 | Security Hardware | CCTV network, biometric turnstiles, access control wiring | Long-term fixed asset (MACRS 7 yr); not a service |
| 1550 | Major Landscape Redesign | New irrigation system, mature trees, retaining walls, hardscape | Adaptation to new use (IRS BRA test) |
| 7110 | Leasing Commissions | Broker fees, TI allowances, marketing | Landlord cost; no operating benefit to tenants |
| 7120 | Software Subscriptions | Yardi/MRI SaaS, corporate IT | Admin overhead unless lease explicitly permits |
| 7130 | Off-Site Management Payroll | Executive salaries, corporate accounting staff | Landlord overhead; double-dip risk with admin fee |

**Rule:** These must post to 1000-series asset accounts or 7000-series non-recoverable accounts. They must never land in a 6000-series recoverable pool.

---

## 3. Gray-Area Expenses

| Expense | Recoverable Ifâ€¦ | Non-Recoverable Ifâ€¦ | Default GL Code |
|---------|----------------|---------------------|-----------------|
| Roof work | 6110 if localized repair â€” patching, flashing, gutter clear | 1510 if full membrane replacement or structural scope | 6110 / 1510 |
| HVAC work | 6120 if single component in multi-unit system; routine PM | 1520 if only chiller replaced or all units replaced simultaneously | 6120 / 1520 |
| Parking lot | 6130 if sealcoat, restripe, potholes, crack seal | 1530 if mill-and-overlay or sub-base excavation | 6130 / 1530 |
| Landscaping | 6140 if routine mowing, planting, mulch, irrigation PM | 1550 if new irrigation system, hardscape redesign, or mature trees installed | 6140 / 1550 |
| Security | 6150 if monthly monitoring contracts or guard wages | 1540 if initial hardware purchase and installation | 6150 / 1540 |
| PropTech / SaaS | 6530 variant if lease explicitly lists "technology infrastructure" | 7120 if no explicit lease language â€” default non-recoverable | 7120 |
| Admin overhead | 6140â€“6150 range for on-site maintenance/engineer wages, direct mgmt fee (3â€“5%) | 7130 if charging admin fee AND exec salaries simultaneously (double-dip) | 6140â€“7130 |

**Default rule:** When in doubt, classify as non-recoverable. In a contested audit the burden of proof sits with the landlord, not the tenant.

---

## 4. How Miscoding Snowballs

**Year 1.** An $80,000 HVAC chiller replacement posts to 6120 R&M instead of 1520 Capital. It flows into the CAM pool. Tenant gets billed their pro-rata share.

**Years 2â€“4.** Tenant pays without protest. The misclassified line is now embedded in prior-year actuals, forming the base against which cumulative CAM caps compound. Each year the landlord marks up from a fraudulently inflated base.

**Year 5.** Tenant exercises audit rights â€” most leases allow a 1â€“3 year lookback. The auditor pulls the original invoice, sees the HVAC model number, cross-references capital asset life, and calls it capital. Flag is raised.

**Dispute mechanics.** Landlord now owes: (a) principal refund for all open audit years, (b) interest on overbilled amounts, (c) the tenant's audit costs if the lease so provides, and (d) attorney's fees if it goes to litigation.

**The statute of limitations trap.** Many jurisdictions allow claims 3â€“6 years back. A single bad code in Year 1 can generate exposure through Year 6. The longer it compounds undetected, the larger the bleed.

**The admin fee amplifier.** If a 15% administrative fee was applied on top of the misfiled expense, every dollar of principal error generated $1.15 of billed overcharge. Courts in litigated audits award the inflated amount back â€” markup included.

**The double-dip corollary** *(RioCan / management salary cases).* Landlords who simultaneously charge a 15% admin fee and include off-site management salaries in the CAM pool face findings of double-billing. Courts strike both lines and may award costs.

**Prevention.** A clean chart of accounts â€” strict 1000/6000/7000 separation with no exceptions at invoice entry â€” eliminates all downstream compounding. The cost of one minute of correct GL coding at posting time is zero. The cost of correcting it in Year 5 of litigation is not.

---

## Related Resources

- [CAM Pre-Send Checklist â†’](/resources/cam-presend-checklist)
- [CAM Leakage Estimator â†’](/tools/cam-leakage-estimator)
- [What is CAM Reconciliation? â†’](/resources/what-is-cam-reconciliation)


## Sources
- 1. Internal Revenue Code §162. https://www.law.cornell.edu/uscode/text/26/162
- 2. Internal Revenue Code §263(a). https://www.law.cornell.edu/uscode/text/26/263
- 3. CapVeri research notes: CRE CAM Expense Classification Guide. https://github.com/capveri/capveri/blob/master/docs/01-FEB-GTM-Tasks/01%20AI%20Workflow%20-%20Content%20Asset%20Production/1.5%20CRE%20CAM%20Expense%20Classification%20Guide.md
