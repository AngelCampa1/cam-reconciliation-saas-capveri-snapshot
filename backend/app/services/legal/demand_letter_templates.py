"""
Demand letter templates for TX and CA jurisdictions.

All template text lives here; the generator imports these constants
and never contains hard-coded legal language.
"""

# ---------------------------------------------------------------------------
# Statutory references
# ---------------------------------------------------------------------------

TX_STATUTORY_REFERENCE = "Texas Property Code § 93.011"
CA_STATUTORY_REFERENCE = "California Civil Code § 1950.5 / SB 1103"

# ---------------------------------------------------------------------------
# Jurisdiction-specific letter bodies
# ---------------------------------------------------------------------------

TX_DEMAND_BODY = """\
{letter_date}

{tenant_name}
{property_address}

Re: Formal Demand for Payment of Outstanding Common Area Maintenance \
Reconciliation Balance

Dear {tenant_name},

This letter constitutes a formal demand for payment pursuant to {tx_ref} and \
the terms of your commercial lease agreement. As the duly authorized \
representative of your landlord, {landlord_name}, {landlord_title} of \
{landlord_company}, I am writing to inform you that a reconciliation of the \
Common Area Maintenance (CAM) charges for the period commencing {period_start} \
through {period_end} has been completed and an amount of {amount_owed} is now \
due and payable.

Under Texas Property Code § 93.011, commercial tenants are obligated to pay \
reconciled CAM charges in accordance with their lease agreement. Your lease, \
referenced as {lease_reference}, specifies the methodology and timing for such \
reconciliation payments.

Please remit the full amount of {amount_owed} no later than {deadline_date}. \
Failure to remit payment by the stated deadline may result in the assessment of \
late charges, interest, and, if necessary, legal action to recover the \
outstanding balance together with attorneys' fees and court costs as permitted \
under applicable Texas law.

Payment should be made payable to {landlord_company} and delivered to:

{landlord_name}
{landlord_title}
{landlord_company}
{landlord_address}
Phone: {landlord_phone}
Email: {landlord_email}

If you believe this amount is in error, please contact our office in writing \
within ten (10) calendar days of the date of this letter with supporting \
documentation. Absent a timely written dispute, this balance will be considered \
final and immediately due.

Sincerely,

{landlord_name}
{landlord_title}
{landlord_company}
""".format_map(
    {
        "tx_ref": TX_STATUTORY_REFERENCE,
        "tenant_name": "{tenant_name}",
        "property_address": "{property_address}",
        "amount_owed": "{amount_owed}",
        "period_start": "{period_start}",
        "period_end": "{period_end}",
        "deadline_date": "{deadline_date}",
        "landlord_name": "{landlord_name}",
        "landlord_title": "{landlord_title}",
        "landlord_company": "{landlord_company}",
        "landlord_phone": "{landlord_phone}",
        "landlord_email": "{landlord_email}",
        "landlord_address": "{landlord_address}",
        "lease_reference": "{lease_reference}",
        "letter_date": "{letter_date}",
    }
)

CA_DEMAND_BODY = """\
{letter_date}

{tenant_name}
{property_address}

Re: Formal Demand for Payment of Outstanding Common Area Maintenance \
Reconciliation Balance

Dear {tenant_name},

This letter constitutes a formal demand for payment pursuant to \
{ca_ref} and the terms of your commercial lease agreement. As the duly \
authorized representative of your landlord, {landlord_name}, {landlord_title} \
of {landlord_company}, I am writing to inform you that a reconciliation of the \
Common Area Maintenance (CAM) charges for the period commencing {period_start} \
through {period_end} has been completed and an amount of {amount_owed} is now \
due and payable.

Pursuant to California Civil Code § 1950.5 and the commercial tenant \
protections extended under SB 1103, landlords are required to provide a \
detailed accounting of reconciliation charges. The enclosed reconciliation \
statement satisfies this requirement. Your lease, referenced as \
{lease_reference}, specifies the methodology and timing for reconciliation \
payments.

Please remit the full amount of {amount_owed} no later than {deadline_date}. \
Failure to remit payment by the stated deadline may result in the assessment of \
late charges, interest, and, if necessary, legal action to recover the \
outstanding balance together with attorneys' fees and court costs as permitted \
under applicable California law.

Payment should be made payable to {landlord_company} and delivered to:

{landlord_name}
{landlord_title}
{landlord_company}
{landlord_address}
Phone: {landlord_phone}
Email: {landlord_email}

If you believe this amount is in error, please contact our office in writing \
within ten (10) calendar days of the date of this letter with supporting \
documentation. Absent a timely written dispute, this balance will be considered \
final and immediately due.

Sincerely,

{landlord_name}
{landlord_title}
{landlord_company}
""".format_map(
    {
        "ca_ref": CA_STATUTORY_REFERENCE,
        "tenant_name": "{tenant_name}",
        "property_address": "{property_address}",
        "amount_owed": "{amount_owed}",
        "period_start": "{period_start}",
        "period_end": "{period_end}",
        "deadline_date": "{deadline_date}",
        "landlord_name": "{landlord_name}",
        "landlord_title": "{landlord_title}",
        "landlord_company": "{landlord_company}",
        "landlord_phone": "{landlord_phone}",
        "landlord_email": "{landlord_email}",
        "landlord_address": "{landlord_address}",
        "lease_reference": "{lease_reference}",
        "letter_date": "{letter_date}",
    }
)

# ---------------------------------------------------------------------------
# Optional dispute paragraph (appended when a dispute_id is present)
# ---------------------------------------------------------------------------

DISPUTE_PARAGRAPH = (
    "NOTICE OF FILED DISPUTE: A formal dispute (Dispute ID: {dispute_id}) was "
    "filed on {dispute_filed_date} and is currently under review. This demand "
    "letter is issued without prejudice to that dispute proceeding. The amount "
    "stated herein represents the full reconciliation balance; any adjustments "
    "resulting from the dispute resolution process will be reflected in a "
    "subsequent amended statement."
)

# ---------------------------------------------------------------------------
# Legal disclaimer (always appended at the bottom of every letter)
# ---------------------------------------------------------------------------

LEGAL_DISCLAIMER = (
    "LEGAL DISCLAIMER: This document is a template generated by CapVeri "
    "and does not constitute legal advice (this is not legal advice). "
    "It is provided as a starting point only. The reconciliation figures and "
    "amounts stated above are generated automatically from the data you "
    "provided and may contain errors; you are solely responsible for "
    "independently verifying every amount against your lease and reconciliation "
    "records before sending this letter. Users of this template should consult "
    "a licensed attorney before sending any demand letter. CapVeri and its "
    "affiliates expressly disclaim all liability arising from reliance on this "
    "template, on any figures you did not independently verify, or on any "
    "communications derived from it."
)
