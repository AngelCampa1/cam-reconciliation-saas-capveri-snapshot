"""Denominator change detection service.

Compares finalized reconciliation snapshots between two periods to detect
and document changes that affect the CAM reconciliation denominator:
RSF re-measurement, tenant roster changes, exclusion changes, BOMA standard
changes, and pro-rata share recalculations.
"""

import logging
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from app.database.client import SupabaseDB
from app.database.pagination import fetch_all_pages
from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)

logger = logging.getLogger(__name__)


class NoComparableSnapshotsError(ValueError):
    """Raised when a period has no finalized snapshot to compare against.

    This is an expected, user-actionable state (finalize the named period),
    not a malformed request — the API maps it to a 200 empty report.
    """

    def __init__(self, period: str, message: str) -> None:
        super().__init__(message)
        self.period = period


class DenominatorChangeService:
    """Detects and documents denominator changes between reconciliation periods."""

    async def generate_report(
        self,
        property_id: UUID,
        current_period_start: date,
        current_period_end: date,
        prior_period_start: date | None = None,
        prior_period_end: date | None = None,
        prior_total_rsf: Decimal | None = None,
        current_total_rsf: Decimal | None = None,
        db: SupabaseDB | None = None,
        organization_id: UUID | None = None,
    ) -> DenominatorChangeReport:
        """Generate a denominator change report comparing two periods.

        Args:
            property_id: Property to analyze
            current_period_start: Start of current period
            current_period_end: End of current period
            prior_period_start: Start of prior period (auto-detect if None)
            prior_period_end: End of prior period (auto-detect if None)
            db: Database client (org-scoped for RLS compliance)
            organization_id: Optional organization filter for explicit scoping

        Returns:
            DenominatorChangeReport with all detected changes and impacts

        Raises:
            NoComparableSnapshotsError: If no finalized snapshots found for
                current or prior period (expected, user-actionable state).
            ValueError: If db is None or other invalid parameters are supplied.
        """
        if db is None:
            raise ValueError(
                "DenominatorChangeService requires an organization-scoped database "
                "client; pass the route OrganizationContext client or an explicitly "
                "scoped test client."
            )

        # Load current period snapshots
        current_snapshots = self._load_period_snapshots(
            db,
            property_id,
            current_period_start,
            current_period_end,
            organization_id=organization_id,
        )
        if not current_snapshots:
            raise NoComparableSnapshotsError(
                "current",
                f"No finalized snapshots found for current period "
                f"{current_period_start} to {current_period_end}",
            )

        # Load prior period snapshots
        if prior_period_start and prior_period_end:
            prior_snapshots = self._load_period_snapshots(
                db,
                property_id,
                prior_period_start,
                prior_period_end,
                organization_id=organization_id,
            )
        else:
            prior_snapshots = self._auto_detect_prior_snapshots(
                db,
                property_id,
                current_period_start,
                organization_id=organization_id,
            )

        if not prior_snapshots:
            raise NoComparableSnapshotsError(
                "prior", "No finalized snapshots found for prior period"
            )

        # Load property data
        property_data = self._load_property(
            db, property_id, organization_id=organization_id
        )
        property_name = property_data.get("name", "Unknown Property")

        # Extract denominator components
        prior_components = self._extract_denominator_components(prior_snapshots)
        current_components = self._extract_denominator_components(current_snapshots)

        # RSF: use explicit values if provided, else fall back to property table
        prop_rsf = Decimal(str(property_data.get("total_rentable_sqft", 0)))
        p_rsf = prior_total_rsf if prior_total_rsf is not None else prop_rsf
        c_rsf = current_total_rsf if current_total_rsf is not None else prop_rsf

        # Detect all changes
        changes: list[DenominatorChange] = []
        changes.extend(self._detect_rsf_change(p_rsf, c_rsf))
        changes.extend(
            self._detect_tenant_roster_changes(prior_components, current_components)
        )
        changes.extend(
            self._detect_exclusion_changes(prior_components, current_components)
        )
        changes.extend(
            self._detect_boma_standard_changes(prior_components, current_components)
        )
        changes.extend(
            self._detect_share_recalculations(prior_components, current_components)
        )

        # Calculate per-tenant impacts
        tenant_impacts = self._calculate_tenant_impacts(
            prior_components, current_components, changes
        )

        rsf_delta = c_rsf - p_rsf
        rsf_delta_percent = (
            (rsf_delta / p_rsf * Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if p_rsf != Decimal("0")
            else Decimal("0")
        )

        summary = self._generate_summary(
            p_rsf, c_rsf, rsf_delta_percent, changes, tenant_impacts
        )

        def period_fmt(s: date | str, e: date | str) -> str:
            start = s.isoformat() if isinstance(s, date) else str(s)
            end = e.isoformat() if isinstance(e, date) else str(e)
            return f"{start} to {end}"

        return DenominatorChangeReport(
            property_id=property_id,
            property_name=property_name,
            prior_period=period_fmt(
                prior_period_start or prior_snapshots[0].get("period_start_date", ""),
                prior_period_end or prior_snapshots[0].get("period_end_date", ""),
            ),
            current_period=period_fmt(current_period_start, current_period_end),
            prior_total_rsf=p_rsf,
            current_total_rsf=c_rsf,
            rsf_delta=rsf_delta,
            rsf_delta_percent=rsf_delta_percent,
            changes=changes,
            tenant_impacts=tenant_impacts,
            summary=summary,
            generated_at=datetime.now(UTC),
        )

    def _load_period_snapshots(
        self,
        db: Any,
        property_id: UUID,
        period_start: date,
        period_end: date,
        organization_id: UUID | None = None,
    ) -> list[dict]:
        """Load finalized reconciliation snapshots for a property and period."""
        query = (
            db.table("reconciliation_snapshots")
            .select("*")
            .eq("property_id", str(property_id))
            .eq("status", "finalized")
            .gte("period_start_date", period_start.isoformat())
            .lte("period_end_date", period_end.isoformat())
        )
        if organization_id is not None:
            query = query.eq("organization_id", str(organization_id))
        return fetch_all_pages(lambda: query)

    def _auto_detect_prior_snapshots(
        self,
        db: Any,
        property_id: UUID,
        current_start: date,
        organization_id: UUID | None = None,
    ) -> list[dict]:
        """Auto-detect the most recent finalized period before current."""
        query = (
            db.table("reconciliation_snapshots")
            .select("*")
            .eq("property_id", str(property_id))
            .eq("status", "finalized")
            .lt("period_end_date", current_start.isoformat())
        )
        if organization_id is not None:
            query = query.eq("organization_id", str(organization_id))
        snapshots = fetch_all_pages(lambda: query)
        if not snapshots:
            return []

        # Group by period and take the most recent
        latest_end = max(s.get("period_end_date", "") for s in snapshots)
        return [s for s in snapshots if s.get("period_end_date") == latest_end]

    def _load_property(
        self, db: Any, property_id: UUID, organization_id: UUID | None = None
    ) -> dict:
        """Load property data."""
        query = (
            db.table("properties")
            .select("id, name, total_rentable_sqft")
            .eq("id", str(property_id))
        )
        if organization_id is not None:
            query = query.eq("organization_id", str(organization_id))
        resp = query.single().execute()
        return resp.data or {}

    def _extract_denominator_components(self, snapshots: list[dict]) -> dict[str, dict]:
        """Extract lease roster and terms from snapshot data.

        Returns:
            Dict keyed by lease_id with tenant details extracted from
            lease_terms_snapshot JSONB.
        """
        components: dict[str, dict] = {}
        for snap in snapshots:
            lease_id = snap.get("lease_id", "")
            terms = snap.get("lease_terms_snapshot") or {}
            components[lease_id] = {
                "tenant_name": terms.get("tenant_name", "Unknown"),
                "pro_rata_share": Decimal(str(terms.get("pro_rata_share", "0"))),
                "rsf": Decimal(str(terms.get("rentable_square_feet", "0"))),
                "excluded_pools": terms.get("excluded_pools", []),
                "boma_standard": terms.get("rsf_measurement_standard"),
                "total_recovery": Decimal(str(snap.get("total_recovery", "0"))),
            }
        return components

    def _detect_rsf_change(
        self, prior_rsf: Decimal, current_rsf: Decimal
    ) -> list[DenominatorChange]:
        """Detect total RSF changes."""
        if prior_rsf == current_rsf:
            return []

        delta = current_rsf - prior_rsf
        pct = (
            (delta / prior_rsf * Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if prior_rsf != Decimal("0")
            else Decimal("0")
        )
        direction = "increased" if delta > 0 else "decreased"

        return [
            DenominatorChange(
                change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                description=(
                    f"Total rentable square footage {direction} "
                    f"by {abs(delta):,.0f} RSF"
                ),
                prior_value=f"{prior_rsf:,.0f} RSF",
                current_value=f"{current_rsf:,.0f} RSF",
                impact_description=(
                    f"Total RSF {direction} by {abs(pct)}%, "
                    f"affecting all tenant pro-rata share calculations"
                ),
            )
        ]

    def _detect_tenant_roster_changes(
        self,
        prior: dict[str, dict],
        current: dict[str, dict],
    ) -> list[DenominatorChange]:
        """Detect tenants added or removed between periods."""
        changes: list[DenominatorChange] = []
        prior_ids = set(prior.keys())
        current_ids = set(current.keys())

        for added_id in current_ids - prior_ids:
            tenant = current[added_id]
            changes.append(
                DenominatorChange(
                    change_type=DenominatorChangeType.TENANT_ADDED,
                    description=(
                        f"{tenant['tenant_name']} added to property "
                        f"({tenant['rsf']:,.0f} RSF, "
                        f"{tenant['pro_rata_share'] * 100:.2f}% share)"
                    ),
                    prior_value="Not present",
                    current_value=(
                        f"{tenant['tenant_name']} - {tenant['rsf']:,.0f} RSF"
                    ),
                    impact_description=("New tenant dilutes existing tenants' shares"),
                )
            )

        for removed_id in prior_ids - current_ids:
            tenant = prior[removed_id]
            changes.append(
                DenominatorChange(
                    change_type=DenominatorChangeType.TENANT_REMOVED,
                    description=(
                        f"{tenant['tenant_name']} removed from property "
                        f"({tenant['rsf']:,.0f} RSF, "
                        f"{tenant['pro_rata_share'] * 100:.2f}% share)"
                    ),
                    prior_value=(f"{tenant['tenant_name']} - {tenant['rsf']:,.0f} RSF"),
                    current_value="Not present",
                    impact_description=(
                        "Remaining tenants may see share concentration"
                    ),
                )
            )

        return changes

    def _detect_exclusion_changes(
        self,
        prior: dict[str, dict],
        current: dict[str, dict],
    ) -> list[DenominatorChange]:
        """Detect changes in pool exclusions for continuing tenants."""
        changes: list[DenominatorChange] = []
        common_ids = set(prior.keys()) & set(current.keys())

        for lease_id in common_ids:
            prior_excl = set(prior[lease_id].get("excluded_pools", []))
            current_excl = set(current[lease_id].get("excluded_pools", []))
            tenant_name = current[lease_id]["tenant_name"]

            if prior_excl != current_excl:
                added_pools = current_excl - prior_excl
                removed_pools = prior_excl - current_excl

                desc_parts = []
                if added_pools:
                    desc_parts.append(f"now excludes {', '.join(sorted(added_pools))}")
                if removed_pools:
                    desc_parts.append(
                        f"no longer excludes {', '.join(sorted(removed_pools))}"
                    )

                changes.append(
                    DenominatorChange(
                        change_type=DenominatorChangeType.EXCLUSION_CHANGE,
                        description=(
                            f"{tenant_name} pool exclusions changed: "
                            + "; ".join(desc_parts)
                        ),
                        prior_value=(
                            ", ".join(sorted(prior_excl)) if prior_excl else "None"
                        ),
                        current_value=(
                            ", ".join(sorted(current_excl)) if current_excl else "None"
                        ),
                        impact_description=(
                            f"Changes which expense pools {tenant_name} participates in"
                        ),
                    )
                )

        return changes

    def _detect_boma_standard_changes(
        self,
        prior: dict[str, dict],
        current: dict[str, dict],
    ) -> list[DenominatorChange]:
        """Detect BOMA measurement standard changes for continuing tenants."""
        changes: list[DenominatorChange] = []
        common_ids = set(prior.keys()) & set(current.keys())

        # Collect unique standard transitions
        seen_transitions: set[tuple[str | None, str | None]] = set()

        for lease_id in common_ids:
            prior_std = prior[lease_id].get("boma_standard")
            current_std = current[lease_id].get("boma_standard")

            if prior_std != current_std and (prior_std or current_std):
                transition = (prior_std, current_std)
                if transition not in seen_transitions:
                    seen_transitions.add(transition)
                    changes.append(
                        DenominatorChange(
                            change_type=DenominatorChangeType.BOMA_STANDARD_CHANGE,
                            description=(
                                "BOMA measurement standard changed"
                                f" from {prior_std or 'unspecified'}"
                                f" to {current_std or 'unspecified'}"
                            ),
                            prior_value=prior_std or "unspecified",
                            current_value=current_std or "unspecified",
                            impact_description=(
                                "BOMA re-measurement may affect rentable area "
                                "calculations and pro-rata shares"
                            ),
                        )
                    )

        return changes

    def _detect_share_recalculations(
        self,
        prior: dict[str, dict],
        current: dict[str, dict],
    ) -> list[DenominatorChange]:
        """Detect pro-rata share changes for continuing tenants."""
        changes: list[DenominatorChange] = []
        common_ids = set(prior.keys()) & set(current.keys())

        for lease_id in common_ids:
            prior_share = prior[lease_id]["pro_rata_share"]
            current_share = current[lease_id]["pro_rata_share"]
            tenant_name = current[lease_id]["tenant_name"]

            if prior_share != current_share:
                delta_pct = (current_share - prior_share) * Decimal("100")
                changes.append(
                    DenominatorChange(
                        change_type=DenominatorChangeType.SHARE_RECALCULATION,
                        description=(
                            f"{tenant_name} pro-rata share changed from "
                            f"{prior_share * 100:.2f}% to {current_share * 100:.2f}% "
                            f"({delta_pct:+.2f} pct points)"
                        ),
                        prior_value=f"{prior_share * 100:.2f}%",
                        current_value=f"{current_share * 100:.2f}%",
                        impact_description=(
                            f"{tenant_name}'s share of recoverable expenses "
                            f"{'increased' if delta_pct > 0 else 'decreased'}"
                        ),
                    )
                )

        return changes

    def _calculate_tenant_impacts(
        self,
        prior: dict[str, dict],
        current: dict[str, dict],
        changes: list[DenominatorChange],
    ) -> list[TenantShareImpact]:
        """Calculate per-tenant impact of all denominator changes."""
        impacts: list[TenantShareImpact] = []

        # Build per-tenant lookup of changes that directly affect them
        tenant_changes: dict[str, set[DenominatorChangeType]] = {}
        for change in changes:
            # RSF and BOMA changes affect all tenants
            if change.change_type in (
                DenominatorChangeType.RSF_REMEASUREMENT,
                DenominatorChangeType.BOMA_STANDARD_CHANGE,
            ):
                for lid in set(prior.keys()) & set(current.keys()):
                    tenant_changes.setdefault(lid, set()).add(change.change_type)
            # Roster changes affect remaining tenants (share redistribution)
            elif change.change_type in (
                DenominatorChangeType.TENANT_ADDED,
                DenominatorChangeType.TENANT_REMOVED,
            ):
                for lid in set(prior.keys()) & set(current.keys()):
                    tenant_changes.setdefault(lid, set()).add(change.change_type)
            # Exclusion and share changes: match by tenant name in description
            elif change.change_type == DenominatorChangeType.EXCLUSION_CHANGE:
                for lid in set(prior.keys()) & set(current.keys()):
                    if current[lid]["tenant_name"] in change.description:
                        tenant_changes.setdefault(lid, set()).add(change.change_type)
            elif change.change_type == DenominatorChangeType.SHARE_RECALCULATION:
                for lid in set(prior.keys()) & set(current.keys()):
                    if current[lid]["tenant_name"] in change.description:
                        tenant_changes.setdefault(lid, set()).add(change.change_type)

        # Only calculate impacts for tenants present in current period
        for lease_id, curr_data in current.items():
            prior_data = prior.get(lease_id)
            if not prior_data:
                continue  # New tenant — no prior to compare

            prior_share = prior_data["pro_rata_share"]
            current_share = curr_data["pro_rata_share"]

            if (
                prior_share == current_share
                and prior_data["total_recovery"] == curr_data["total_recovery"]
            ):
                continue  # No change for this tenant

            delta_pct_points = (current_share - prior_share) * Decimal("100")
            delta_pct_points = delta_pct_points.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

            # Use per-tenant contributing changes
            contributing = list(tenant_changes.get(lease_id, set()))
            if (
                prior_share != current_share
                and DenominatorChangeType.SHARE_RECALCULATION not in contributing
            ):
                contributing.append(DenominatorChangeType.SHARE_RECALCULATION)

            impacts.append(
                TenantShareImpact(
                    lease_id=UUID(lease_id) if isinstance(lease_id, str) else lease_id,
                    tenant_name=curr_data["tenant_name"],
                    prior_pro_rata_share=prior_share,
                    current_pro_rata_share=current_share,
                    share_delta_pct_points=delta_pct_points,
                    prior_estimated_recovery=prior_data["total_recovery"],
                    current_estimated_recovery=curr_data["total_recovery"],
                    recovery_delta=curr_data["total_recovery"]
                    - prior_data["total_recovery"],
                    contributing_changes=contributing,
                )
            )

        return impacts

    def _generate_summary(
        self,
        prior_rsf: Decimal,
        current_rsf: Decimal,
        rsf_delta_percent: Decimal,
        changes: list[DenominatorChange],
        impacts: list[TenantShareImpact],
    ) -> str:
        """Generate deterministic executive summary."""
        parts: list[str] = []

        if prior_rsf != current_rsf:
            direction = "increase" if current_rsf > prior_rsf else "decrease"
            parts.append(
                f"Total RSF changed from {prior_rsf:,.0f} to {current_rsf:,.0f} "
                f"({abs(rsf_delta_percent)}% {direction})."
            )

        if changes:
            parts.append(
                f"{len(changes)} denominator "
                f"change{'s' if len(changes) != 1 else ''} detected."
            )
        else:
            parts.append("No denominator changes detected between periods.")

        if impacts:
            parts.append(
                f"{len(impacts)} tenant{'s' if len(impacts) != 1 else ''} affected."
            )

        return " ".join(parts)
