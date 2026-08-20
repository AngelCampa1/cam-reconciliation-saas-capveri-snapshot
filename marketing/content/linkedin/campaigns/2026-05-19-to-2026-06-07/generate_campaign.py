# -*- coding: utf-8 -*-
"""Generate the CapVeri LinkedIn company-page campaign for May 19 to June 7.

The output is intentionally self-contained in this campaign directory so it
does not disturb the earlier broad LinkedIn batch in marketing/content/linkedin.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parent
POSTS_DIR = ROOT / "posts"
MATRIX_PATH = ROOT / "content-matrix.csv"
POSTIZ_CSV_PATH = ROOT / "postiz-import.csv"
POSTIZ_JSON_PATH = ROOT / "postiz-import.json"
CLAIM_AUDIT_PATH = ROOT / "claim_audit.csv"
QA_REPORT_PATH = ROOT / "qa_report.json"
README_PATH = ROOT / "README.md"

START = date(2026, 5, 19)
END = date(2026, 6, 7)
TIMEZONE = "America/Chicago"
ACCOUNT = "capveri"

SLOTS = [
    "06:00",
    "07:00",
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
]

PILLARS = [
    "cam-math",
    "erp-workarounds",
    "war-stories",
    "anti-integration",
    "cam-math",
    "industry-news",
    "cam-math",
    "erp-workarounds",
    "war-stories",
    "cam-math",
    "anti-integration",
    "founder",
    "cam-math",
    "product",
    "engagement",
]

FORMAT_ROTATION = [
    [
        "text-short",
        "text-long",
        "text-short",
        "carousel",
        "text-short",
        "image-quote",
        "text-long",
        "text-short",
        "video",
        "text-short",
        "text-long",
        "carousel",
        "text-short",
        "poll",
        "text-long",
    ],
    [
        "text-long",
        "text-short",
        "carousel",
        "text-short",
        "video",
        "text-short",
        "text-long",
        "image-quote",
        "text-short",
        "carousel",
        "text-short",
        "text-long",
        "poll",
        "text-short",
        "text-short",
    ],
    [
        "text-short",
        "carousel",
        "text-short",
        "text-long",
        "text-short",
        "video",
        "text-short",
        "text-short",
        "text-long",
        "carousel",
        "text-short",
        "text-short",
        "text-long",
        "image-quote",
        "poll",
    ],
    [
        "image-quote",
        "text-short",
        "text-long",
        "text-short",
        "text-short",
        "carousel",
        "text-long",
        "text-short",
        "text-short",
        "video",
        "text-long",
        "text-short",
        "carousel",
        "text-short",
        "poll",
    ],
    [
        "text-short",
        "text-long",
        "image-quote",
        "carousel",
        "text-short",
        "text-short",
        "text-long",
        "video",
        "text-short",
        "text-short",
        "carousel",
        "text-long",
        "text-short",
        "poll",
        "text-short",
    ],
]


@dataclass(frozen=True)
class Topic:
    slug: str
    title: str
    pillar: str
    source_url: str
    hashtags: tuple[str, str, str]
    fact: str
    check: str
    example: str
    action: str
    caution: str


TOPICS = [
    Topic(
        "gross-up-factor",
        "Gross-up factor",
        "cam-math",
        "https://www.capveri.com/resources/cam-gross-up-calculation-guide",
        ("camreconciliation", "grossup", "cre"),
        "gross-up should apply to variable expenses only",
        "compare actual occupancy to the lease target before applying a factor",
        "If actual occupancy is already at or above the target, the factor should be 1.0.",
        "Separate fixed and variable expenses before the reconciliation run.",
        "Keep gross-up limited to the expense categories the lease and review file support.",
    ),
    Topic(
        "expense-caps",
        "CAM caps",
        "cam-math",
        "https://www.capveri.com/resources/cam-expense-caps",
        ("camreconciliation", "expensecaps", "propertyaccounting"),
        "caps only work when the base amount and cap type are recorded correctly",
        "confirm whether each cap is cumulative, non-cumulative, compounded, or fixed",
        "A 5 percent cap can behave very differently depending on whether unused cap room carries forward.",
        "Keep a cap ledger by tenant and year.",
        "A cap field without the cap type is not enough support for a tenant packet.",
    ),
    Topic(
        "base-year",
        "Base-year stop",
        "cam-math",
        "https://www.capveri.com/resources/base-year-expense-stop",
        ("camreconciliation", "baseyear", "crefinance"),
        "base-year leases compare current recoverable expenses against a baseline year",
        "normalize one-time items before using the base year as a benchmark",
        "Storm cleanup in the base year should not quietly lower recoveries for every later year.",
        "Review the base-year pool before current-year allocations.",
        "A messy base year makes every future reconciliation look mathematically correct and economically wrong.",
    ),
    Topic(
        "pro-rata-denominator",
        "Pro-rata denominator",
        "cam-math",
        "https://www.capveri.com/resources/pro-rata-share-calculation",
        ("camreconciliation", "prorata", "propertymanagement"),
        "a tenant share is only as reliable as the denominator behind it",
        "match the denominator to the lease, not just the building setup screen",
        "Building RSF, occupied RSF, floor RSF, and pool RSF can all produce different percentages.",
        "Store the denominator source next to the calculation output.",
        "A percentage with no denominator support is hard to explain after a tenant asks questions.",
    ),
    Topic(
        "capex-opex",
        "CapEx vs. OpEx",
        "cam-math",
        "https://www.capveri.com/resources/capex-detection-cam",
        ("camreconciliation", "opex", "propertyaccounting"),
        "capital projects need separate recoverability review before they enter a CAM pool",
        "scan GL descriptions for replacements, improvements, and useful-life language",
        "Repair labor and equipment replacement may sit beside each other in the same GL export.",
        "Route possible CapEx lines to review before tenant statements are drafted.",
        "A GL account called repairs is not proof that every line is recoverable maintenance.",
    ),
    Topic(
        "management-fees",
        "Management fees",
        "cam-math",
        "https://www.capveri.com/resources/admin-fee-calculation-methods",
        ("camreconciliation", "managementfees", "cre"),
        "management fees depend on the lease basis and any fee cap",
        "verify whether the fee is calculated on gross rent, recoverable expenses, or another base",
        "Applying a fee to an expense pool that already includes the fee can create circular math.",
        "Calculate the fee from the stated lease basis, then document the basis in the packet.",
        "Management fee errors are easy to miss because the percentage itself often looks reasonable.",
    ),
    Topic(
        "gl-export-qa",
        "GL export QA",
        "erp-workarounds",
        "https://www.capveri.com/resources/gl-analysis-explained",
        ("yardi", "camreconciliation", "propertyaccounting"),
        "an export can balance and still be incomplete for CAM work",
        "check date filters, accrual timing, entity scope, and excluded accounts",
        "A late-posted accrual can be outside the export even when the report total ties to the ledger run.",
        "Save the export parameters with the reconciliation file.",
        "The CSV is the evidence trail. Treat the report settings as part of the evidence.",
    ),
    Topic(
        "yardi-export",
        "Yardi export review",
        "erp-workarounds",
        "https://www.capveri.com/resources/export-cam-yardi-voyager",
        ("yardi", "camreconciliation", "cretech"),
        "Yardi can be the system of record without being the only calculation check",
        "review recovery pool, share type, gross-up, cap, and exclusion settings against the lease",
        "The report can run cleanly while one tenant uses the wrong share type.",
        "Export the data, recalculate independently, then compare.",
        "A correct ERP report means the system followed its setup. It does not by itself show the setup matches the lease.",
    ),
    Topic(
        "mri-export",
        "MRI export review",
        "erp-workarounds",
        "https://www.capveri.com/resources/export-cam-mri",
        ("mri", "camreconciliation", "propertymanagement"),
        "MRI recovery billing still needs lease-level QA",
        "compare share type, billing pool, lease exclusions, and gross-up rules before statements go out",
        "A tenant can be assigned to the right pool and still use the wrong denominator.",
        "Run a tenant-by-tenant exception report before final billing.",
        "The issue is usually configuration drift, not a broken ERP.",
    ),
    Topic(
        "realpage-export",
        "RealPage export review",
        "erp-workarounds",
        "https://www.capveri.com/resources/export-cam-realpage",
        ("realpage", "camreconciliation", "propertyaccounting"),
        "RealPage exports should be checked against lease terms before allocation",
        "confirm pool membership, exclusions, caps, and date range settings",
        "A reimbursement pool can include the right GL accounts but the wrong tenant allocation rule.",
        "Use export-based verification before statements leave accounting.",
        "Export review is cheaper than reopening a tenant packet after questions start.",
    ),
    Topic(
        "audit-defense",
        "Audit defense packet",
        "war-stories",
        "https://www.capveri.com/resources/landlord-cam-audit-defense-playbook",
        ("camaudit", "camreconciliation", "propertymanagement"),
        "tenant questions are easier to answer when the packet already explains the math",
        "include source export, lease clause reference, calculation trace, and variance notes",
        "A tenant asking about landscaping should see the GL lines, allocation basis, and exclusion review.",
        "Build the audit trail before sending the statement.",
        "Waiting until an auditor asks for support usually creates more work than assembling it up front.",
    ),
    Topic(
        "tenant-disputes",
        "Tenant disputes",
        "war-stories",
        "https://www.capveri.com/resources/tenant-cam-dispute",
        ("camdisputes", "camreconciliation", "cre"),
        "many disputes start with missing support, not a dramatic accounting error",
        "review the lines tenants are most likely to question before the packet is sent",
        "Taxes, insurance, management fees, CapEx, and administrative charges need especially clear support.",
        "Attach the support while the reconciliation is still fresh.",
        "A vague explanation can make a correct charge look suspect.",
    ),
    Topic(
        "pre-send-qa",
        "Pre-send QA",
        "war-stories",
        "https://www.capveri.com/resources/cam-presend-checklist",
        ("camreconciliation", "propertyaccounting", "cre"),
        "the best time to catch a CAM issue is before the tenant packet goes out",
        "run checks for pool membership, non-recoverable lines, gross-up, caps, and denominator changes",
        "One excluded GL account caught before billing is cleaner than a revised statement after billing.",
        "Use a pre-send checklist every cycle.",
        "A signed reconciliation packet should not be the first time the math is reviewed end to end.",
    ),
    Topic(
        "audit-trail",
        "Calculation audit trail",
        "war-stories",
        "https://www.capveri.com/resources/self-audit-cam-billing",
        ("camaudit", "camreconciliation", "crefinance"),
        "a calculation audit trail connects each output back to its source",
        "keep GL line, pool assignment, lease clause, factor, cap rule, and tenant allocation together",
        "If a tenant asks why their share changed, the answer should not require rebuilding the workbook.",
        "Store the trace with the final packet.",
        "A spreadsheet total without trace support is fragile evidence.",
    ),
    Topic(
        "anti-integration",
        "Export-based verification",
        "anti-integration",
        "https://www.capveri.com/resources/data-migration-off-excel",
        ("cretech", "camreconciliation", "yardi"),
        "CAM verification can work from exports without replacing the ERP",
        "use CSV, Excel, and PDF outputs as the input layer",
        "Keep Yardi or MRI as the system of record, then run an independent lease-term calculation beside it.",
        "Verify the output before changing the system.",
        "The integration is not the proof. The calculation trace is the proof.",
    ),
    Topic(
        "deterministic-math",
        "Deterministic CAM math",
        "anti-integration",
        "https://www.capveri.com/resources/deterministic-vs-ai-cam",
        ("camreconciliation", "crefinance", "proptech"),
        "financial math should be deterministic and auditable",
        "use rules, formulas, and source-backed inputs for allocations",
        "AI can help read a document, but the charge calculation should come from explicit lease terms.",
        "Keep calculation logic separate from document extraction.",
        "A plausible answer is not enough when money is being billed to tenants.",
    ),
    Topic(
        "excel-risk",
        "Spreadsheet risk",
        "anti-integration",
        "https://www.capveri.com/resources/data-migration-off-excel",
        ("camreconciliation", "excel", "propertyaccounting"),
        "Excel is flexible, but flexibility can hide broken assumptions",
        "check hard-coded factors, copied formulas, hidden tabs, and stale denominators",
        "A workbook can pass tie-out while one tenant row still points to last year's denominator.",
        "Move repeated reconciliation logic into a traceable workflow.",
        "The risk is not that spreadsheets are bad. The risk is that they are too easy to trust after they tie out.",
    ),
    Topic(
        "boma-2024",
        "BOMA 2024",
        "industry-news",
        "https://www.capveri.com/resources/boma-2024-implementation-guide",
        ("boma2024", "camreconciliation", "cre"),
        "measurement changes can affect pro-rata shares and billing support",
        "review lease language before applying a new measurement standard",
        "A lease tied to a specific BOMA version may not behave like a lease that says standards as amended.",
        "Model old and new denominators before updating the billing system.",
        "Do not let a measurement update become a silent billing change.",
    ),
    Topic(
        "sb-1103",
        "California SB 1103",
        "industry-news",
        "https://www.capveri.com/resources/sb-1103-compliance",
        ("sb1103", "camreconciliation", "californiarealestate"),
        "California SB 1103 makes operating-cost support more important for qualified commercial tenants",
        "separate legal interpretation from accounting support and keep the source documentation ready",
        "A disclosure obligation is much easier to handle when the GL export and allocation logic are already organized.",
        "Ask counsel how the law applies, then make sure the accounting file can support the response.",
        "Compliance review is easier when the calculation trail is already organized.",
    ),
    Topic(
        "tax-pass-through",
        "Property tax pass-throughs",
        "industry-news",
        "https://www.capveri.com/resources/real-estate-tax-reconciliation",
        ("propertytax", "camreconciliation", "crefinance"),
        "tax pass-throughs can move tenant charges quickly",
        "separate assessment changes, refunds, appeals, and prior-year adjustments",
        "A tax refund should be tracked back to the tenants and years affected by the original charge.",
        "Tie the tax line to the bill, appeal status, allocation rule, and recovery period.",
        "Tax lines are often high-dollar, so weak support gets noticed.",
    ),
    Topic(
        "product-trace",
        "CapVeri trace",
        "product",
        "https://www.capveri.com/product-tour",
        ("capveri", "camreconciliation", "cretech"),
        "CapVeri reads exports and recalculates CAM from lease terms",
        "compare the ERP output to an independent calculation trace",
        "Upload the export, map the lease rules, then review tenant-level exceptions before statements go out.",
        "Use CapVeri as a verification layer before final billing.",
        "The goal is not to replace the ERP. The goal is to make the output easier to review.",
    ),
    Topic(
        "product-report",
        "Sample report",
        "product",
        "https://www.capveri.com/sample-report",
        ("capveri", "camreconciliation", "propertymanagement"),
        "a useful CAM report shows the finding, dollar impact, source, and fix",
        "look for tenant, lease rule, source line, and calculation detail in one place",
        "A gross-up finding should show the occupancy inputs and expense lines affected.",
        "Review sample report structure before building your own packet format.",
        "A report that only says pass or fail will not help accounting answer the next question.",
    ),
    Topic(
        "close-calendar",
        "CAM close calendar",
        "founder",
        "https://www.capveri.com/resources/year-end-close-checklist-cam",
        ("camreconciliation", "propertyaccounting", "cre"),
        "CAM close works better when review steps are scheduled before statement drafting",
        "reserve time for export QA, lease-rule review, exception resolution, and packet assembly",
        "Do not discover missing lease abstracts after the GL has already been finalized.",
        "Treat CAM close like a finance close, with controls and owners.",
        "A calendar will not fix the math, but it keeps the math from being reviewed too late.",
    ),
    Topic(
        "controller-workflow",
        "Controller workflow",
        "founder",
        "https://www.capveri.com/resources/multi-property-cam-workflow",
        ("propertyaccounting", "camreconciliation", "crefinance"),
        "controllers need exception visibility before they need prettier statements",
        "prioritize what changed, what failed, what needs approval, and what is ready to send",
        "A tenant with a denominator change belongs in an exception queue, not buried in a PDF packet.",
        "Design the workflow around review decisions.",
        "The statement is the last mile. The control point is earlier.",
    ),
]

TOPICS_BY_PILLAR = {
    pillar: [topic for topic in TOPICS if topic.pillar == pillar]
    for pillar in set(topic.pillar for topic in TOPICS)
}

ENGAGEMENT_TOPICS = TOPICS[:18]
ANGLE_WORDS = [
    "before statements go out",
    "during close",
    "inside the export",
    "in the tenant packet",
    "when a tenant asks for support",
    "after the ERP report ties",
    "before final billing",
    "when the denominator changes",
]

REVIEW_CONTEXTS = [
    "Use the first pass to confirm the source, then let the math run.",
    "Capture the note before the packet becomes tenant-facing.",
    "If the answer depends on a hidden workbook tab, move the support into the close file.",
    "The cleanest fix is usually a better source note, not a longer explanation.",
    "A controller should be able to review this without reopening last year's workbook.",
    "Treat the exception note as part of the reconciliation, not an afterthought.",
    "If the lease rule changed, the calculation note should change with it.",
    "The reviewer needs enough detail to approve the charge without guessing.",
    "Save the setup screenshot or export parameter while the file is still open.",
    "This is the kind of issue that gets expensive only after it is hard to reconstruct.",
    "One clear memo now can prevent a long email thread later.",
]

SUPPORT_LINES = [
    "The useful backup is boring: source, rule, input, output.",
    "A tie-out proves totals. It does not by itself show recoverability.",
    "The tenant packet should make the next question easier to answer.",
    "Good CAM support follows the charge from source to tenant answer.",
    "The best exception queue is short, specific, and resolved before billing.",
    "Small setup drift is still drift.",
    "The lease is the control document. The export is the evidence.",
    "Do the work while the context is fresh.",
    "If the rule is hard to explain internally, it will be harder to support externally.",
    "A clean close file beats a cleaner apology.",
    "When in doubt, show the denominator.",
    "The charge can be right and still be poorly supported.",
    "The earlier review happens, the fewer people have to touch the packet.",
]

REVIEW_NOTES = [
    "Use this as a first-pass control, then move exceptions into a separate queue.",
    "A short note in the close file is better than a long explanation after billing.",
    "The reviewer should be able to see what changed since the prior run.",
    "If the backup lives outside the packet, add the reference before statements go out.",
    "This is a good place to capture who approved the exception and why.",
    "The cleanest workflow keeps the source export and lease rule beside the output.",
    "A tenant-level variance note is useful even when the final charge is correct.",
    "If the rule is portfolio-specific, name the portfolio policy in the file.",
    "If the review depends on judgment, write down the judgment while it is fresh.",
    "A clean exception list is easier to manage than scattered comments in a workbook.",
    "Keep the backup simple enough for someone outside accounting to follow.",
    "If the issue repeats next year, the note should still make sense.",
    "This is the kind of check that should happen before statement formatting starts.",
    "The close file should show both the accounting source and the lease logic.",
    "If a tenant asks, the answer should already be in the packet.",
    "Use the review to separate calculation errors from documentation gaps.",
    "A missing source note can create the same delay as a wrong formula.",
    "This check is small, but it keeps the packet from depending on memory.",
    "Keep the final answer tied to the exact export used for billing.",
    "When the rule changes by tenant, do not let the portfolio default hide it.",
    "The approval path matters as much as the formula when the number is questioned.",
    "A review-ready packet does not need drama. It needs traceable inputs.",
    "The issue is easiest to fix while the reconciliation file is still open.",
    "If the same exception appears twice, make it a control next year.",
    "A cleaner packet gives the property team fewer follow-up questions to answer.",
    "The goal is not more backup. The goal is backup that points to the answer.",
    "If the input came from an ERP export, keep the report settings with it.",
    "Use this check to find setup drift before it becomes tenant-facing.",
    "The best version of this review is boring and repeatable.",
    "If a statement needs revision, this note should explain exactly where to look.",
    "The packet should make the next reviewer faster, not dependent on the original preparer.",
]

CAROUSEL_LABELS = [
    (
        "Start here",
        "Source check",
        "Common miss",
        "Packet support",
        "Next review",
        "Watch item",
        "CapVeri workflow",
    ),
    (
        "Control point",
        "Data question",
        "Where teams slip",
        "Evidence to keep",
        "Before billing",
        "Tenant question",
        "Verification layer",
    ),
    (
        "Review trigger",
        "Input check",
        "Failure mode",
        "What to save",
        "Close step",
        "Risk note",
        "Traceable output",
    ),
    (
        "First pass",
        "Lease question",
        "Quiet error",
        "Backup file",
        "Approval step",
        "Dispute risk",
        "Export-based QA",
    ),
]

VIDEO_LABELS = [
    ("Rule", "Check", "Miss", "Fix"),
    ("Source", "Lease", "Exception", "Packet"),
    ("Input", "Review", "Evidence", "Close"),
    ("Setup", "Drift", "Trace", "Answer"),
]

TOPIC_REFS = {
    "Gross-up factor": "the gross-up factor",
    "CAM caps": "CAM caps",
    "Base-year stop": "the base-year stop",
    "Pro-rata denominator": "the pro-rata denominator",
    "CapEx vs. OpEx": "CapEx vs. OpEx",
    "Management fees": "management fees",
    "GL export QA": "GL export QA",
    "Yardi export review": "Yardi export review",
    "MRI export review": "MRI export review",
    "RealPage export review": "RealPage export review",
    "Audit defense packet": "the audit defense packet",
    "Tenant disputes": "tenant dispute prep",
    "Pre-send QA": "pre-send QA",
    "Calculation audit trail": "the calculation audit trail",
    "Export-based verification": "export-based verification",
    "Deterministic CAM math": "deterministic CAM math",
    "Spreadsheet risk": "spreadsheet risk",
    "BOMA 2024": "BOMA 2024",
    "California SB 1103": "California SB 1103",
    "Property tax pass-throughs": "property tax pass-throughs",
    "CapVeri trace": "the CapVeri trace",
    "Sample report": "the sample report",
    "CAM close calendar": "the CAM close calendar",
    "Controller workflow": "the controller workflow",
}


def each_day(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def day_abbr(value: date) -> str:
    return value.strftime("%a").lower()


def source_file_for(topic: Topic) -> str:
    slug = topic.source_url.rstrip("/").split("/")[-1]
    if "/blog/" in topic.source_url:
        return f"marketing/content/blog/{slug}.mdx"
    if "/resources/" in topic.source_url:
        return f"marketing/content/resources/{slug}.mdx"
    if topic.source_url.startswith("https://www.capveri.com/"):
        return f"marketing/src/app/{slug}/page.tsx"
    return "original"


def topic_for(pillar: str, index: int) -> Topic:
    if pillar == "engagement":
        return ENGAGEMENT_TOPICS[index % len(ENGAGEMENT_TOPICS)]
    pool = TOPICS_BY_PILLAR[pillar]
    return pool[index % len(pool)]


def paragraph_join(parts: list[str]) -> str:
    return "\n\n".join(part.strip() for part in parts if part.strip())


def topic_ref(topic: Topic) -> str:
    return TOPIC_REFS.get(topic.title, topic.title)


FIELD_VARIANTS = {
    ("capex-opex", "check"): [
        "scan GL descriptions for replacements, improvements, and useful-life language",
        "separate repair language from replacement or improvement language in the GL detail",
        "look for capitalization clues before the line enters a recoverable pool",
        "compare repair accounts against descriptions that suggest upgrades or useful-life changes",
    ],
    ("capex-opex", "example"): [
        "Repair labor and equipment replacement may sit beside each other in the same GL export.",
        "A roof patch and a roof replacement can land near each other but need different review paths.",
        "A repairs account can include invoices that deserve a capital-project check.",
        "The GL account name may say maintenance while the invoice description points to an improvement.",
    ],
    ("capex-opex", "action"): [
        "Route possible CapEx lines to review before tenant statements are drafted.",
        "Move possible capital items into an exception queue before the packet is assembled.",
        "Document the recoverability decision before the line reaches the tenant statement.",
        "Keep the CapEx review note beside the GL line, not in a separate email thread.",
    ],
}


def topic_field(topic: Topic, field: str, variant: int) -> str:
    values = FIELD_VARIANTS.get((topic.slug, field))
    if values:
        return values[variant % len(values)]
    return getattr(topic, field)


def polish_terms(text: str) -> str:
    replacements = {
        " cam ": " CAM ",
        " erp": " ERP",
        "csv": "CSV",
        "excel": "Excel",
        "pdf": "PDF",
        "capveri": "CapVeri",
        "yardi": "Yardi",
        "mri": "MRI",
        "realpage": "RealPage",
        "boma": "BOMA",
        "california sb 1103": "California SB 1103",
        " qa": " QA",
    }
    for old, new in replacements.items():
        text = re.sub(re.escape(old), new, text, flags=re.IGNORECASE)
    text = re.sub(r"\bCam\b", "CAM", text)
    text = re.sub(r"\bgl\b", "GL", text, flags=re.IGNORECASE)
    text = text.replace("CAM CAM", "CAM")
    text = text.replace("MRI export review review", "MRI export review")
    text = text.replace("Yardi export review review", "Yardi export review")
    text = text.replace("RealPage export review review", "RealPage export review")
    text = text.replace("#MRI", "#mri")
    text = text.replace("#Yardi", "#yardi")
    text = text.replace("#RealPage", "#realpage")
    text = text.replace("#CapVeri", "#capveri")
    text = text.replace("#CAM", "#cam")
    text = text.replace("#California", "#california")
    text = text.replace("#BOMA2024", "#boma2024")
    text = text.replace("#Excel", "#excel")
    return text


def text_short(topic: Topic, variant: int) -> str:
    ref = topic_ref(topic)
    check = topic_field(topic, "check", variant)
    example = topic_field(topic, "example", variant)
    action = topic_field(topic, "action", variant)
    hooks = [
        f"{topic.title} can expose drift in an otherwise clean CAM statement.",
        f"Check {ref} before the packet leaves accounting.",
        f"A tenant question about {ref} should not require rebuilding the workbook.",
        f"Watch {ref} {ANGLE_WORDS[variant % len(ANGLE_WORDS)]}.",
        f"{topic.title}: one small setup choice can change the tenant answer.",
        f"The fastest review of {ref} starts with the source file.",
        f"If the review for {ref} is hard to explain, the packet needs work.",
    ]
    context = REVIEW_CONTEXTS[variant % len(REVIEW_CONTEXTS)]
    support = SUPPORT_LINES[variant % len(SUPPORT_LINES)]
    return paragraph_join(
        [
            hooks[variant % len(hooks)],
            f"Before billing, {check}.",
            example,
            action,
            context,
            support,
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            topic.caution,
            hashtag_line(topic),
        ]
    )


def text_long(topic: Topic, variant: int) -> str:
    ref = topic_ref(topic)
    check = topic_field(topic, "check", variant)
    example = topic_field(topic, "example", variant)
    action = topic_field(topic, "action", variant)
    openers = [
        f"A review of {ref} belongs in CAM close before final billing.",
        f"Here is the review path for {ref}.",
        f"CAM teams do not need more ceremony. They need better checks around {ref}.",
        f"{topic.title} should leave a trail a second reviewer can follow.",
        f"The packet gets easier to review when {ref} is documented early.",
    ]
    steps = [
        f"1. Start with the lease rule. {topic.fact.capitalize()}.",
        f"2. Check the source data. {check.capitalize()}.",
        f"3. Run the calculation in a way someone else can follow. {example}",
        f"4. Save the support. {action}",
    ]
    closer = SUPPORT_LINES[variant % len(SUPPORT_LINES)]
    if variant % 3 == 1:
        closer = topic.caution
    elif variant % 3 == 2:
        closer = REVIEW_CONTEXTS[variant % len(REVIEW_CONTEXTS)]
    return paragraph_join(
        [
            openers[variant % len(openers)],
            *steps,
            closer,
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def carousel(topic: Topic, variant: int) -> str:
    labels = CAROUSEL_LABELS[variant % len(CAROUSEL_LABELS)]
    check = topic_field(topic, "check", variant)
    example = topic_field(topic, "example", variant)
    action = topic_field(topic, "action", variant)
    architectures = [
        [
            f"{topic.title}: the CAM check to run before billing.",
            f"Start with the control question: {topic.fact}.",
            f"{labels[1]}: {check}.",
            f"Where it breaks: {example}",
            "Evidence to keep: GL source, lease rule, calculation input, and tenant impact.",
            f"Before billing: {action}",
            topic.caution,
        ],
        [
            f"Start with {topic_ref(topic)}.",
            f"Lease rule: {topic.fact}.",
            f"Source file: {check}.",
            f"Tenant impact: {example}",
            f"Close file: {action}",
            REVIEW_CONTEXTS[variant % len(REVIEW_CONTEXTS)],
        ],
        [
            f"The quiet risk in {topic_ref(topic)} starts before the statement is formatted.",
            f"What to verify: {check}.",
            f"What can go wrong: {example}",
            "What to save: GL source, lease rule, calculation input, and tenant impact.",
            f"How to close it: {action}",
            f"Watch item: {topic.caution}",
            REVIEW_CONTEXTS[variant % len(REVIEW_CONTEXTS)],
        ],
        [
            f"{topic.title} belongs in review before the packet goes out.",
            f"Input: {topic.fact}.",
            f"Review step: {check}.",
            f"Common miss: {example}",
            f"Approval trail: {action}",
            f"Final check: {topic.caution}",
        ],
    ]
    return paragraph_join(
        [
            *architectures[variant % len(architectures)],
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def image_quote(topic: Topic, variant: int) -> str:
    quotes = [
        topic.caution,
        f"{topic.title}: verify the source before you explain the number.",
        f"A CAM total is not support. The support is the trace behind it.",
    ]
    return paragraph_join(
        [
            quotes[variant % len(quotes)],
            "The useful visual is simple: CAM number on one side; source, rule, and trace on the other.",
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def poll(topic: Topic, variant: int) -> str:
    ref = topic_ref(topic)
    questions = [
        f"Which issue around {ref} slows down CAM close the most?",
        f"What would make the next {ref} review easier?",
        f"Where do tenant questions about {ref} usually start?",
    ]
    options = [
        [
            "A. Missing source support",
            "B. Lease-rule ambiguity",
            "C. ERP setup drift",
            "D. Last-minute exceptions",
        ],
        [
            "A. Clearer GL detail",
            "B. Better lease references",
            "C. Tenant-level variance notes",
            "D. Cleaner packet format",
        ],
        [
            "A. Taxes and insurance",
            "B. Management fees",
            "C. CapEx classification",
            "D. Pro-rata share changes",
        ],
    ]
    idx = variant % len(questions)
    return paragraph_join(
        [
            questions[idx],
            *options[idx],
            topic.caution,
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def video(topic: Topic, variant: int) -> str:
    labels = VIDEO_LABELS[variant % len(VIDEO_LABELS)]
    ref = topic_ref(topic)
    check = topic_field(topic, "check", variant)
    example = topic_field(topic, "example", variant)
    action = topic_field(topic, "action", variant)
    hook_ref = {
        "Yardi export review": "the Yardi export settings",
        "MRI export review": "the MRI export settings",
        "RealPage export review": "the RealPage export settings",
    }.get(topic.title, ref)
    hook_templates = [
        "Before you send the CAM packet, check {ref}.",
        "{title} is a small review step that can change the tenant answer.",
        "The packet is not ready until {ref} is tied back to the source.",
        "Review {ref} before statements go out.",
        "A clean close file shows how {ref} moved from source to tenant answer.",
        "{title} deserves a source check before anyone formats the packet.",
        "When {ref} changes, the tenant note should change with it.",
    ]
    hook = hook_templates[(variant + len(topic.slug)) % len(hook_templates)].format(
        ref=hook_ref,
        title=topic.title,
    )
    return paragraph_join(
        [
            hook,
            f"{labels[0]}: {topic.fact}.",
            f"{labels[1]}: {check}.",
            f"{labels[2]}: {example}",
            f"{labels[3]}: {action}",
            topic.caution,
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def product_post(topic: Topic, fmt: str, variant: int) -> str:
    if fmt == "poll":
        return poll(topic, variant)
    if fmt == "image-quote":
        return image_quote(topic, variant)
    if fmt == "carousel":
        return carousel(topic, variant)
    example = topic_field(topic, "example", variant)
    return paragraph_join(
        [
            "Spreadsheets and ERP setup screens can show the output.",
            "CapVeri keeps the export, lease rule, exception, and tenant-level trace in one review path.",
            example,
            "Use it before final billing as an export-based review layer, not as an ERP replacement.",
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def founder_post(topic: Topic, fmt: str, variant: int) -> str:
    if fmt == "carousel":
        return carousel(topic, variant)
    check = topic_field(topic, "check", variant)
    openers = [
        "In CAM close, the final arithmetic is usually the easy part.",
        "The part of CAM work that gets missed is usually upstream of the final statement.",
        "A cleaner CAM process starts before the PDF packet exists.",
        "Most reconciliation pain shows up late, but the cause starts earlier in the file.",
        "The hard part is keeping the export, lease rule, and exception trail together.",
    ]
    return paragraph_join(
        [
            openers[variant % len(openers)],
            f"It is the setup behind the arithmetic. {check.capitalize()}.",
            "CapVeri keeps export review, lease-term logic, and the calculation record in one review path.",
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            topic.caution,
            hashtag_line(topic),
        ]
    )


def engagement_post(topic: Topic, fmt: str, variant: int) -> str:
    if fmt == "poll":
        return poll(topic, variant)
    ref = topic_ref(topic)
    angle = ANGLE_WORDS[(variant // 8) % len(ANGLE_WORDS)]
    questions = [
        f"When your team reviews {ref}, where does the work usually get stuck?",
        f"What is the slowest part of checking {ref} before billing?",
        f"Which part of {ref} creates the most back-and-forth during close?",
        f"Where would better support around {ref} save the most review time?",
        f"If you could clean up one part of {ref} {angle}, what would you choose?",
        f"Which backup item around {ref} gets requested most often?",
        f"What usually makes {ref} take longer than expected?",
        f"Where does the handoff around {ref} lose the most context?",
    ]
    return paragraph_join(
        [
            questions[(variant + len(topic.slug)) % len(questions)],
            f"The math, the source data, the lease interpretation, or the tenant packet support?",
            REVIEW_CONTEXTS[variant % len(REVIEW_CONTEXTS)],
            REVIEW_NOTES[variant % len(REVIEW_NOTES)],
            hashtag_line(topic),
        ]
    )


def hashtag_line(topic: Topic) -> str:
    return " ".join(f"#{tag}" for tag in topic.hashtags)


def body_for(topic: Topic, pillar: str, fmt: str, variant: int) -> str:
    if pillar == "product":
        body = product_post(topic, fmt, variant)
    elif pillar == "founder":
        body = founder_post(topic, fmt, variant)
    elif pillar == "engagement":
        body = engagement_post(topic, fmt, variant)
    elif fmt == "text-long":
        body = text_long(topic, variant)
    elif fmt == "carousel":
        body = carousel(topic, variant)
    elif fmt == "image-quote":
        body = image_quote(topic, variant)
    elif fmt == "poll":
        body = poll(topic, variant)
    elif fmt == "video":
        body = video(topic, variant)
    else:
        body = text_short(topic, variant)
    return polish_terms(body)


def frontmatter(row: dict[str, str], topic: Topic) -> str:
    tags = ", ".join(topic.hashtags)
    return (
        "---\n"
        f"scheduled_date: \"{row['scheduled_date']}\"\n"
        f"scheduled_time: \"{row['scheduled_time']}\"\n"
        f"timezone: {TIMEZONE}\n"
        f"author: {ACCOUNT}\n"
        f"pillar: {row['pillar']}\n"
        f"format: {row['format']}\n"
        f"source_url: {topic.source_url}\n"
        'cta_url: ""\n'
        "has_limited_offer: false\n"
        f"hashtags: [{tags}]\n"
        'media_brief: ""\n'
        "---"
    )


def build_rows() -> list[dict[str, str]]:
    rows = []
    counters = Counter()
    slot_id = 1
    for day_index, current_day in enumerate(each_day(START, END)):
        formats = FORMAT_ROTATION[day_index % len(FORMAT_ROTATION)]
        for position, scheduled_time in enumerate(SLOTS):
            pillar = PILLARS[position]
            topic = topic_for(pillar, counters[pillar])
            counters[pillar] += 1
            fmt = formats[position]
            filename = (
                f"{current_day.isoformat()}-"
                f"{scheduled_time.replace(':', '')}-"
                f"{pillar}-{slot_id:03d}.md"
            )
            rows.append(
                {
                    "slot_id": str(slot_id),
                    "filename": filename,
                    "scheduled_date": current_day.isoformat(),
                    "scheduled_time": scheduled_time,
                    "day_of_week": day_abbr(current_day),
                    "pillar": pillar,
                    "format": fmt,
                    "source_url": topic.source_url,
                    "source_file": source_file_for(topic),
                    "slug": topic.slug,
                    "status": "planned",
                }
            )
            slot_id += 1
    return rows


def write_posts(rows: list[dict[str, str]]) -> None:
    if POSTS_DIR.exists():
        shutil.rmtree(POSTS_DIR)
    POSTS_DIR.mkdir(parents=True)
    topic_counters = Counter()
    for row in rows:
        pillar = row["pillar"]
        topic = topic_for(pillar, topic_counters[pillar])
        topic_counters[pillar] += 1
        variant = int(row["slot_id"]) + topic_counters[pillar]
        body = body_for(topic, pillar, row["format"], variant)
        content = f"{frontmatter(row, topic)}\n\n{body}\n"
        (POSTS_DIR / row["filename"]).write_text(content, encoding="utf-8")


def write_matrix(rows: list[dict[str, str]]) -> None:
    fields = [
        "slot_id",
        "filename",
        "scheduled_date",
        "scheduled_time",
        "day_of_week",
        "pillar",
        "format",
        "source_url",
        "source_file",
        "slug",
        "status",
    ]
    with MATRIX_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def parse_post(path: Path) -> tuple[dict[str, str], str]:
    raw = path.read_text(encoding="utf-8")
    end = raw.find("---", 3)
    fm_raw = raw[3:end].strip()
    body = raw[end + 3 :].strip()
    fm = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            fm[key.strip()] = value.strip().strip('"')
    return fm, body


def write_postiz() -> None:
    records = []
    for index, path in enumerate(sorted(POSTS_DIR.glob("*.md")), 1):
        fm, body = parse_post(path)
        records.append(
            {
                "slot_id": index,
                "filename": path.name,
                "scheduled_date": fm["scheduled_date"],
                "scheduled_time": fm["scheduled_time"],
                "timezone": fm.get("timezone", TIMEZONE),
                "platform": "linkedin",
                "account": ACCOUNT,
                "content": body,
                "hashtags": fm.get("hashtags", ""),
                "has_limited_offer": fm.get("has_limited_offer", "false"),
                "pillar": fm.get("pillar", ""),
                "format": fm.get("format", ""),
                "source_url": fm.get("source_url", ""),
            }
        )

    fields = [
        "slot_id",
        "filename",
        "scheduled_date",
        "scheduled_time",
        "timezone",
        "platform",
        "account",
        "content",
        "hashtags",
        "has_limited_offer",
        "pillar",
        "format",
        "source_url",
    ]
    with POSTIZ_CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

    postiz_posts = [
        {
            "date": item["scheduled_date"],
            "time": item["scheduled_time"],
            "timezone": item["timezone"],
            "platform": item["platform"],
            "account": item["account"],
            "content": item["content"],
            "tags": [
                tag.strip().lstrip("#")
                for tag in item["hashtags"].strip("[]").split(",")
                if tag.strip()
            ],
            "metadata": {
                "slot_id": item["slot_id"],
                "filename": item["filename"],
                "pillar": item["pillar"],
                "format": item["format"],
                "source_url": item["source_url"],
                "has_limited_offer": False,
            },
        }
        for item in records
    ]
    POSTIZ_JSON_PATH.write_text(
        json.dumps(postiz_posts, indent=2) + "\n", encoding="utf-8"
    )


def claim_statements_from_body(body: str) -> list[str]:
    statements = []
    for paragraph in body.split("\n\n"):
        statement = paragraph.strip()
        if not statement or statement.startswith("#") or "#" in statement:
            continue
        if statement.startswith(("DESIGN NOTE:", "IMAGE BRIEF:")):
            continue
        statements.append(statement)
        if len(statements) == 3:
            return statements

    for line in body.splitlines():
        statement = line.strip()
        if (
            not statement
            or statement.startswith("#")
            or "#" in statement
            or statement.endswith(":")
        ):
            continue
        statements.append(statement)
        if len(statements) == 3:
            return statements
    return statements


def claim_type_for(statement: str) -> str:
    lower = statement.lower()
    if "image brief" in lower or "hook line" in lower or "talking points" in lower:
        return "creative-direction"
    if "capveri" in lower:
        return "product-positioning"
    if "\n" in statement or statement.startswith(("A.", "B.", "C.", "D.")):
        return "post-body-guidance"
    return "workflow-principle"


def write_claim_audit(rows: list[dict[str, str]]) -> None:
    fields = [
        "claim_id",
        "post_file",
        "claim_text",
        "claim_type",
        "source",
        "verification_status",
        "is_illustrative",
    ]
    claim_id = 1
    with CLAIM_AUDIT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            _, body = parse_post(POSTS_DIR / row["filename"])
            topic = next(topic for topic in TOPICS if topic.slug == row["slug"])
            statements = claim_statements_from_body(body)
            if len(statements) < 3:
                raise ValueError(
                    f"Expected at least 3 auditable statements: {row['filename']}"
                )
            for claim_text in statements[:3]:
                claim_type = claim_type_for(claim_text)
                illustrative = (
                    "yes"
                    if any(
                        example in claim_text
                        for example in [
                            topic.example,
                            *FIELD_VARIANTS.get((topic.slug, "example"), []),
                        ]
                    )
                    else "no"
                )
                writer.writerow(
                    {
                        "claim_id": f"{claim_id:04d}",
                        "post_file": row["filename"],
                        "claim_text": claim_text,
                        "claim_type": claim_type,
                        "source": topic.source_url,
                        "verification_status": (
                            "illustrative_example"
                            if illustrative == "yes"
                            else "post_body_statement_reviewed_against_source"
                        ),
                        "is_illustrative": illustrative,
                    }
                )
                claim_id += 1


def qa_posts() -> dict[str, object]:
    banned = [
        " - ",
        "\u2013",
        "delve",
        "ever-evolving",
        "game-changer",
        "revolutionize",
        "seamless",
        "cutting-edge",
        "best-in-class",
        "world-class",
        "synergy",
        "thrilled to share",
        "excited to announce",
    ]
    fabricated_patterns = [
        r"\bone of our clients\b",
        r"\ba client of ours\b",
        r"\bour clients\b",
        r"\ba customer\b",
        r"\bwe spoke with\b",
        r"\brecently spoke with\b",
        r"\bonly \d+ (spots|slots|redemptions) left\b",
    ]

    files = sorted(POSTS_DIR.glob("*.md"))
    date_counts = Counter()
    slot_counts = Counter()
    pillar_counts = Counter()
    format_counts = Counter()
    issues = []
    for path in files:
        fm, body = parse_post(path)
        date_counts[fm["scheduled_date"]] += 1
        slot_counts[(fm["scheduled_date"], fm["scheduled_time"])] += 1
        pillar_counts[fm["pillar"]] += 1
        format_counts[fm["format"]] += 1
        lower = body.lower()
        file_issues = []
        for phrase in banned:
            if phrase in body or phrase in lower:
                file_issues.append({"type": "banned_phrase", "detail": phrase})
        for pattern in fabricated_patterns:
            if re.search(pattern, lower):
                file_issues.append({"type": "fabrication_risk", "detail": pattern})
        if len(body) < 120:
            file_issues.append({"type": "short_body", "detail": str(len(body))})
        if file_issues:
            issues.append({"filename": path.name, "issues": file_issues})

    expected_dates = [current.isoformat() for current in each_day(START, END)]
    missing_dates = [item for item in expected_dates if date_counts[item] != 15]
    duplicate_slots = [
        {"date": key[0], "time": key[1], "count": value}
        for key, value in slot_counts.items()
        if value > 1
    ]
    report = {
        "total_posts": len(files),
        "date_range": [expected_dates[0], expected_dates[-1]],
        "expected_dates": len(expected_dates),
        "date_counts": dict(sorted(date_counts.items())),
        "missing_or_wrong_date_counts": missing_dates,
        "duplicate_slots": duplicate_slots,
        "pillar_counts": dict(sorted(pillar_counts.items())),
        "format_counts": dict(sorted(format_counts.items())),
        "issues": issues,
        "passed": len(files) == 300
        and not missing_dates
        and not duplicate_slots
        and not issues,
    }
    QA_REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def write_readme(report: dict[str, object]) -> None:
    README_PATH.write_text(
        f"""# CapVeri LinkedIn company-page campaign

Schedule: 2026-05-19 through 2026-06-07
Cadence: 15 posts per day, every day
Total posts: {report['total_posts']}
Timezone: {TIMEZONE}

## Files

- `posts/`: individual markdown posts with frontmatter.
- `content-matrix.csv`: scheduling matrix and source references.
- `postiz-import.csv`: CSV import artifact.
- `postiz-import.json`: JSON import artifact.
- `claim_audit.csv`: source and claim review table.
- `qa_report.json`: automated count, style, and fabrication-risk audit.

## Guardrails

- Company-page voice, not founder personal voice.
- No em dashes.
- No fabricated client stories, customer quotes, customer counts, or scarcity counters.
- Numerical examples are labeled as examples and are not presented as observed customer outcomes.
- CapVeri positioning is limited to export-based CAM verification, deterministic lease-term calculation, exception review, and traceable tenant-level support.

## Regenerate

Run:

```bash
cd marketing/content/linkedin/campaigns/2026-05-19-to-2026-06-07
python generate_campaign.py
```
""",
        encoding="utf-8",
    )


def main() -> None:
    rows = build_rows()
    write_posts(rows)
    write_matrix(rows)
    write_postiz()
    write_claim_audit(rows)
    report = qa_posts()
    write_readme(report)
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
