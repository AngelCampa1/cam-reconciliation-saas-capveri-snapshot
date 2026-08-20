"""Registry of all lead magnet assets.

This registry is the contract for public lead capture. If a slug is listed
here, it must have a real R2 object and centralized Sequencer enrollment.
"""

from typing import Literal

from pydantic import BaseModel

R2_STORAGE_PREFIX = "lead-magnets/2026-06-25/"


def r2_storage_path(filename: str) -> str:
    return f"{R2_STORAGE_PREFIX}{filename}"


class LeadMagnetAsset(BaseModel):
    slug: str
    display_name: str
    format: Literal["pdf", "xlsx", "calculator_unlock"]
    storage_path: str
    category: Literal["calculator", "checklist", "framework", "template"]
    enabled: bool


ASSETS: dict[str, LeadMagnetAsset] = {
    "cam-gross-up-calculator": LeadMagnetAsset(
        slug="cam-gross-up-calculator",
        display_name="CAM Gross-Up Scenario Calculator",
        format="xlsx",
        storage_path=r2_storage_path("cam-gross-up-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "lease-abstract-matrix": LeadMagnetAsset(
        slug="lease-abstract-matrix",
        display_name="Lease Abstract Discrepancy Matrix",
        format="xlsx",
        storage_path=r2_storage_path("lease-abstract-matrix.xlsx"),
        category="framework",
        enabled=True,
    ),
    "cam-reconciliation-checklist": LeadMagnetAsset(
        slug="cam-reconciliation-checklist",
        display_name="CAM Reconciliation Review Checklist",
        format="pdf",
        storage_path=r2_storage_path("cam-reconciliation-checklist.pdf"),
        category="checklist",
        enabled=True,
    ),
    "boma-2024-calculator": LeadMagnetAsset(
        slug="boma-2024-calculator",
        display_name="BOMA 2024 Calculator",
        format="calculator_unlock",
        storage_path=r2_storage_path("boma-2024-calculator.pdf"),
        category="calculator",
        enabled=True,
    ),
    "fixed-cam-vs-traditional": LeadMagnetAsset(
        slug="fixed-cam-vs-traditional",
        display_name="Fixed CAM vs Traditional Comparison",
        format="calculator_unlock",
        storage_path=r2_storage_path("fixed-cam-vs-traditional.pdf"),
        category="calculator",
        enabled=True,
    ),
    "admin-fee-calculator": LeadMagnetAsset(
        slug="admin-fee-calculator",
        display_name="Admin Fee Calculator",
        format="xlsx",
        storage_path=r2_storage_path("admin-fee-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "cam-estimate-forecaster": LeadMagnetAsset(
        slug="cam-estimate-forecaster",
        display_name="CAM Estimate Forecaster",
        format="xlsx",
        storage_path=r2_storage_path("cam-estimate-forecaster.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "boma-remeasurement-impact": LeadMagnetAsset(
        slug="boma-remeasurement-impact",
        display_name="BOMA Remeasurement Impact Analyzer",
        format="xlsx",
        storage_path=r2_storage_path("boma-remeasurement-impact.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "cam-cap-calculator": LeadMagnetAsset(
        slug="cam-cap-calculator",
        display_name="CAM Cap Calculator",
        format="xlsx",
        storage_path=r2_storage_path("cam-cap-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "base-year-escalation": LeadMagnetAsset(
        slug="base-year-escalation",
        display_name="Base Year Escalation Calculator",
        format="xlsx",
        storage_path=r2_storage_path("base-year-escalation.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "reconciliation-statement-generator": LeadMagnetAsset(
        slug="reconciliation-statement-generator",
        display_name="Reconciliation Statement Generator",
        format="xlsx",
        storage_path=r2_storage_path("reconciliation-statement-generator.xlsx"),
        category="template",
        enabled=True,
    ),
    "recovery-gap-analyzer": LeadMagnetAsset(
        slug="recovery-gap-analyzer",
        display_name="Recovery Gap Analyzer",
        format="xlsx",
        storage_path=r2_storage_path("recovery-gap-analyzer.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "pro-rata-calculator": LeadMagnetAsset(
        slug="pro-rata-calculator",
        display_name="Pro-Rata Share Calculator",
        format="xlsx",
        storage_path=r2_storage_path("pro-rata-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "hcad-tax-normalizer": LeadMagnetAsset(
        slug="hcad-tax-normalizer",
        display_name="HCAD Tax Normalizer",
        format="xlsx",
        storage_path=r2_storage_path("hcad-tax-normalizer.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "noi-impact-calculator": LeadMagnetAsset(
        slug="noi-impact-calculator",
        display_name="NOI Impact Calculator",
        format="xlsx",
        storage_path=r2_storage_path("noi-impact-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "cam-leakage-estimator": LeadMagnetAsset(
        slug="cam-leakage-estimator",
        display_name="CAM Leakage Estimator",
        format="xlsx",
        storage_path=r2_storage_path("cam-leakage-estimator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "cam-overcharge-calculator": LeadMagnetAsset(
        slug="cam-overcharge-calculator",
        display_name="Tenant Challenge Exposure Calculator",
        format="calculator_unlock",
        storage_path=r2_storage_path("cam-overcharge-calculator.pdf"),
        category="calculator",
        enabled=True,
    ),
    "audit-risk-scorecard": LeadMagnetAsset(
        slug="audit-risk-scorecard",
        display_name="Pre-Send Audit Exposure Scorecard",
        format="pdf",
        storage_path=r2_storage_path("audit-risk-scorecard.pdf"),
        category="checklist",
        enabled=True,
    ),
    "sb-1103-checker": LeadMagnetAsset(
        slug="sb-1103-checker",
        display_name="SB 1103 Compliance Checker",
        format="pdf",
        storage_path=r2_storage_path("sb-1103-checker.pdf"),
        category="checklist",
        enabled=True,
    ),
    "audit-risk-quiz": LeadMagnetAsset(
        slug="audit-risk-quiz",
        display_name="Pre-Send Audit Exposure Quiz",
        format="pdf",
        storage_path=r2_storage_path("audit-risk-quiz.pdf"),
        category="checklist",
        enabled=True,
    ),
    "cam-reconciliation-statement": LeadMagnetAsset(
        slug="cam-reconciliation-statement",
        display_name="Tenant CAM Statement Outline",
        format="pdf",
        storage_path=r2_storage_path("cam-reconciliation-statement.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-reconciliation-excel": LeadMagnetAsset(
        slug="cam-reconciliation-excel",
        display_name="CAM Reconciliation Excel Template",
        format="xlsx",
        storage_path=r2_storage_path("cam-reconciliation-excel.xlsx"),
        category="template",
        enabled=True,
    ),
    "tenant-cam-reconciliation-letter": LeadMagnetAsset(
        slug="tenant-cam-reconciliation-letter",
        display_name="Landlord CAM Reconciliation Cover Letter",
        format="pdf",
        storage_path=r2_storage_path("tenant-cam-reconciliation-letter.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-reconciliation-california": LeadMagnetAsset(
        slug="cam-reconciliation-california",
        display_name="California CAM Packet Starter",
        format="pdf",
        storage_path=r2_storage_path("cam-reconciliation-california.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-reconciliation-texas": LeadMagnetAsset(
        slug="cam-reconciliation-texas",
        display_name="Texas CAM Packet Starter",
        format="pdf",
        storage_path=r2_storage_path("cam-reconciliation-texas.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-reconciliation-florida": LeadMagnetAsset(
        slug="cam-reconciliation-florida",
        display_name="Florida CAM Packet Starter",
        format="pdf",
        storage_path=r2_storage_path("cam-reconciliation-florida.pdf"),
        category="template",
        enabled=True,
    ),
    "nnn-lease-cam-reconciliation": LeadMagnetAsset(
        slug="nnn-lease-cam-reconciliation",
        display_name="NNN Lease CAM Reconciliation Template",
        format="pdf",
        storage_path=r2_storage_path("nnn-lease-cam-reconciliation.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-dispute-response-template": LeadMagnetAsset(
        slug="cam-dispute-response-template",
        display_name="CAM Dispute Response Template",
        format="pdf",
        storage_path=r2_storage_path("cam-dispute-response-template.pdf"),
        category="template",
        enabled=True,
    ),
    "cam-estimate-letter": LeadMagnetAsset(
        slug="cam-estimate-letter",
        display_name="CAM Estimate / Budget Letter",
        format="pdf",
        storage_path=r2_storage_path("cam-estimate-letter.pdf"),
        category="template",
        enabled=True,
    ),
    "cumulative-cap-bank-calculator": LeadMagnetAsset(
        slug="cumulative-cap-bank-calculator",
        display_name="Cumulative CAM Cap Bank Calculator",
        format="xlsx",
        storage_path=r2_storage_path("cumulative-cap-bank-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "cam-pre-send-packet-checklist": LeadMagnetAsset(
        slug="cam-pre-send-packet-checklist",
        display_name="CAM Pre-Send Packet Checklist",
        format="pdf",
        storage_path=r2_storage_path("cam-pre-send-packet-checklist.pdf"),
        category="checklist",
        enabled=True,
    ),
    "yardi-export-qa-checklist": LeadMagnetAsset(
        slug="yardi-export-qa-checklist",
        display_name="Yardi Export Error Checklist",
        format="pdf",
        storage_path=r2_storage_path("yardi-export-qa-checklist.pdf"),
        category="checklist",
        enabled=True,
    ),
    "mri-recovery-billing-qa-checklist": LeadMagnetAsset(
        slug="mri-recovery-billing-qa-checklist",
        display_name="MRI Recovery Billing Error Checklist",
        format="pdf",
        storage_path=r2_storage_path("mri-recovery-billing-qa-checklist.pdf"),
        category="checklist",
        enabled=True,
    ),
    "multi-state-cam-disclosure-matrix": LeadMagnetAsset(
        slug="multi-state-cam-disclosure-matrix",
        display_name="Multi-State CAM Packet Review Checklist",
        format="pdf",
        storage_path=r2_storage_path("multi-state-cam-disclosure-matrix.pdf"),
        category="checklist",
        enabled=True,
    ),
    "cam-recovery-ratio-worksheet": LeadMagnetAsset(
        slug="cam-recovery-ratio-worksheet",
        display_name="CAM Recovery Ratio Benchmark Worksheet",
        format="xlsx",
        storage_path=r2_storage_path("cam-recovery-ratio-worksheet.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "property-tax-appeal-recovery-calculator": LeadMagnetAsset(
        slug="property-tax-appeal-recovery-calculator",
        display_name="Property Tax Appeal Recovery Calculator",
        format="xlsx",
        storage_path=r2_storage_path("property-tax-appeal-recovery-calculator.xlsx"),
        category="calculator",
        enabled=True,
    ),
    "tenant-dispute-response-letter-template": LeadMagnetAsset(
        slug="tenant-dispute-response-letter-template",
        display_name="Tenant CAM Dispute Response Letter",
        format="pdf",
        storage_path=r2_storage_path("tenant-dispute-response-letter-template.pdf"),
        category="template",
        enabled=True,
    ),
    "audit-defense-packet-builder": LeadMagnetAsset(
        slug="audit-defense-packet-builder",
        display_name="Audit Defense Packet Builder",
        format="pdf",
        storage_path=r2_storage_path("audit-defense-packet-builder.pdf"),
        category="template",
        enabled=True,
    ),
    "lease-clause-extraction-matrix": LeadMagnetAsset(
        slug="lease-clause-extraction-matrix",
        display_name="Lease Clause Extraction Matrix",
        format="xlsx",
        storage_path=r2_storage_path("lease-clause-extraction-matrix.xlsx"),
        category="template",
        enabled=True,
    ),
}


def get_asset(slug: str) -> LeadMagnetAsset | None:
    return ASSETS.get(slug)


DOWNLOAD_SLUGS: frozenset[str] = frozenset(
    s for s, a in ASSETS.items() if a.format in ("pdf", "xlsx") and a.enabled
)

CALCULATOR_UNLOCK_SLUGS: frozenset[str] = frozenset(
    s for s, a in ASSETS.items() if a.format == "calculator_unlock" and a.enabled
)
