"""CapEx Classifier Service — rules-based capital expenditure detection.

Screens individual GL entries for potential capital expenditures before
pool aggregation. No ML, no LLM — deterministic rules only.

Each rule is a dataclass with an evaluate() method that returns a CapExMatch
or None. The classifier service runs all rules and deduplicates by
(gl_entry_id, rule_name).
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal, Protocol
from uuid import UUID

from app.database.pagination import fetch_all_pages, fetch_all_pages_chunked_in
from app.models.capex_flag import CapExFlag, CapExRunResponse

logger = logging.getLogger(__name__)

CLASSIFIER_VERSION = "1.0"


@dataclass
class CapExMatch:
    """Result from a single rule evaluation."""

    gl_entry_id: str
    rule_name: str
    confidence: Decimal
    reason: str
    matched_pattern: str | None = None


class CapExRule(Protocol):
    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None: ...


# ---------------------------------------------------------------------------
# Rule implementations
# ---------------------------------------------------------------------------


class AmountThresholdRule:
    """Flag entries with large absolute amounts."""

    rule_name = "amount_threshold"

    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None:
        amount = abs(Decimal(str(entry["amount"])))
        if amount >= Decimal("100000"):
            return CapExMatch(
                gl_entry_id=entry["id"],
                rule_name=self.rule_name,
                confidence=Decimal("0.85"),
                reason=f"Amount ${amount:,.2f} exceeds $100,000 threshold",
            )
        if amount >= Decimal("25000"):
            return CapExMatch(
                gl_entry_id=entry["id"],
                rule_name=self.rule_name,
                confidence=Decimal("0.60"),
                reason=f"Amount ${amount:,.2f} exceeds $25,000 threshold",
            )
        return None


_HIGH_CONFIDENCE_KEYWORDS = [
    "capital improvement",
    "capex",
    "tenant improvement",
    "leasehold improvement",
]
_MEDIUM_CONFIDENCE_KEYWORDS = [
    "replacement",
    "installation",
    "renovation",
    "construction",
    "remodel",
    "upgrade",
]


class AccountKeywordRule:
    """Flag entries with CapEx keywords in account description or entry description."""

    rule_name = "account_keyword"

    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None:
        text = " ".join(
            [
                (entry.get("account_description") or ""),
                (entry.get("description") or ""),
            ]
        ).lower()

        for kw in _HIGH_CONFIDENCE_KEYWORDS:
            if kw in text:
                return CapExMatch(
                    gl_entry_id=entry["id"],
                    rule_name=self.rule_name,
                    confidence=Decimal("0.90"),
                    reason=f"High-confidence CapEx keyword: '{kw}'",
                    matched_pattern=kw,
                )

        for kw in _MEDIUM_CONFIDENCE_KEYWORDS:
            if kw in text:
                return CapExMatch(
                    gl_entry_id=entry["id"],
                    rule_name=self.rule_name,
                    confidence=Decimal("0.65"),
                    reason=f"Medium-confidence CapEx keyword: '{kw}'",
                    matched_pattern=kw,
                )

        return None


_CAPEX_CODE_PREFIXES = ("15", "17", "18")


class AccountCodePrefixRule:
    """Flag entries whose account code falls in standard CapEx ranges."""

    rule_name = "account_code_prefix"

    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None:
        code = (entry.get("account_code") or "").strip()
        if code and code[:2] in _CAPEX_CODE_PREFIXES:
            return CapExMatch(
                gl_entry_id=entry["id"],
                rule_name=self.rule_name,
                confidence=Decimal("0.75"),
                reason=f"Account code {code} in standard CapEx range ({code[:2]}xx)",
                matched_pattern=f"{code[:2]}*",
            )
        return None


_VENDOR_PATTERNS = re.compile(
    r"\b(construction|roofing|paving|demolition|excavat|waterproofing|"
    r"general\s+contractor|electrical\s+contractor|plumbing\s+contractor)\b",
    re.IGNORECASE,
)


class VendorPatternRule:
    """Flag entries from vendors associated with capital projects."""

    rule_name = "vendor_pattern"

    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None:
        vendor = (entry.get("vendor_name") or "").strip()
        if not vendor:
            return None
        match = _VENDOR_PATTERNS.search(vendor)
        if match:
            return CapExMatch(
                gl_entry_id=entry["id"],
                rule_name=self.rule_name,
                confidence=Decimal("0.55"),
                reason=f"Vendor '{vendor}' matches CapEx vendor pattern",
                matched_pattern=match.group(0).lower(),
            )
        return None


_COMBO_KEYWORDS = _HIGH_CONFIDENCE_KEYWORDS + _MEDIUM_CONFIDENCE_KEYWORDS


class AmountKeywordComboRule:
    """Flag entries where amount > $10K AND a CapEx keyword is present."""

    rule_name = "amount_keyword_combo"

    def evaluate(self, entry: dict[str, Any]) -> CapExMatch | None:
        amount = abs(Decimal(str(entry["amount"])))
        if amount <= Decimal("10000"):
            return None

        text = " ".join(
            [
                (entry.get("account_description") or ""),
                (entry.get("description") or ""),
            ]
        ).lower()

        for kw in _COMBO_KEYWORDS:
            if kw in text:
                return CapExMatch(
                    gl_entry_id=entry["id"],
                    rule_name=self.rule_name,
                    confidence=Decimal("0.80"),
                    reason=f"Amount ${amount:,.2f} > $10K with CapEx keyword '{kw}'",
                    matched_pattern=kw,
                )
        return None


# ---------------------------------------------------------------------------
# All rules in evaluation order
# ---------------------------------------------------------------------------

_ALL_RULES: list[CapExRule] = [
    AmountThresholdRule(),
    AccountKeywordRule(),
    AccountCodePrefixRule(),
    VendorPatternRule(),
    AmountKeywordComboRule(),
]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CapExClassifierService:
    """Rules-based CapEx classifier for GL entries.

    classify_entries() is a pure function (no DB) — testable in isolation.
    run_classification() fetches GL entries, runs rules, upserts flags.
    """

    def classify_entries(self, entries: list[dict[str, Any]]) -> list[CapExMatch]:
        """Run all rules against entries. Returns deduplicated matches."""
        matches: list[CapExMatch] = []
        seen: set[tuple[str, str]] = set()

        for entry in entries:
            for rule in _ALL_RULES:
                result = rule.evaluate(entry)
                if result is not None:
                    key = (result.gl_entry_id, result.rule_name)
                    if key not in seen:
                        seen.add(key)
                        matches.append(result)

        return matches

    async def run_classification(
        self,
        *,
        property_id: str,
        period_year: int,
        org_id: str,
        supabase: Any,
    ) -> CapExRunResponse:
        """Fetch GL entries, run classifier, upsert flags."""
        # Fetch GL entries for the property/year with server-side date filter
        year_entries = fetch_all_pages(
            lambda: supabase.table("gl_entries")
            .select("*")
            .eq("property_id", property_id)
            .gte("transaction_date", f"{period_year}-01-01")
            .lte("transaction_date", f"{period_year}-12-31")
        )

        if not year_entries:
            return CapExRunResponse(
                flags_created=0,
                gl_entries_scanned=0,
                property_id=UUID(property_id),
                period_year=period_year,
            )

        matches = self.classify_entries(year_entries)

        if matches:
            flags_data = [
                {
                    "organization_id": org_id,
                    "gl_entry_id": m.gl_entry_id,
                    "property_id": property_id,
                    "period_year": period_year,
                    "flag_reason": m.reason,
                    "rule_name": m.rule_name,
                    "confidence_score": str(m.confidence),
                    "matched_pattern": m.matched_pattern,
                    "disposition": "pending",
                    "classifier_version": CLASSIFIER_VERSION,
                }
                for m in matches
            ]
            supabase.table("capex_flags").upsert(
                flags_data,
                on_conflict="gl_entry_id,rule_name",
            ).execute()

        return CapExRunResponse(
            flags_created=len(matches),
            gl_entries_scanned=len(year_entries),
            property_id=UUID(property_id),
            period_year=period_year,
        )

    async def get_flags(
        self,
        *,
        property_id: str,
        period_year: int,
        org_id: str,
        supabase: Any,
        disposition: str | None = None,
    ) -> list[CapExFlag]:
        """Retrieve CapEx flags for a property/year."""
        query = (
            supabase.table("capex_flags")
            .select("*")
            .eq("organization_id", org_id)
            .eq("property_id", property_id)
            .eq("period_year", period_year)
        )
        if disposition:
            query = query.eq("disposition", disposition)
        rows = fetch_all_pages(lambda: query.order("created_at", desc=True))
        return [CapExFlag(**row) for row in rows]

    async def review_flag(
        self,
        *,
        flag_id: UUID,
        disposition: Literal["confirmed_capex", "dismissed"],
        user_id: UUID,
        org_id: UUID,
        review_note: str | None = None,
        supabase: Any,
    ) -> CapExFlag:
        """Set disposition on a single CapEx flag."""
        now = datetime.now(UTC)
        result = (
            supabase.table("capex_flags")
            .update(
                {
                    "disposition": disposition,
                    "reviewed_at": now.isoformat(),
                    "reviewed_by_user_id": str(user_id),
                    "review_note": review_note,
                }
            )
            .eq("id", str(flag_id))
            .eq("organization_id", str(org_id))
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise ValueError(
                f"CapEx flag {flag_id} not found or belongs to another organization"
            )
        return CapExFlag(**rows[0])

    async def get_summary(
        self,
        *,
        property_id: str,
        period_year: int,
        org_id: str,
        supabase: Any,
    ) -> dict[str, Any]:
        """Get summary counts and total flagged amount for a property/year.

        Joins to gl_entries to sum actual GL amounts for flagged entries.
        """
        flags = await self.get_flags(
            property_id=property_id,
            period_year=period_year,
            org_id=org_id,
            supabase=supabase,
        )

        pending = sum(1 for f in flags if f.disposition == "pending")
        confirmed = sum(1 for f in flags if f.disposition == "confirmed_capex")
        dismissed = sum(1 for f in flags if f.disposition == "dismissed")

        # Chunk the id filter so properties with many flagged entries don't
        # overflow the request URL and trigger HTTP 414 (same class as BUG-09).
        total_amount = Decimal("0")
        if flags:
            entry_ids = list({str(f.gl_entry_id) for f in flags})
            gl_rows = fetch_all_pages_chunked_in(
                lambda chunk: supabase.table("gl_entries")
                .select("id,amount")
                .in_("id", chunk),
                entry_ids,
            )
            for row in gl_rows:
                total_amount += abs(Decimal(str(row["amount"])))

        return {
            "total": len(flags),
            "pending": pending,
            "confirmed_capex": confirmed,
            "dismissed": dismissed,
            "total_flagged_amount": total_amount,
        }

    async def get_unreviewed_count(
        self,
        *,
        property_id: str,
        period_year: int,
        org_id: str,
        supabase: Any,
    ) -> int:
        """Count pending (unreviewed) CapEx flags for a property/year."""
        rows = fetch_all_pages(
            lambda: supabase.table("capex_flags")
            .select("id")
            .eq("organization_id", org_id)
            .eq("property_id", property_id)
            .eq("period_year", period_year)
            .eq("disposition", "pending")
        )
        return len(rows)
