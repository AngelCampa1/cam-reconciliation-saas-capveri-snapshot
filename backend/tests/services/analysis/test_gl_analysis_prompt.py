"""Tests for the GL analysis system prompt."""

from app.services.extraction.gl_analysis_prompt import (
    GL_ANALYSIS_SYSTEM_PROMPT,
    build_gl_analysis_user_message,
)


class TestGLAnalysisSystemPrompt:
    """Tests for the system prompt content."""

    def test_prompt_contains_capex_opex_section(self) -> None:
        """System prompt must reference CapEx/OpEx classification."""
        assert "CapEx" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "OpEx" in GL_ANALYSIS_SYSTEM_PROMPT

    def test_prompt_contains_gaap_citation(self) -> None:
        """System prompt must reference GAAP ASC standard."""
        assert (
            "ASC 840" in GL_ANALYSIS_SYSTEM_PROMPT
            or "ASC 842" in GL_ANALYSIS_SYSTEM_PROMPT
        )

    def test_prompt_contains_irs_citation(self) -> None:
        """System prompt must reference IRS Tangible Property Regulations."""
        assert (
            "2015-82" in GL_ANALYSIS_SYSTEM_PROMPT
            or "Tangible Property" in GL_ANALYSIS_SYSTEM_PROMPT
        )

    def test_prompt_contains_boma_reference(self) -> None:
        """System prompt must reference BOMA standards."""
        assert "BOMA" in GL_ANALYSIS_SYSTEM_PROMPT

    def test_prompt_contains_required_output_sections(self) -> None:
        """System prompt must define the required markdown output sections."""
        assert "CapEx/OpEx Classification Issues" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "CAM Audit Risks" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "Non-Recoverable Expense Flags" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "Entity Co-Mingling Flags" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "Recommendations" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "Summary" in GL_ANALYSIS_SYSTEM_PROMPT

    def test_prompt_references_entity_co_mingling(self) -> None:
        """System prompt must instruct Claude to process the anomalies array."""
        assert "anomalies" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "co-mingling" in GL_ANALYSIS_SYSTEM_PROMPT.lower()

    def test_prompt_specifies_severity_levels(self) -> None:
        """System prompt must define LOW/MEDIUM/HIGH severity levels."""
        assert "LOW" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "MEDIUM" in GL_ANALYSIS_SYSTEM_PROMPT
        assert "HIGH" in GL_ANALYSIS_SYSTEM_PROMPT


class TestBuildGLAnalysisUserMessage:
    """Tests for the user message builder."""

    def test_includes_property_context(self) -> None:
        """User message must include property name and year."""
        accounts = [
            {
                "account_code": "5415",
                "account_description": "HVAC Replacement",
                "pool": "Operating",
                "total_amount": 125000.0,
                "entry_count": 3,
                "top_vendors": ["Carrier HVAC"],
                "sample_descriptions": ["Rooftop unit replacement"],
            }
        ]
        message = build_gl_analysis_user_message(
            property_name="123 Main St",
            period_year=2024,
            total_gl_entries=847,
            expense_pools=[{"name": "Operating", "type": "operating"}],
            accounts=accounts,
        )
        assert "123 Main St" in message
        assert "2024" in message

    def test_includes_account_data(self) -> None:
        """User message must include aggregated account data."""
        accounts = [
            {
                "account_code": "5415",
                "account_description": "HVAC Replacement",
                "pool": "Operating",
                "total_amount": 125000.0,
                "entry_count": 3,
                "top_vendors": ["Carrier HVAC"],
                "sample_descriptions": ["Rooftop unit replacement"],
            }
        ]
        message = build_gl_analysis_user_message(
            property_name="Office Park",
            period_year=2024,
            total_gl_entries=100,
            expense_pools=[],
            accounts=accounts,
        )
        assert "5415" in message
        assert "HVAC Replacement" in message

    def test_includes_entry_count(self) -> None:
        """User message must include total GL entry count."""
        message = build_gl_analysis_user_message(
            property_name="Test Property",
            period_year=2023,
            total_gl_entries=512,
            expense_pools=[],
            accounts=[],
        )
        assert "512" in message

    def test_returns_string(self) -> None:
        """User message must be a non-empty string."""
        message = build_gl_analysis_user_message(
            property_name="Test",
            period_year=2024,
            total_gl_entries=0,
            expense_pools=[],
            accounts=[],
        )
        assert isinstance(message, str)
        assert len(message) > 0

    def test_includes_anomalies_when_provided(self) -> None:
        """User message must include anomalies array when non-empty."""
        anomalies = [
            {
                "account_code": "5320.00",
                "vendor_name": "Roto-Rooter",
                "description": "HOU-02 Water Main Emergency Repair (mis-coded)",
                "amount": "4200.00",
                "transaction_date": "2024-07-15",
                "detected_codes": ["HOU-02"],
            }
        ]
        message = build_gl_analysis_user_message(
            property_name="Eldridge Energy Center",
            period_year=2024,
            total_gl_entries=165,
            expense_pools=[],
            accounts=[],
            anomalies=anomalies,
        )
        assert "anomalies" in message
        assert "HOU-02" in message

    def test_omits_anomalies_key_when_none(self) -> None:
        """User message must NOT include anomalies key when not provided."""
        message = build_gl_analysis_user_message(
            property_name="Test",
            period_year=2024,
            total_gl_entries=10,
            expense_pools=[],
            accounts=[],
            anomalies=None,
        )
        assert "anomalies" not in message

    def test_omits_anomalies_key_when_empty_list(self) -> None:
        """User message must NOT include anomalies key when list is empty."""
        message = build_gl_analysis_user_message(
            property_name="Test",
            period_year=2024,
            total_gl_entries=10,
            expense_pools=[],
            accounts=[],
            anomalies=[],
        )
        assert "anomalies" not in message
