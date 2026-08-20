"""
Cross-document assembler: gathers all property data for a period and
builds a CrossDocAnalysisInput ready to be sent to Claude.
"""

import fnmatch
import json
import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.database.client import SupabaseDB
from app.database.pagination import fetch_all_pages
from app.services.extraction.cross_doc_models import (
    AuditorContext,
    CrossDocAnalysisInput,
    DataAvailability,
    GLPoolContext,
    LeaseContext,
    PropertyAuditorOverrides,
)

logger = logging.getLogger(__name__)

# Rough chars-per-token ratio for estimation. Using 3 (not 4) to be conservative
# for portfolios with non-ASCII tenant/vendor names or dense JSON key overhead.
_CHARS_PER_TOKEN = 3


class CrossDocAssembler:
    """Assembles property data for cross-document Claude analysis.

    Gathers verified lease extractions, GL pool summaries, auditor context,
    and prior-year data, then packages them into a CrossDocAnalysisInput.

    Example:
        ```python
        assembler = CrossDocAssembler(db=supabase_client)
        input_data = await assembler.assemble(property_id, period_year)
        ```
    """

    def __init__(self, db: SupabaseDB) -> None:
        self.db = db

    async def assemble(
        self,
        property_id: UUID,
        period_year: int,
    ) -> CrossDocAnalysisInput:
        """Gather all data and build a CrossDocAnalysisInput.

        Args:
            property_id: UUID of the property.
            period_year: Fiscal year for analysis.

        Returns:
            CrossDocAnalysisInput with all available data populated.
        """
        property_name = await self._fetch_property_name(property_id)
        lease_contexts, data_avail = await self._fetch_lease_contexts(
            property_id, period_year
        )
        gl_pool_contexts, gl_account_count = await self._fetch_gl_pool_contexts(
            property_id, period_year
        )
        data_avail.has_gl_data = gl_account_count > 0
        data_avail.gl_account_count = gl_account_count
        data_avail.has_cam_statements = await self._has_cam_statement_data(
            property_id, period_year
        )

        auditor_context, property_overrides = await self._fetch_auditor_context(
            property_id
        )
        prior_year_totals = await self._fetch_prior_year_totals(
            property_id, period_year - 1
        )
        data_avail.has_prior_year_data = bool(prior_year_totals)

        input_obj = CrossDocAnalysisInput(
            property_id=property_id,
            property_name=property_name,
            period_year=period_year,
            lease_contexts=lease_contexts,
            gl_pool_contexts=gl_pool_contexts,
            auditor_context=auditor_context,
            property_overrides=property_overrides,
            prior_year_totals=prior_year_totals,
            data_availability=data_avail,
        )

        # Estimate token count from serialized JSON length
        serialized = json.dumps(input_obj.model_dump(mode="json"), default=str)
        input_obj.estimated_tokens = len(serialized) // _CHARS_PER_TOKEN

        return input_obj

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _fetch_property_name(self, property_id: UUID) -> str:
        result = (
            self.db.table("properties")
            .select("name")
            .eq("id", str(property_id))
            .maybe_single()
            .execute()
        )
        if result and result.data:
            return str(result.data.get("name", str(property_id)))
        return str(property_id)

    async def _fetch_lease_contexts(
        self, property_id: UUID, period_year: int
    ) -> tuple[list[LeaseContext], DataAvailability]:
        """Fetch verified lease extractions for the property."""
        period_start = f"{period_year}-01-01"
        period_end = f"{period_year}-12-31"

        result = (
            self.db.table("leases")
            .select(
                "id, tenant_name, recovery_profile, pro_rata_share, "
                "base_year, start_date, end_date"
            )
            .eq("property_id", str(property_id))
            .lte("start_date", period_end)
            .gte("end_date", period_start)
            .not_.is_("recovery_profile", "null")
            .execute()
        )

        rows: list[dict[str, Any]] = result.data or []

        # Only include leases that have been HITL-verified (documents table)
        verified_ids = await self._fetch_verified_lease_ids(property_id)

        contexts: list[LeaseContext] = []
        for row in rows:
            lease_id = str(row["id"])
            recovery = row.get("recovery_profile") or {}
            if isinstance(recovery, str):
                try:
                    recovery = json.loads(recovery)
                except json.JSONDecodeError:
                    logger.warning(
                        "cross_doc_assembler: failed to parse recovery_profile JSON "
                        "for lease %s; treating as empty. Value: %.200r",
                        lease_id,
                        recovery,
                    )
                    recovery = {}

            pro_rata_raw = row.get("pro_rata_share")
            pro_rata = Decimal(str(pro_rata_raw)) if pro_rata_raw is not None else None

            ctx = LeaseContext(
                lease_id=lease_id,
                tenant_name=row.get("tenant_name", "Unknown"),
                recovery_profile=recovery,
                pro_rata_share=pro_rata,
                base_year=row.get("base_year"),
                term_start=row.get("start_date"),
                term_end=row.get("end_date"),
                verified_at=verified_ids.get(lease_id),
            )
            contexts.append(ctx)

        verified_count = sum(1 for c in contexts if c.verified_at)
        data_avail = DataAvailability(
            has_verified_leases=verified_count > 0,
            lease_count=verified_count,
        )
        return contexts, data_avail

    async def _fetch_verified_lease_ids(self, property_id: UUID) -> dict[str, str]:
        """Return {lease_id: verified_at} for verified documents."""
        result = (
            self.db.table("documents")
            .select("lease_id, verified_at")
            .eq("property_id", str(property_id))
            .not_.is_("verified_at", "null")
            .execute()
        )
        rows: list[dict[str, Any]] = result.data or []
        return {
            str(row["lease_id"]): str(row["verified_at"])
            for row in rows
            if row.get("lease_id") and row.get("verified_at")
        }

    async def _fetch_gl_pool_contexts(
        self, property_id: UUID, period_year: int
    ) -> tuple[list[GLPoolContext], int]:
        """Fetch GL pool summaries aggregated to account level."""
        pools = fetch_all_pages(
            lambda: self.db.table("expense_pools")
            .select("id, name, pool_type, is_gross_up_applicable")
            .eq("property_id", str(property_id))
        )

        if not pools:
            return [], 0

        pool_id_to_meta: dict[str, dict[str, Any]] = {str(p["id"]): p for p in pools}
        pool_ids = list(pool_id_to_meta.keys())

        mappings = fetch_all_pages(
            lambda: self.db.table("pool_mappings")
            .select("expense_pool_id, gl_account_pattern, allocation_percentage")
            .in_("expense_pool_id", pool_ids)
        )
        if not mappings:
            return [], 0

        pool_mappings: dict[str, list[dict[str, Any]]] = {pid: [] for pid in pool_ids}
        for mapping in mappings:
            pool_mappings[str(mapping["expense_pool_id"])].append(mapping)

        gl_rows = fetch_all_pages(
            lambda: self.db.table("gl_entries")
            .select("amount, account_code, vendor_name")
            .eq("property_id", str(property_id))
            .eq("period_year", period_year)
        )

        # Aggregate by pool through account-code mappings.
        pool_totals: dict[str, Decimal] = {}
        pool_vendors: dict[str, dict[str, Decimal]] = {}
        pool_account_counts: dict[str, set[str]] = {}
        total_accounts: set[str] = set()

        for row in gl_rows:
            amount = Decimal(str(row.get("amount", "0")))
            account = str(row.get("account_code", ""))
            vendor = str(row.get("vendor_name", ""))
            if not account:
                continue

            for pool_id, mapping_list in pool_mappings.items():
                matched = False
                for mapping in mapping_list:
                    pattern = str(mapping["gl_account_pattern"]).replace("%", "*")
                    if not fnmatch.fnmatch(account, pattern):
                        continue

                    allocation = Decimal(str(mapping.get("allocation_percentage", 1)))
                    allocated_amount = amount * allocation
                    pool_totals[pool_id] = (
                        pool_totals.get(pool_id, Decimal("0")) + allocated_amount
                    )
                    if pool_id not in pool_vendors:
                        pool_vendors[pool_id] = {}
                    if vendor:
                        pool_vendors[pool_id][vendor] = (
                            pool_vendors[pool_id].get(vendor, Decimal("0"))
                            + allocated_amount
                        )
                    if pool_id not in pool_account_counts:
                        pool_account_counts[pool_id] = set()
                    pool_account_counts[pool_id].add(account)
                    total_accounts.add(account)
                    matched = True
                    break
                if matched:
                    break

        contexts: list[GLPoolContext] = []
        for pool_id, meta in pool_id_to_meta.items():
            total = pool_totals.get(pool_id, Decimal("0"))
            account_count = len(pool_account_counts.get(pool_id, set()))
            # Skip pools with no GL entries for this period — nothing useful to send
            if account_count == 0 and total == Decimal("0"):
                continue
            vendors_for_pool = pool_vendors.get(pool_id, {})
            # Top 5 vendors by amount; filter out empty vendor names
            top_vendors = [
                v
                for v, _ in sorted(
                    vendors_for_pool.items(), key=lambda x: x[1], reverse=True
                )[:5]
                if v
            ]
            ctx = GLPoolContext(
                pool_name=meta.get("name", pool_id),
                pool_type=meta.get("pool_type", "operating"),
                total_amount=total,
                account_count=account_count,
                top_vendors=top_vendors,
                is_gross_up_applicable=bool(meta.get("is_gross_up_applicable", False)),
            )
            contexts.append(ctx)

        return contexts, len(total_accounts)

    async def _has_cam_statement_data(
        self, property_id: UUID, period_year: int
    ) -> bool:
        """Return whether uploaded tenant billing statement data exists for a period."""
        period_start = f"{period_year}-01-01"
        period_end = f"{period_year}-12-31"

        result = (
            self.db.table("actual_billed_amounts")
            .select("id")
            .eq("property_id", str(property_id))
            .lte("period_start_date", period_end)
            .gte("period_end_date", period_start)
            .limit(1)
            .execute()
        )
        return bool(result.data)

    async def _fetch_auditor_context(
        self, property_id: UUID
    ) -> tuple[AuditorContext, PropertyAuditorOverrides]:
        """Fetch org-level auditor config and property-level overrides."""
        # Fetch property with org info
        prop_result = (
            self.db.table("properties")
            .select("organization_id, auditor_overrides")
            .eq("id", str(property_id))
            .maybe_single()
            .execute()
        )
        prop_data: dict[str, Any] = (prop_result.data if prop_result else None) or {}
        org_id = prop_data.get("organization_id")

        # Fetch org-level auditor config
        auditor_ctx = AuditorContext()
        if org_id:
            org_result = (
                self.db.table("organizations")
                .select("auditor_config")
                .eq("id", str(org_id))
                .maybe_single()
                .execute()
            )
            org_data: dict[str, Any] = (org_result.data if org_result else None) or {}
            raw_config = org_data.get("auditor_config") or {}
            if isinstance(raw_config, str):
                try:
                    raw_config = json.loads(raw_config)
                except json.JSONDecodeError:
                    raw_config = {}
            if raw_config:
                auditor_ctx = AuditorContext.model_validate(raw_config)

        # Property-level overrides
        prop_overrides = PropertyAuditorOverrides()
        raw_overrides = prop_data.get("auditor_overrides") or {}
        if isinstance(raw_overrides, str):
            try:
                raw_overrides = json.loads(raw_overrides)
            except json.JSONDecodeError:
                raw_overrides = {}
        if raw_overrides:
            prop_overrides = PropertyAuditorOverrides.model_validate(raw_overrides)

        return auditor_ctx, prop_overrides

    async def _fetch_prior_year_totals(
        self, property_id: UUID, prior_year: int
    ) -> dict[str, Decimal]:
        """Fetch prior-year pool totals for historical comparison."""
        pools = fetch_all_pages(
            lambda: self.db.table("expense_pools")
            .select("id, name")
            .eq("property_id", str(property_id))
        )
        if not pools:
            return {}

        pool_name_by_id = {str(p["id"]): p.get("name", p["id"]) for p in pools}
        pool_ids = list(pool_name_by_id.keys())

        mappings = fetch_all_pages(
            lambda: self.db.table("pool_mappings")
            .select("expense_pool_id, gl_account_pattern, allocation_percentage")
            .in_("expense_pool_id", pool_ids)
        )
        if not mappings:
            return {}

        pool_mappings: dict[str, list[dict[str, Any]]] = {pid: [] for pid in pool_ids}
        for mapping in mappings:
            pool_mappings[str(mapping["expense_pool_id"])].append(mapping)

        gl_rows = fetch_all_pages(
            lambda: self.db.table("gl_entries")
            .select("account_code, amount")
            .eq("property_id", str(property_id))
            .eq("period_year", prior_year)
        )

        totals: dict[str, Decimal] = {}
        for row in gl_rows:
            account = str(row.get("account_code", ""))
            amount = Decimal(str(row.get("amount", "0")))
            if not account:
                continue

            for pool_id, mapping_list in pool_mappings.items():
                matched = False
                for mapping in mapping_list:
                    pattern = str(mapping["gl_account_pattern"]).replace("%", "*")
                    if not fnmatch.fnmatch(account, pattern):
                        continue
                    allocation = Decimal(str(mapping.get("allocation_percentage", 1)))
                    pool_name = pool_name_by_id.get(pool_id)
                    if pool_name:
                        totals[pool_name] = (
                            totals.get(pool_name, Decimal("0")) + amount * allocation
                        )
                    matched = True
                    break
                if matched:
                    break

        return totals
