"""
Generator for test documents with realistic extraction results for E2E testing.

Creates documents in READY_FOR_REVIEW status with complete extraction_result JSONB
including profiles, confidence scores, and bounding boxes.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4


def generate_extraction_result():
    """
    Generate realistic extraction_result JSONB for a lease document.

    Returns a dict with:
    - profile: LeaseRecoveryProfile data
    - confidence_scores: Dict of field -> confidence (0-1)
    - source_references: List of bounding box references
    """
    return {
        "profile": {
            "base_year": 2023,
            "pro_rata_share": 0.0525,
            "admin_fee_percent": 0.15,
            "gross_up_target": 0.95,
            "cap_type": "cumulative",
            "cap_rate": 0.05,
            "expense_stop": 12500.00,
            "tenant_name": "Acme Corporation",
            "suite_number": "Suite 204",
        },
        "confidence_scores": {
            "base_year": 0.95,
            "pro_rata_share": 0.78,  # Low confidence - will show warning
            "admin_fee_percent": 0.88,
            "gross_up_target": 0.92,
            "cap_type": 0.85,
            "cap_rate": 0.91,
            "expense_stop": 0.65,  # Low confidence - will show warning
            "tenant_name": 0.98,
            "suite_number": 0.96,
        },
        "source_references": [
            {
                "field": "base_year",
                "text": "Base Year: 2023",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.25,
                    "width": 0.20,
                    "height": 0.02,
                },
            },
            {
                "field": "pro_rata_share",
                "text": "Pro Rata Share: 5.25%",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.30,
                    "width": 0.25,
                    "height": 0.02,
                },
            },
            {
                "field": "admin_fee_percent",
                "text": "Administrative Fee: 15%",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.35,
                    "width": 0.28,
                    "height": 0.02,
                },
            },
            {
                "field": "gross_up_target",
                "text": "Gross-Up to 95% Occupancy",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.40,
                    "width": 0.30,
                    "height": 0.02,
                },
            },
            {
                "field": "cap_type",
                "text": "Cumulative Cap",
                "page": 2,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.15,
                    "width": 0.18,
                    "height": 0.02,
                },
            },
            {
                "field": "cap_rate",
                "text": "Annual Cap: 5%",
                "page": 2,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.20,
                    "width": 0.20,
                    "height": 0.02,
                },
            },
            {
                "field": "expense_stop",
                "text": "$12,500.00 Expense Stop",
                "page": 2,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.25,
                    "width": 0.25,
                    "height": 0.02,
                },
            },
            {
                "field": "tenant_name",
                "text": "Tenant: Acme Corporation",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.10,
                    "width": 0.30,
                    "height": 0.03,
                },
            },
            {
                "field": "suite_number",
                "text": "Suite 204",
                "page": 1,
                "boundingBox": {
                    "left": 0.15,
                    "top": 0.15,
                    "width": 0.12,
                    "height": 0.02,
                },
            },
        ],
    }


def create_test_document_dict(
    organization_id: UUID,
    property_id: UUID | None = None,
    filename: str = "test-lease.pdf",
    status: str = "completed",
) -> dict[str, Any]:
    """
    Create a test document dict suitable for database insertion.

    Args:
        organization_id: UUID of the organization that owns the document
        property_id: UUID of the property associated with the document (required)
        filename: Name of the PDF file
        status: Document status (default: completed - extraction complete, ready for verification)

    Returns:
        Dict with document fields ready for database insertion
    """
    document_id = uuid4()
    now = datetime.now(UTC)

    return {
        "id": str(document_id),
        "organization_id": str(organization_id),
        "property_id": str(property_id) if property_id else None,
        "filename": filename,
        "storage_bucket": "capveri-test-documents",
        "storage_key": f"documents/{organization_id}/{document_id}/{filename}",
        "content_type": "application/pdf",
        "file_size_bytes": 245678,
        "document_type": "lease",
        "status": status,
        "extraction_result": generate_extraction_result(),
        "created_at": now.isoformat(),
        "processed_at": now.isoformat() if status != "pending" else None,
        "verified_at": now.isoformat(),
        "verified_by": None,
        "lease_id": None,
        "error_message": None,
        "edit_history": [],
    }


def generate_multiple_test_documents(
    organization_id: UUID, property_id: UUID, count: int = 5
) -> list[dict[str, Any]]:
    """
    Generate multiple test documents with varying statuses and confidence levels.

    Args:
        organization_id: UUID of the organization
        property_id: UUID of the property
        count: Number of documents to generate

    Returns:
        List of document dicts
    """
    documents = []
    statuses = [
        "completed",  # Ready for verification
        "completed",  # Ready for verification
        "verified",  # Already verified
        "pending",  # Not yet processed
        "processing",  # Currently being processed
    ]

    for i in range(count):
        status = statuses[i % len(statuses)]
        filename = f"lease-{i+1:03d}.pdf"
        doc = create_test_document_dict(organization_id, property_id, filename, status)
        documents.append(doc)

    return documents
