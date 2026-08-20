"""GL Narrative Analysis Service.

Fetches GL data for a property/year, sends it to Claude for advisory analysis,
and persists the structured narrative result. Analysis is advisory only — it
never modifies calculations or auto-applies any changes.
"""

import logging
import re
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.config import settings
from app.database.pagination import fetch_all_pages
from app.models.gl_analysis import GLAnalysisResult, GLAnalysisResultCreate
from app.services.extraction.gl_analysis_prompt import (
    GL_ANALYSIS_SYSTEM_PROMPT,
    build_gl_analysis_user_message,
)
from app.services.extraction.openrouter_client import OpenRouterClient

logger = logging.getLogger(__name__)


class GLAnalysisService:
    """Service for running Claude-powered GL narrative analysis.

    Responsibilities:
    - Fetch and aggregate GL entries by account code
    - Build structured prompt payload
    - Call OpenRouter via OpenRouterClient
    - Persist result to gl_analysis_results
    - Support dismissal and retrieval of latest result
    """

    async def run_analysis(
        self,
        property_id: str,
        period_year: int,
        user_id: UUID,
        org_id: UUID,
        supabase: Any,
    ) -> tuple[GLAnalysisResult, int]:
        """Run GL narrative analysis for a property and year.

        Fetches all GL entries for the property/year, aggregates them by
        account code, sends to Claude, and persists the result.

        Args:
            property_id: Property ID to analyze.
            period_year: Fiscal year to analyze.
            user_id: ID of the user triggering the analysis.
            org_id: Organization ID for RLS scoping.
            supabase: Supabase client with valid auth context.

        Returns:
            Tuple of (GLAnalysisResult, gl_entry_count). The entry count is
            returned to avoid a redundant DB round-trip at the API layer.
        """
        # Fetch property — org_id filter is defense-in-depth on top of RLS.
        # If property_row is None the property doesn't exist or belongs to
        # another org; raise ValueError so the API layer returns 404.
        property_row = (
            supabase.table("properties")
            .select("id, name, organization_id")
            .eq("id", str(property_id))
            .eq("organization_id", str(org_id))
            .maybe_single()
            .execute()
            .data
        )
        if property_row is None:
            raise ValueError(f"Property {property_id} not found")
        property_name = property_row.get("name", str(property_id))

        # Fetch all GL entries for property/year
        gl_rows = fetch_all_pages(
            lambda: supabase.table("gl_entries")
            .select(
                "account_code, account_description, vendor_name, "
                "description, amount, transaction_date"
            )
            .eq("property_id", str(property_id))
            .eq("period_year", period_year)
        )

        # Fetch expense pools for context
        pool_rows = fetch_all_pages(
            lambda: supabase.table("expense_pools")
            .select("id, name, pool_type")
            .eq("property_id", str(property_id))
        )

        # Aggregate GL entries by account code
        accounts = self._aggregate_accounts(gl_rows)

        # Pre-aggregation anomaly scan — must run before aggregation collapses
        # descriptions to a 3-entry cap, which buries cross-property entries.
        anomalies = self._detect_anomalies(gl_rows)

        # Build expense pool context
        expense_pools = [
            {"name": p.get("name", ""), "type": p.get("pool_type", "")}
            for p in pool_rows
        ]

        # Build Claude user message
        user_message = build_gl_analysis_user_message(
            property_name=property_name,
            period_year=period_year,
            total_gl_entries=len(gl_rows),
            expense_pools=expense_pools,
            accounts=accounts,
            anomalies=anomalies if anomalies else None,
        )

        # Call OpenRouter with the GL analysis system prompt override.
        # `system_prompt=` overrides the default extraction system message so the
        # model receives GL-specific instructions rather than lease-extraction ones.
        # `prompt=""` is intentional: the full structured payload is in document_text.
        client = OpenRouterClient()
        analysis_text, total_tokens = await client.extract(
            prompt="",
            document_text=user_message,
            model=settings.gl_analysis_model,
            temperature=0.0,
            fallback_models=[
                settings.gl_analysis_fallback,
                settings.gl_analysis_fallback_2,
            ],
            system_prompt=GL_ANALYSIS_SYSTEM_PROMPT,
        )

        # OpenRouterClient.extract() returns combined input+output token count.
        # Store the full total in token_input; token_output is always 0.
        # If input/output split is needed in future, update OpenRouterClient.extract()
        # to return (text, input_tokens, output_tokens).
        token_input = total_tokens
        token_output = 0

        # Persist result using the DTO for validation
        now = datetime.now(UTC)
        create_dto = GLAnalysisResultCreate(
            organization_id=org_id,
            property_id=UUID(property_id),
            period_year=period_year,
            analysis_markdown=analysis_text,
            token_input=token_input,
            token_output=token_output,
            ran_by_user_id=user_id,
        )
        insert_data = create_dto.model_dump(mode="json")
        insert_data["ran_at"] = now.isoformat()
        insert_response = (
            supabase.table("gl_analysis_results").insert(insert_data).execute()
        )
        if not insert_response.data:
            raise RuntimeError(
                "GL analysis insert returned no rows — RLS may have blocked the write"
            )
        row = insert_response.data[0]

        return self._row_to_result(row), len(gl_rows)

    async def get_latest_analysis(
        self,
        property_id: str,
        period_year: int,
        org_id: UUID,
        supabase: Any,
    ) -> GLAnalysisResult | None:
        """Get the most recent non-dismissed analysis for a property/year.

        Args:
            property_id: Property ID.
            period_year: Fiscal year.
            org_id: Organization ID — defense-in-depth filter (RLS also enforces).
            supabase: Supabase client.

        Returns:
            Most recent GLAnalysisResult, or None if none exists.
        """
        response = (
            supabase.table("gl_analysis_results")
            .select("*")
            .eq("organization_id", str(org_id))
            .eq("property_id", str(property_id))
            .eq("period_year", period_year)
            .is_("dismissed_at", "null")
            .order("ran_at", desc=True)
            .limit(1)
            .execute()
        )
        rows: list[dict[str, Any]] = response.data or []
        if not rows:
            return None
        return self._row_to_result(rows[0])

    async def dismiss_analysis(
        self,
        analysis_id: UUID,
        user_id: UUID,
        org_id: UUID,
        supabase: Any,
    ) -> GLAnalysisResult:
        """Mark an analysis result as dismissed.

        Args:
            analysis_id: ID of the analysis to dismiss.
            user_id: ID of the user dismissing the analysis.
            org_id: Organization ID — scopes the update for defense-in-depth
                even though RLS already enforces org isolation.
            supabase: Supabase client.

        Returns:
            Updated GLAnalysisResult with dismissed_at set.
        """
        now = datetime.now(UTC)
        update_data = {
            "dismissed_at": now.isoformat(),
            "dismissed_by_user_id": str(user_id),
        }
        response = (
            supabase.table("gl_analysis_results")
            .update(update_data)
            .eq("id", str(analysis_id))
            .eq("organization_id", str(org_id))
            .execute()
        )
        if not response.data:
            raise ValueError(f"Analysis {analysis_id} not found")
        row = response.data[0]
        return self._row_to_result(row)

    def _aggregate_accounts(
        self, gl_rows: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Aggregate GL entries by account code for prompt efficiency.

        Groups entries by account code, summing amounts and collecting
        unique vendors and sample descriptions.

        Args:
            gl_rows: Raw GL entry rows from database.

        Returns:
            List of aggregated account summaries.
        """
        by_account: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_amount": Decimal("0"),
                "entry_count": 0,
                "vendors": set(),
                "descriptions": [],
                "account_description": "",
            }
        )

        for row in gl_rows:
            code = row.get("account_code", "UNKNOWN")
            agg = by_account[code]
            agg["account_description"] = row.get("account_description", "")
            try:
                agg["total_amount"] += Decimal(str(row.get("amount", "0")))
            except (InvalidOperation, ValueError):
                logger.warning(
                    "Skipping unparseable amount for account %s: %r",
                    code,
                    row.get("amount"),
                )
            agg["entry_count"] += 1
            vendor = row.get("vendor_name")
            if vendor:
                agg["vendors"].add(vendor)
            desc = row.get("description")
            if desc and len(agg["descriptions"]) < 3:
                agg["descriptions"].append(desc)

        return [
            {
                "account_code": code,
                "account_description": data["account_description"],
                "total_amount": str(data["total_amount"]),
                "entry_count": data["entry_count"],
                "top_vendors": list(data["vendors"])[:5],
                "sample_descriptions": data["descriptions"],
            }
            for code, data in sorted(by_account.items())
        ]

    # Regex patterns compiled once at class level for efficiency.
    # Cross-property code: 2–5 uppercase letters, dash, 2–3 digits (e.g. HOU-02).
    _PROPERTY_CODE_RE = re.compile(r"\b[A-Z]{2,5}-\d{2,3}\b")
    # Keywords that explicitly flag a mis-coded or wrong-property transaction.
    _MISCODING_RE = re.compile(r"mis.?cod|wrong.?prop|incorrect.?prop", re.IGNORECASE)

    def _detect_anomalies(
        self,
        gl_rows: list[dict[str, Any]],
        current_property_code: str | None = None,
    ) -> list[dict[str, Any]]:
        """Scan individual GL entries for cross-property entity co-mingling.

        This pre-aggregation pass must run before _aggregate_accounts() because
        the aggregation step caps sample_descriptions at 3 entries per account —
        a single suspicious entry in a busy account will get silently dropped.

        Detection signals:
        - Description or vendor contains a property-code pattern like "HOU-02"
          or "ELD-01" that differs from the current property's own code.
        - Description contains explicit mis-coding keywords ("mis-coded",
          "wrong property", "incorrect property").

        Args:
            gl_rows: Raw GL entry rows from the database.
            current_property_code: Optional code for the current property
                (e.g. "ELD") to suppress false positives where the property's
                own code appears in its own descriptions.

        Returns:
            List of anomaly dicts; empty list when no anomalies are detected.
        """
        anomalies = []
        for row in gl_rows:
            desc = row.get("description") or ""
            vendor = row.get("vendor_name") or ""
            combined = f"{desc} {vendor}"

            # Find all property-code matches in description + vendor
            codes = self._PROPERTY_CODE_RE.findall(combined)
            if current_property_code:
                own = current_property_code.upper()
                codes = [c for c in codes if not c.upper().startswith(own)]

            if codes or self._MISCODING_RE.search(combined):
                anomalies.append(
                    {
                        "account_code": row.get("account_code", "UNKNOWN"),
                        "vendor_name": vendor,
                        "description": desc,
                        "amount": str(row.get("amount", "0")),
                        "transaction_date": str(row.get("transaction_date", "")),
                        "detected_codes": codes,
                    }
                )
        return anomalies

    def _row_to_result(self, row: dict[str, Any]) -> GLAnalysisResult:
        """Convert a database row dict to a GLAnalysisResult model.

        Args:
            row: Raw dict from Supabase response.

        Returns:
            GLAnalysisResult instance.
        """
        return GLAnalysisResult(
            id=row["id"],
            organization_id=row["organization_id"],
            property_id=row["property_id"],
            period_year=row["period_year"],
            analysis_markdown=row["analysis_markdown"],
            token_input=row.get("token_input", 0),
            token_output=row.get("token_output", 0),
            ran_at=row["ran_at"],
            ran_by_user_id=row["ran_by_user_id"],
            dismissed_at=row.get("dismissed_at"),
            dismissed_by_user_id=row.get("dismissed_by_user_id"),
            created_at=row["created_at"],
        )
