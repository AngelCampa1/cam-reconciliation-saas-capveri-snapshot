"""Historical analysis service for year-over-year comparisons."""

import fnmatch
import logging
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.models.historical_analysis import (
    PoolComparison,
    VarianceLevel,
    YearOverYearComparison,
)
from app.services.analysis.pool_matching import PoolMatcher

logger = logging.getLogger(__name__)


def calculate_variance_level(variance_percent: Decimal | None) -> VarianceLevel:
    """Determine variance significance level based on percentage.

    Args:
        variance_percent: Percentage variance (can be negative)

    Returns:
        VarianceLevel based on absolute variance:
        - NORMAL: <5%
        - WARNING: 5-15%
        - CRITICAL: >15%
    """
    if variance_percent is None:
        return VarianceLevel.NORMAL

    abs_variance = abs(variance_percent)

    if abs_variance < Decimal("5"):
        return VarianceLevel.NORMAL
    elif abs_variance < Decimal("15"):
        return VarianceLevel.WARNING
    else:
        return VarianceLevel.CRITICAL


class HistoricalAnalysisService:
    """Service for historical expense analysis and year-over-year comparisons."""

    async def get_year_over_year(
        self,
        property_id: UUID,
        years: list[int],
        organization_id: UUID | None = None,
        use_fuzzy_matching: bool = True,
    ) -> YearOverYearComparison:
        """Get year-over-year expense comparison.

        Args:
            property_id: Property to analyze
            years: List of years to compare (2-4 years)
            organization_id: Organization scope for all data reads
            use_fuzzy_matching: Whether to use fuzzy matching for renamed pools

        Returns:
            YearOverYearComparison with variance calculations

        Raises:
            ValueError: If less than 2 years provided or snapshots not found
        """
        if len(years) < 2:
            raise ValueError("At least 2 years required for comparison")

        if len(years) > 4:
            raise ValueError("Maximum 4 years allowed for comparison")

        if organization_id is None:
            raise ValueError("organization_id is required for historical analysis")

        # Sort years ascending
        years = sorted(years)
        base_year = years[0]

        # Get finalized snapshots for each year
        await self._get_snapshots_by_years(property_id, years, organization_id)

        # Get property name
        property_name = await self._get_property_name(property_id, organization_id)

        # Extract pool data from GL entries (not from snapshots)
        logger.debug(f"Extracting pool data for property {property_id}, years {years}")
        pool_data_by_year = await self._extract_pool_data(
            property_id, years, organization_id, verify_property_access=False
        )
        logger.debug(f"Pool data by year: {pool_data_by_year}")

        # Build set of all pool names across all years
        all_pools: set[str] = set()
        for year_pools in pool_data_by_year.values():
            all_pools.update(year_pools.keys())

        # Apply fuzzy matching to map pools across years
        pool_mappings = {}
        if use_fuzzy_matching and len(years) > 1:
            pool_mappings = self._build_pool_mappings(pool_data_by_year, years)

        # Build pool comparisons
        pool_comparisons: list[PoolComparison] = []

        for pool_name in sorted(all_pools):
            amounts: dict[int, Decimal | None] = {}

            # Get amounts for each year, applying fuzzy matching
            for year in years:
                year_pools = pool_data_by_year.get(year, {})

                # Try exact match first
                if pool_name in year_pools:
                    amounts[year] = year_pools[pool_name]
                # Try fuzzy match
                elif year in pool_mappings and pool_name in pool_mappings[year]:
                    matched_name = pool_mappings[year][pool_name]
                    amounts[year] = year_pools.get(matched_name)
                else:
                    amounts[year] = None

            # Calculate variance from base year
            base_amount = amounts.get(base_year)
            variance_amount: Decimal | None = None
            variance_percent: Decimal | None = None
            matched_from: str | None = None

            # Get matched pool name if fuzzy matched
            if base_year in pool_mappings and pool_name in pool_mappings[base_year]:
                matched_from = pool_mappings[base_year][pool_name]

            # Calculate variances if base year exists
            # Use most recent year for variance
            latest_year = years[-1]
            latest_amount = amounts.get(latest_year)

            if base_amount is not None and base_amount != Decimal("0"):
                if latest_amount is not None:
                    variance_amount = latest_amount - base_amount
                    variance_percent = (variance_amount / base_amount) * Decimal("100")
            # FIX AS-5: Handle case where base is $0 but current is non-zero
            # This represents a "new category" that emerged after base year
            elif (
                base_amount is not None
                and base_amount == Decimal("0")
                and latest_amount is not None
                and latest_amount != Decimal("0")
            ):
                # Base was $0, now has value - this is 100% "new" expense
                variance_amount = latest_amount
                variance_percent = Decimal(
                    "100"
                )  # Flag as 100% variance (new category)

            variance_level = calculate_variance_level(variance_percent)

            pool_comparisons.append(
                PoolComparison(
                    pool_name=pool_name,
                    amounts=amounts,
                    base_year_amount=base_amount,
                    variance_amount=variance_amount,
                    variance_percent=variance_percent,
                    variance_level=variance_level,
                    matched_from=matched_from,
                )
            )

        # Calculate total amounts for each year
        total_amounts: dict[int, Decimal] = {}
        for year in years:
            year_pools = pool_data_by_year.get(year, {})
            total_amounts[year] = sum(year_pools.values(), Decimal("0"))

        # Calculate total variance
        base_total = total_amounts.get(base_year, Decimal("0"))
        latest_total = total_amounts.get(years[-1], Decimal("0"))

        total_variance_amount: Decimal | None = None
        total_variance_percent: Decimal | None = None

        if base_total != Decimal("0"):
            total_variance_amount = latest_total - base_total
            total_variance_percent = (total_variance_amount / base_total) * Decimal(
                "100"
            )
        elif latest_total != Decimal("0"):
            # No prior-year total to compare against ($0 base) but the current
            # year has spend. The dollar variance is the full current total;
            # the percent change is undefined (division by zero), so leave it
            # None for the UI to render as "New" rather than a misleading 0%.
            # This keeps the headline total consistent with the per-pool rows
            # (each new pool shows its full amount) instead of reading $0.00.
            total_variance_amount = latest_total - base_total

        return YearOverYearComparison(
            property_id=property_id,
            property_name=property_name,
            years=years,
            base_year=base_year,
            pool_comparisons=pool_comparisons,
            total_amounts=total_amounts,
            total_variance_amount=total_variance_amount,
            total_variance_percent=total_variance_percent,
        )

    async def _get_snapshots_by_years(
        self, property_id: UUID, years: list[int], organization_id: UUID | None
    ) -> dict[int, dict[str, Any]]:
        """Fetch finalized snapshots for specified years.

        Args:
            property_id: Property ID
            years: List of years
            organization_id: Organization scope for data reads

        Returns:
            Dict mapping year to snapshot data

        Raises:
            ValueError: If snapshots not found for any year
        """
        supabase = get_supabase_admin()

        # Query snapshots for the property and years
        query = (
            supabase.table("reconciliation_snapshots")
            .select("*")
            .eq("property_id", str(property_id))
            .eq("status", "finalized")
        )

        # Only filter by organization_id if provided
        if organization_id is not None:
            query = query.eq("organization_id", str(organization_id))

        snapshots_by_year: dict[int, dict[str, Any]] = {}

        snapshots = fetch_all_pages(lambda: query)
        for snapshot in snapshots:
            # Extract year from period_start_date
            period_start_date = snapshot.get("period_start_date")
            if period_start_date:
                year = int(period_start_date[:4])
                if year in years:
                    snapshots_by_year[year] = snapshot

        # Verify we have snapshots for all years
        missing_years = [year for year in years if year not in snapshots_by_year]
        if missing_years:
            raise ValueError(f"No finalized snapshots found for years: {missing_years}")

        return snapshots_by_year

    async def _get_property_name(
        self, property_id: UUID, organization_id: UUID | None
    ) -> str:
        """Get property name.

        Args:
            property_id: Property ID
            organization_id: Organization scope for data reads

        Returns:
            Property name

        Raises:
            ValueError: If property not found
        """
        supabase = get_supabase_admin()

        query = supabase.table("properties").select("name").eq("id", str(property_id))

        # Only filter by organization_id if provided
        if organization_id is not None:
            query = query.eq("organization_id", str(organization_id))

        response = query.single().execute()

        if not response.data:
            raise ValueError(f"Property not found: {property_id}")

        property_data = cast(dict[str, Any], response.data)
        name = property_data["name"]
        if not isinstance(name, str):
            raise ValueError(f"Property name is not a string: {name}")
        return name

    async def _verify_property_access(
        self, property_id: UUID, organization_id: UUID
    ) -> None:
        """Ensure a property belongs to the organization before scoped reads."""
        supabase = get_supabase_admin()
        response = (
            supabase.table("properties")
            .select("id")
            .eq("id", str(property_id))
            .eq("organization_id", str(organization_id))
            .maybe_single()
            .execute()
        )
        if not response or not response.data:
            raise ValueError(f"Property not found: {property_id}")

    async def _get_pool_data_for_year(
        self, property_id: UUID, year: int, organization_id: UUID
    ) -> dict[str, Decimal]:
        """Get pool-level expense data for a specific property and year.

        Fetches GL entries and aggregates them by expense pool using pool mappings.

        Args:
            property_id: Property ID
            year: Year to get data for
            organization_id: Organization scope already verified by caller

        Returns:
            Dict mapping pool_name -> total amount
        """
        supabase = get_supabase_admin()

        # First, get all expense pools for this property
        pools = fetch_all_pages(
            lambda: supabase.table("expense_pools")
            .select("id, name")
            .eq("property_id", str(property_id))
        )
        logger.debug(
            "[YoY] property=%s year=%s: %d expense pools found",
            property_id,
            year,
            len(pools),
        )
        if not pools:
            logger.warning(f"No expense pools found for property {property_id}")
            return {}

        pool_names_by_id = {p["id"]: p["name"] for p in pools}
        pool_ids = list(pool_names_by_id.keys())

        # Get pool mappings for these pools
        mappings = fetch_all_pages(
            lambda: supabase.table("pool_mappings")
            .select("expense_pool_id, gl_account_pattern, allocation_percentage")
            .in_("expense_pool_id", pool_ids)
        )
        logger.debug(f"[YoY] {len(mappings)} pool mappings found")
        if not mappings:
            logger.warning(f"No pool mappings found for property {property_id}")
            return {}

        # Get GL entries for this property and year
        gl_entries = fetch_all_pages(
            lambda: supabase.table("gl_entries")
            .select("account_code, amount")
            .eq("property_id", str(property_id))
            .eq("period_year", year)
        )
        logger.debug(
            "[YoY] GL entries for property=%s year=%s: %d found",
            property_id,
            year,
            len(gl_entries),
        )
        if not gl_entries:
            logger.warning(
                f"No GL entries found for property {property_id}, year {year}"
            )
            return {}

        pool_data: dict[str, Decimal] = {}

        for gl_entry in gl_entries:
            account_code = gl_entry["account_code"]
            amount = Decimal(str(gl_entry["amount"]))

            # Find matching pool mapping
            for mapping in mappings:
                pattern = mapping["gl_account_pattern"]
                # Convert SQL LIKE % wildcard to fnmatch * wildcard
                fnmatch_pattern = pattern.replace("%", "*")
                if fnmatch.fnmatch(account_code, fnmatch_pattern):
                    pool_id = mapping["expense_pool_id"]
                    pool_name = pool_names_by_id.get(pool_id)
                    if pool_name:
                        allocation = Decimal(str(mapping["allocation_percentage"]))
                        allocated_amount = amount * allocation

                        if pool_name in pool_data:
                            pool_data[pool_name] += allocated_amount
                        else:
                            pool_data[pool_name] = allocated_amount
                    break  # First match wins based on priority

        logger.debug(f"Pool data for year {year}: {pool_data}")
        return pool_data

    async def _extract_pool_data(
        self,
        property_id: UUID,
        years: list[int],
        organization_id: UUID,
        verify_property_access: bool = True,
    ) -> dict[int, dict[str, Decimal]]:
        """Extract pool-level expense data for each year.

        Fetches GL entries and aggregates them by expense pool.

        Args:
            property_id: Property ID
            years: List of years to get data for
            organization_id: Organization scope for all reads
            verify_property_access: Check property organization before extraction

        Returns:
            Dict mapping year to dict of pool_name -> amount
        """
        pool_data_by_year: dict[int, dict[str, Decimal]] = {}
        if verify_property_access:
            await self._verify_property_access(property_id, organization_id)

        for year in years:
            pool_data_by_year[year] = await self._get_pool_data_for_year(
                property_id, year, organization_id
            )

        return pool_data_by_year

    def _build_pool_mappings(
        self, pool_data_by_year: dict[int, dict[str, Decimal]], years: list[int]
    ) -> dict[int, dict[str, str]]:
        """Build fuzzy pool name mappings across years.

        Args:
            pool_data_by_year: Pool data by year
            years: List of years (sorted)

        Returns:
            Dict mapping year to dict of pool_name -> matched_pool_name
        """
        base_year = years[0]
        base_pools = list(pool_data_by_year.get(base_year, {}).keys())

        mappings: dict[int, dict[str, str]] = {}

        for year in years[1:]:
            year_pools = list(pool_data_by_year.get(year, {}).keys())
            matcher = PoolMatcher(base_pools, year_pools)
            mappings[year] = matcher.matches

        return mappings
