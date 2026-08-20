# Lease Language — Vulnerability Patterns and Protective Clauses

Organized by detection rule. Each section shows the vulnerable clause that creates overcharge exposure and the protective counterpart.

---

## Rule 2: Excluded Service Charges

**Vulnerable (incomplete exclusion list):**
> "Operating Expenses shall include all costs incurred by Landlord in operating, maintaining, and repairing the Building."

No exclusion list means everything is in. CapEx, corporate overhead, legal fees, and leasing costs all qualify under broad maintenance language.

**Protective (comprehensive exclusion list):**
> "Operating Expenses shall NOT include: (a) costs of capital improvements, replacements, or structural repairs; (b) depreciation; (c) mortgage interest or amortization; (d) ground lease payments; (e) leasing commissions, attorneys' fees, or costs of tenant disputes; (f) advertising expenses; (g) executive salaries above property manager level; (h) costs of services to individual tenant spaces; (i) charitable contributions; (j) costs reimbursed by insurance or warranties."

The GL code disguise risk: landlords often use vague GL descriptions like "building improvement" instead of "roof replacement" to obscure excluded items. Audit against both the description and the GL code.

---

## Rule 3: Management Fee Overcharge

**Vulnerable (ambiguous base):**
> "Landlord may charge a management fee not to exceed 5% of total Operating Expenses."

"Total Operating Expenses" is undefined. Landlord argues it includes the fee itself (circular). No third-party requirement, so a self-managing landlord charges a phantom fee.

**Protective:**
> "Management fees shall not exceed the lesser of (a) X% of Operating Expenses calculated before inclusion of the management fee, or (b) fees actually paid to an independent third-party management company."

The phrase "actually paid or incurred" is the key protection. It prevents self-managing landlords from charging a fee with no underlying cost.

**Fee-on-fee protection (ICSC standard):**
> "If there is both a management fee and an administrative fee, the administrative fee is not assessed on the management fee."

---

## Rule 4: Pro-Rata Share Error

**Vulnerable (allows unilateral change):**
> "Tenant's Pro Rata Share shall be calculated by dividing the Premises Rentable Area by the Property Rentable Area, which is leased or held for lease by tenants, as determined by Landlord from time to time."

"Leased or held for lease" introduces GLOA-style vacancy exclusion ambiguity. "As determined by Landlord from time to time" grants unilateral remeasurement rights.

**Protective (locked denominator):**
> "Landlord and Tenant agree that such approximations of Floor Area are reasonable, and that the calculations are not subject to revision under any circumstances."

Or with explicit numbers:
> "Tenant's Pro Rata Share is hereby fixed at 7.50%, based on Tenant's premises of 7,500 square feet and the total leasable area of the building of 100,000 square feet (GLA), which figures shall not be subject to adjustment."

**Protective with adjustment trigger:**
> "If at any time Tenant's Pro Rata Share shall increase due to unilateral actions by Landlord such that it is more than 23%, Tenant shall be permitted to terminate this Lease without penalty."

BOMA version standard note: BOMA updated its measurement standard in 1996, 2010, and 2017. Even a 3% SF difference has material CAM impact. Specify which BOMA edition governs or lock the SF figure explicitly.

---

## Rule 5: Gross-Up Violation

**Vulnerable (no variable/fixed distinction):**
> "Operating Expenses shall be adjusted as though the Building had been 95% occupied."

No qualification that "only variable expenses" are adjusted. Allows landlord to gross up property taxes, insurance, and all fixed costs.

**Protective (variable expenses only — Holland & Hart model):**
> "The Operating Expenses that vary with occupancy (including without limitation janitorial, utilities, trash removal, and management fees) will be adjusted by Landlord to the amount that the Operating Expenses would have been if 100% of the rentable area had been occupied during such year."

**Anti-windfall protection:**
> "In no event shall Tenant be obligated to pay more than Tenant's proportionate share of the actual Operating Expenses."

**Symmetric application (base year AND comparison years):**
> "...the Operating Expenses for such calendar year shall be increased (both for purposes of calculating the Operating Expense Base and Operating Expense Increases) to reflect what they would have been at 95% occupancy."

---

## Rule 6: CAM Cap Violation

**Vulnerable (ambiguous cap math):**
> "CAM increases shall not exceed 5% per year."

Fails to specify compounding vs. cumulative, whether unused cap carries forward, or whether "prior year" means prior year's actual expenses or prior year's cap amount. "I have no idea!" (Ira Meislik, Retail Real Estate Law blog) is the practitioner consensus on this language.

**Protective — non-cumulative (no banking):**
> "...shall not exceed one hundred five percent (105%) of the portion of Tenant's Additional Rent attributable to Common Area Expenses payable by Tenant for the previous year."

**Protective — cumulative compounding with banking (Hollander PLLC 2024):**
> "The Controllable Operating Expense Cap shall increase by five percent (5%) over the applicable Controllable Operating Expense Cap for the immediately preceding calendar year (irrespective of whether the actual Controllable Operating Expenses for the preceding calendar year was less than the amount of the applicable Controllable Operating Expense Cap for such preceding calendar year), such increase to be cumulative and compounded annually... if Controllable Expenses in any calendar year exceed the Controllable Expense Cap for any particular year, then such excess amount... may be billed to and shall be payable by Tenant in subsequent calendar years to the extent that in any such subsequent calendar year Controllable Expenses are not in excess of the Controllable Expense Cap for such subsequent year(s)."

**Tenant-preferred (Sherin & Lodgen):**
> "Increases in Controllable Expenses should be capped at 3% per annum. From a tenant's perspective this should not be on a cumulative basis."

**Typical controllable expense cap scope (ICSC model):**
> "...shall not exceed five percent (5%) per year, calculated on a non-cumulative basis, excluding Uncontrollable Costs which include insurance, utilities, security, taxes, and snow/ice removal."

---

## Rule 7: Base Year Error

**Vulnerable (no gross-up requirement):**
> "The Base Year shall mean calendar year [YEAR]."

No gross-up requirement. If the building was 60% occupied that year, variable expenses are ~40% understated. Every subsequent year's escalation calculation is permanently distorted.

**Protective (with explicit gross-up):**
> "If the Building is less than 95% occupied during the Base Year, Operating Expenses shall be adjusted to reflect what they would have been at 95% occupancy. The same adjustment methodology shall be applied consistently in all comparison years."

**Extended audit right for base year (ABA Real Property Section 2024 recommendation):**
> "Tenant shall have the right to audit the Base Year Operating Expenses for a period of [24 months] following the end of the Base Year, notwithstanding any limitations on audit rights applicable to subsequent years."

Many leases limit audit rights to comparison years only. Negotiate explicitly for base year audit rights.

**Mid-year commencement:** The first partial year should not serve as the base year. Specify the first full calendar year following commencement date.

---

## Rule 9: Insurance Overcharge

**Vulnerable (unlimited coverage discretion):**
> "Insurance shall mean all insurance premiums and costs, including such other insurance as Landlord may deem necessary or advisable."

"Deem necessary or advisable" is nearly unlimited. Allows landlord to add earthquake, flood, terrorism, umbrella, D&O, and any other policy at will.

**Protective (limited coverage types):**
> "Insurance pass-through shall be limited to: (i) all-risk commercial property insurance covering the building and improvements, (ii) commercial general liability insurance with minimum limits of $[X], and (iii) workers' compensation as required by law. Excluded coverage types include without limitation: earthquake, flood, terrorism, umbrella/excess liability beyond the foregoing, and any insurance primarily for the benefit of Landlord or its lenders."

**Protective (new coverage types added during term):**
> "If Landlord did not maintain [earthquake insurance] in the Base Year but later procures it, Landlord shall not include such premium in Operating Expenses unless the Base Year is simultaneously adjusted as if that coverage had existed in the Base Year."

**Commission-sharing protection:**
> "Insurance pass-through shall be limited to premiums actually paid to the insurer. Any commissions, rebates, or other compensation received by Landlord or Landlord's affiliates in connection with the placement of insurance shall not be included in, and shall be deducted from, the amount charged to Tenant."

---

## Rule 10: Tax Overallocation

**Vulnerable (unlimited tax definition):**
> "Real Estate Taxes shall include all taxes, assessments, and governmental charges of any kind."

Allows special assessments, personal property taxes, supplemental assessments from landlord's own purchase (Prop 13), and potentially penalties.

**Protective (specific exclusions):**
> "Real Estate Taxes shall exclude: (a) supplemental taxes triggered by a change of ownership of the property; (b) income, franchise, estate, or inheritance taxes of Landlord; (c) special assessments initiated at Landlord's request; (d) penalties or interest for late payment by Landlord; (e) taxes on Landlord's personal property; (f) taxes assessed against improvements made by other tenants."

**Tax refund pass-through (often omitted from leases):**
> "Any tax refunds, rebates, or credits received by Landlord attributable to periods for which Tenant paid a tax reimbursement shall be credited to Tenant's pro-rata share within 30 days of receipt."

**Landlord appeal obligation:**
> "Landlord shall use commercially reasonable efforts to appeal any tax assessment it reasonably believes to be excessive, and shall promptly notify Tenant of any pending appeals."

---

## Rule 11: Utility Overcharge

**Vulnerable (broad allocation discretion):**
> "Tenant shall pay its share of all charges for jointly metered utilities based upon consumption, as reasonably determined by Landlord."

"Reasonably determined by Landlord" is essentially unverifiable. No sub-metering requirement. No rate cap.

**Protective (submeter-based billing):**
> "Tenant's utility charges shall be based on actual readings from submeter(s) installed for Tenant's premises. The rate per unit shall not exceed the rate actually charged to Landlord by the applicable utility company. Landlord may charge an administrative fee not to exceed [5%] of the applicable utility bill to cover billing and meter reading costs."

**After-hours HVAC rate protection:**
> "After-hours HVAC shall be charged at a rate not to exceed Landlord's actual documented cost of providing such service, which shall be made available to Tenant upon request."

**Double-billing protection:**
> "Notwithstanding any other provision, Tenant shall not be required to pay for any utility or service that Tenant is separately required to pay directly to the utility provider under this Lease."

---

## Rule 13: Controllable Expense Cap / Corporate Overhead

**Vulnerable (no overhead exclusion):**
> "Operating Expenses shall include all costs incurred by Landlord in managing, operating, and administering the property."

"Administering" opens the door to corporate overhead, executive salaries, and entity-level costs being passed through.

**Protective (corporate overhead exclusion — SEC-filed lease example):**
> "Operating Expenses shall not include Landlord's general corporate overhead and general and administrative expenses, executive salaries above building manager level, fees paid to Landlord's affiliates except to the extent the same do not exceed the market rate for the services provided, and legal fees incurred in connection with other tenants' disputes or lease negotiations."

**Distinguishing property management from corporate overhead:**
Property management fees (3-6% of gross revenue, paid to the property manager) are legitimate operating expenses. Corporate overhead allocated down from the parent company is not. The audit should confirm that "property management fee" in the reconciliation actually corresponds to fees paid to an identified property management entity under a documented management agreement.

---

## Audit Rights — Protective Language

Every lease should contain all three of these:

1. **Right to audit:** "Tenant shall have the right to audit Landlord's books and records relating to Operating Expenses for any calendar year within [24] months after receipt of Landlord's final reconciliation statement for such year."

2. **Audit cost recovery:** "If such audit reveals an overcharge of more than [3-5%] of the amount billed, Landlord shall reimburse Tenant for the reasonable cost of such audit within 30 days."

3. **Record retention:** "Landlord shall retain all books and records related to Operating Expenses for a period of not less than [3-5] years following the end of each calendar year."

**Base year audit right (often missing):** Many leases limit audit rights to comparison years only. Negotiate separately for base year audit rights with at least a 24-month window from the end of the base year.
