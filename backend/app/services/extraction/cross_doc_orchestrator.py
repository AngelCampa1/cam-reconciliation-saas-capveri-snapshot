"""
Cross-document analysis orchestrator.

Coordinates: assembly → Claude call → parse/validate → persist.
Follows the same pattern as DualExtractOrchestrator.
"""

import json
import logging
from uuid import UUID, uuid4

from pydantic import ValidationError

from app.config import settings
from app.database.client import SupabaseDB
from app.services.extraction.cross_doc_assembler import CrossDocAssembler
from app.services.extraction.cross_doc_models import CrossDocAnalysisResult
from app.services.extraction.cross_doc_persistence import save_analysis
from app.services.extraction.cross_doc_prompt import (
    CROSS_DOC_ANALYSIS_PROMPT,
    build_cross_doc_user_message,
)
from app.services.extraction.openrouter_client import OpenRouterClient

logger = logging.getLogger(__name__)


class CrossDocAnalysisError(Exception):
    """Base exception for cross-doc analysis errors."""


class CrossDocValidationError(CrossDocAnalysisError):
    """Raised when Claude's response doesn't validate against schema."""


class CrossDocInsufficientDataError(CrossDocAnalysisError):
    """Raised when there is insufficient verified data to run analysis."""


def _normalize_model_finding_ids(data: dict) -> None:
    """Replace invalid model-generated finding IDs before Pydantic validation.

    The prompt asks the model for UUIDs, but live providers can return placeholder
    IDs with non-hex characters. Finding IDs are app-owned references, not source
    evidence, so generate valid IDs and preserve top-level override links.
    """
    id_map: dict[str, str] = {}
    findings = data.get("findings")
    if not isinstance(findings, list):
        return

    for finding in findings:
        if not isinstance(finding, dict):
            continue
        raw_id = finding.get("id")
        if raw_id is None:
            continue
        raw_id_str = str(raw_id)
        try:
            UUID(raw_id_str)
        except (TypeError, ValueError):
            replacement = str(uuid4())
            finding["id"] = replacement
            id_map[raw_id_str] = replacement

    if not id_map:
        return

    overrides = data.get("lease_term_overrides")
    if not isinstance(overrides, list):
        return
    for override in overrides:
        if not isinstance(override, dict):
            continue
        finding_id = override.get("finding_id")
        if finding_id is not None and str(finding_id) in id_map:
            override["finding_id"] = id_map[str(finding_id)]


class CrossDocOrchestrator:
    """Orchestrates the cross-document analysis pipeline.

    1. Assemble property data via CrossDocAssembler
    2. Check DataAvailability — skip if no verified leases
    3. Send to Claude
    4. Parse + validate response
    5. Persist result
    6. Return CrossDocAnalysisResult

    Example:
        ```python
        orch = CrossDocOrchestrator(openrouter_client=client, db=db)
        result = await orch.run_analysis(property_id, period_year=2024, org_id=org_id)
        ```
    """

    def __init__(self, openrouter_client: OpenRouterClient, db: SupabaseDB) -> None:
        self.client = openrouter_client
        self.db = db

    async def run_analysis(
        self,
        property_id: UUID,
        period_year: int,
        org_id: UUID,
    ) -> CrossDocAnalysisResult:
        """Run the full cross-document analysis pipeline.

        Args:
            property_id: UUID of the property.
            period_year: Fiscal year for analysis.
            org_id: Organization UUID (for RLS-compliant persistence).

        Returns:
            CrossDocAnalysisResult with all findings.

        Raises:
            CrossDocInsufficientDataError: If no verified leases are available.
            CrossDocValidationError: If Claude returns invalid JSON or schema.
            CrossDocAnalysisError: For other pipeline failures.
        """
        assembler = CrossDocAssembler(db=self.db)
        input_data = await assembler.assemble(property_id, period_year)

        if not input_data.data_availability.has_verified_leases:
            raise CrossDocInsufficientDataError(
                f"No verified leases for property {property_id} period {period_year}. "
                "Run lease extraction and HITL verification first."
            )

        user_message = build_cross_doc_user_message(input_data)

        logger.info(
            "cross_doc_orchestrator: sending ~%d tokens to OpenRouter "
            "for property %s period %d",
            input_data.estimated_tokens,
            property_id,
            period_year,
        )

        try:
            response_text, tokens_used = await self.client.extract(
                prompt=CROSS_DOC_ANALYSIS_PROMPT,
                document_text=user_message,
                model=settings.cross_doc_model,
                temperature=0.1,
                fallback_models=[
                    settings.cross_doc_fallback,
                    settings.cross_doc_fallback_2,
                ],
            )
        except Exception as exc:
            raise CrossDocAnalysisError(
                f"OpenRouter API call failed for property {property_id}: {exc}"
            ) from exc

        # Strip markdown code fences if Claude wraps in them
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.find("\n")
            if first_newline != -1:
                cleaned = cleaned[first_newline + 1 :]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise CrossDocValidationError(
                f"Claude returned invalid JSON: {exc}\nResponse: {response_text[:500]}"
            ) from exc

        # Inject token_usage from actual API response
        data["token_usage"] = tokens_used
        # Always enforce property_id/period_year from caller; never trust Claude's echo
        data["property_id"] = str(property_id)
        data["period_year"] = period_year
        _normalize_model_finding_ids(data)

        try:
            result = CrossDocAnalysisResult.model_validate(data)
        except ValidationError as exc:
            raise CrossDocValidationError(
                f"Claude response failed schema validation: {exc}"
            ) from exc

        # Warn when top-level overrides reference unknown findings (orphaned overrides
        # are silently skipped by get_accepted_overrides).
        if result.lease_term_overrides:
            finding_ids = {str(f.id) for f in result.findings}
            for override in result.lease_term_overrides:
                if override.finding_id and override.finding_id not in finding_ids:
                    logger.warning(
                        "cross_doc_orchestrator: top-level override for lease %s "
                        "references unknown finding_id %s; it will be skipped by "
                        "get_accepted_overrides",
                        override.lease_id,
                        override.finding_id,
                    )

        await save_analysis(db=self.db, result=result, org_id=org_id)
        return result
