"""
Unit tests for demand_letter_templates.py

Tests verify that all required placeholders, statutory references,
and required legal copy are present in the template constants.
"""

from app.services.legal.demand_letter_templates import (
    CA_DEMAND_BODY,
    CA_STATUTORY_REFERENCE,
    DISPUTE_PARAGRAPH,
    LEGAL_DISCLAIMER,
    TX_DEMAND_BODY,
    TX_STATUTORY_REFERENCE,
)

REQUIRED_PLACEHOLDERS = [
    "{tenant_name}",
    "{property_address}",
    "{amount_owed}",
    "{period_start}",
    "{period_end}",
    "{deadline_date}",
    "{landlord_name}",
    "{landlord_title}",
    "{landlord_company}",
    "{landlord_phone}",
    "{landlord_email}",
    "{landlord_address}",
]


class TestTXDemandBody:
    def test_placeholder_keys_present_in_tx_body(self):
        """All required placeholders must appear in TX_DEMAND_BODY."""
        for placeholder in REQUIRED_PLACEHOLDERS:
            assert (
                placeholder in TX_DEMAND_BODY
            ), f"Missing placeholder {placeholder!r} in TX_DEMAND_BODY"

    def test_tx_references_texas_property_code(self):
        """TX body or TX statutory reference must mention Texas Property Code."""
        combined = TX_DEMAND_BODY + TX_STATUTORY_REFERENCE
        assert "Texas Property Code" in combined


class TestCADemandBody:
    def test_placeholder_keys_present_in_ca_body(self):
        """All required placeholders must appear in CA_DEMAND_BODY."""
        for placeholder in REQUIRED_PLACEHOLDERS:
            assert (
                placeholder in CA_DEMAND_BODY
            ), f"Missing placeholder {placeholder!r} in CA_DEMAND_BODY"

    def test_ca_references_civil_code(self):
        """CA body or CA statutory reference must mention Civil Code."""
        combined = CA_DEMAND_BODY + CA_STATUTORY_REFERENCE
        assert "Civil Code" in combined

    def test_ca_references_sb1103(self):
        """CA body or CA statutory reference must mention SB 1103."""
        combined = CA_DEMAND_BODY + CA_STATUTORY_REFERENCE
        assert "SB 1103" in combined


class TestDisputeParagraph:
    def test_dispute_paragraph_has_dispute_id_key(self):
        """{dispute_id} placeholder must appear in DISPUTE_PARAGRAPH."""
        assert "{dispute_id}" in DISPUTE_PARAGRAPH

    def test_dispute_paragraph_has_dispute_filed_date_key(self):
        """{dispute_filed_date} placeholder must appear in DISPUTE_PARAGRAPH."""
        assert "{dispute_filed_date}" in DISPUTE_PARAGRAPH


class TestLegalDisclaimer:
    def test_disclaimer_contains_not_legal_advice(self):
        """ "not legal advice" must appear in LEGAL_DISCLAIMER."""
        assert "not legal advice" in LEGAL_DISCLAIMER.lower()

    def test_disclaimer_contains_template(self):
        """ "template" must appear in LEGAL_DISCLAIMER (case-insensitive)."""
        assert "template" in LEGAL_DISCLAIMER.lower()

    def test_disclaimer_requires_independent_verification(self):
        """LEGAL_DISCLAIMER must tell the user to verify the figures."""
        lowered = LEGAL_DISCLAIMER.lower()
        assert "independently verifying" in lowered
        assert "may contain errors" in lowered
