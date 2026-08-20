"""Rent Roll Import Service.

Orchestrates rent roll file parsing and database import operations.
Supports multiple ERP formats (Yardi, MRI, Generic) with automatic
format detection.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any, BinaryIO, cast
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import CapType, LeaseStatus, UnitStatus
from app.services.ingestion.parsers.generic_rent_roll import GenericRentRollParser
from app.services.ingestion.parsers.mri_rent_roll import MRIRentRollParser
from app.services.ingestion.parsers.yardi_rent_roll import YardiRentRollParser
from app.services.ingestion.schemas import RentRollParseResult

logger = logging.getLogger(__name__)

# Header size for fingerprinting
HEADER_SIZE = 8192
ParserType = YardiRentRollParser | MRIRentRollParser | GenericRentRollParser


class RentRollImportResult(BaseModel):
    """Result of importing a rent roll file."""

    success: bool = Field(description="Whether import succeeded")
    property_id: UUID | None = Field(None, description="Created property ID")
    property_name: str | None = Field(None, description="Property name")
    units_created: int = Field(default=0, description="Number of units created")
    leases_created: int = Field(default=0, description="Number of leases created")
    errors: list[str] = Field(default_factory=list, description="Error messages")
    warnings: list[str] = Field(default_factory=list, description="Warning messages")


class RentRollImportService:
    """Service for importing rent roll files.

    Handles:
    - File format detection via fingerprinting
    - Parser selection (Yardi, MRI, Generic)
    - Preview (parse only, no DB)
    - Full import (Property + Units + Leases creation)
    """

    # Error message translations for user-friendly messages
    ERROR_TRANSLATIONS: dict[str, str] = {
        "unique_unit_per_property": (
            "Duplicate unit number found. Each unit must have a unique number."
        ),
        "properties_common_area_sqft_check": (
            "Common area square footage must be a positive number."
        ),
        "properties_total_rentable_sqft_check": (
            "Total rentable square footage must be a positive number."
        ),
        "properties_total_usable_sqft_check": (
            "Total usable square footage must be a positive number."
        ),
        "units_rentable_sqft_check": (
            "Unit rentable square footage must be a positive number."
        ),
        "leases_base_rent_check": "Base rent must be a positive number.",
    }

    def __init__(self) -> None:
        """Initialize service with available parsers."""
        # Order matters - specialized parsers first
        self.parsers: list[ParserType] = [
            YardiRentRollParser(),
            MRIRentRollParser(),
            GenericRentRollParser(),  # Fallback
        ]

    def _translate_db_error(self, error_msg: str) -> str:
        """Convert raw database errors to user-friendly messages.

        Args:
            error_msg: Raw error message from database or exception

        Returns:
            User-friendly error message
        """
        for key, message in self.ERROR_TRANSLATIONS.items():
            if key in error_msg:
                return message
        # Return original with prefix if no translation found
        return f"Import failed: {error_msg}"

    def preview(self, file: BinaryIO, file_name: str) -> RentRollParseResult:
        """Parse file and return preview data without database interaction.

        Uses fingerprinting to detect file format and select appropriate parser.

        Args:
            file: File-like object to parse
            file_name: Original filename

        Returns:
            RentRollParseResult with parsed data
        """
        # Read header for fingerprinting
        file_header = file.read(HEADER_SIZE)
        file.seek(0)

        # Select best parser
        parser = self._select_parser(file_header, file_name)
        logger.info(f"Selected parser: {parser.source_system} for {file_name}")

        # Parse file
        return parser.parse(file, file_name)

    def import_rent_roll(
        self,
        file: BinaryIO,
        file_name: str,
        organization_id: UUID,
        db: Any,  # Supabase client
        property_name_override: str | None = None,
        address_override: str | None = None,
        city_override: str | None = None,
        state_override: str | None = None,
        postal_code_override: str | None = None,
    ) -> RentRollImportResult:
        """Import rent roll file, creating Property + Units + Leases.

        Args:
            file: File-like object to parse
            file_name: Original filename
            organization_id: Organization to create property under
            db: Supabase client
            property_name_override: Override detected property name
            address_override: Override detected address
            city_override: Override detected city
            state_override: Override detected state
            postal_code_override: Override detected postal code

        Returns:
            RentRollImportResult with created entity IDs and counts
        """
        warnings: list[str] = []

        # Parse file first
        parse_result = self.preview(file, file_name)

        if not parse_result.success:
            return RentRollImportResult(
                success=False,
                property_id=None,
                property_name=None,
                errors=parse_result.errors,
                warnings=parse_result.warnings,
            )

        if len(parse_result.units) == 0:
            return RentRollImportResult(
                success=False,
                property_id=None,
                property_name=None,
                errors=["No units found in rent roll file"],
            )

        # Determine property metadata
        prop_meta = parse_result.property_metadata
        property_name = property_name_override or prop_meta.name or "Imported Property"
        address = address_override or prop_meta.address_line1 or "Unknown Address"
        city = city_override or prop_meta.city or "Unknown"
        state = state_override or prop_meta.state or "TX"
        postal_code = postal_code_override or prop_meta.postal_code or "00000"

        # Calculate totals from units
        total_rentable_sqft = sum(
            (u.rentable_sqft for u in parse_result.units), Decimal("0")
        )
        total_usable_sqft = sum(
            (
                u.usable_sqft or u.rentable_sqft * Decimal("0.9")
                for u in parse_result.units
            ),
            Decimal("0"),
        )
        # Ensure usable <= rentable
        if total_usable_sqft > total_rentable_sqft:
            total_usable_sqft = total_rentable_sqft * Decimal("0.9")

        try:
            # Create property
            property_id = self._create_property(
                db=db,
                organization_id=organization_id,
                name=property_name,
                address_line1=address,
                city=city,
                state=state,
                postal_code=postal_code,
                total_rentable_sqft=total_rentable_sqft,
                total_usable_sqft=total_usable_sqft,
            )

            # Create units and leases
            units_created = 0
            leases_created = 0

            for unit_data in parse_result.units:
                # Create unit
                unit_id = self._create_unit(
                    db=db,
                    property_id=property_id,
                    unit_number=unit_data.unit_number,
                    rentable_sqft=unit_data.rentable_sqft,
                    usable_sqft=unit_data.usable_sqft
                    or unit_data.rentable_sqft * Decimal("0.9"),
                    floor=unit_data.floor,
                    is_occupied=unit_data.tenant_name is not None,
                )
                units_created += 1

                # Create lease if tenant data exists
                if (
                    unit_data.tenant_name
                    and unit_data.lease_start
                    and unit_data.lease_end
                ):
                    self._create_lease(
                        db=db,
                        property_id=property_id,
                        unit_id=unit_id,
                        tenant_name=unit_data.tenant_name,
                        start_date=unit_data.lease_start,
                        end_date=unit_data.lease_end,
                        pro_rata_share=unit_data.cam_share or Decimal("0"),
                    )
                    leases_created += 1

            return RentRollImportResult(
                success=True,
                property_id=property_id,
                property_name=property_name,
                units_created=units_created,
                leases_created=leases_created,
                warnings=warnings + parse_result.warnings,
            )

        except Exception as e:
            logger.exception("Error importing rent roll")
            user_message = self._translate_db_error(str(e))
            return RentRollImportResult(
                success=False,
                property_id=None,
                property_name=None,
                errors=[user_message],
                warnings=warnings,
            )

    def _select_parser(
        self, file_header: bytes, file_name: str
    ) -> YardiRentRollParser | MRIRentRollParser | GenericRentRollParser:
        """Select the best parser based on file fingerprinting.

        Args:
            file_header: First bytes of file
            file_name: Original filename

        Returns:
            Best matching parser
        """
        best_parser: YardiRentRollParser | MRIRentRollParser | GenericRentRollParser = (
            self.parsers[-1]
        )  # Default to generic
        best_score = 0.0

        for parser in self.parsers:
            score = parser.can_handle(file_header, file_name)
            logger.debug(f"Parser {parser.source_system}: score {score:.2f}")
            if score > best_score:
                best_score = score
                best_parser = parser

        return best_parser

    def _create_property(
        self,
        db: Any,  # Supabase client
        organization_id: UUID,
        name: str,
        address_line1: str,
        city: str,
        state: str,
        postal_code: str,
        total_rentable_sqft: Decimal,
        total_usable_sqft: Decimal,
    ) -> UUID:
        """Create a property in the database.

        Args:
            db: Supabase client
            organization_id: Organization ID
            name: Property name
            address_line1: Street address
            city: City
            state: State code
            postal_code: ZIP code
            total_rentable_sqft: Total rentable area
            total_usable_sqft: Total usable area

        Returns:
            Created property ID
        """
        # Calculate common area (typically 10% of rentable)
        common_area_sqft = total_rentable_sqft - total_usable_sqft

        data = {
            "organization_id": str(organization_id),
            "name": name,
            "address_line1": address_line1,
            "city": city,
            "state": state,
            "postal_code": postal_code,
            "total_rentable_sqft": float(total_rentable_sqft),
            "total_usable_sqft": float(total_usable_sqft),
            "common_area_sqft": float(common_area_sqft),
            "target_occupancy": 0.95,
        }

        result = db.table("properties").insert(data).execute()

        if not result.data:
            raise ValueError("Failed to create property")

        return UUID(result.data[0]["id"])

    def _create_unit(
        self,
        db: Any,  # Supabase client
        property_id: UUID,
        unit_number: str,
        rentable_sqft: Decimal,
        usable_sqft: Decimal,
        floor: int | None,
        is_occupied: bool,
    ) -> UUID:
        """Create a unit in the database.

        Args:
            db: Supabase client
            property_id: Parent property ID
            unit_number: Unit identifier
            rentable_sqft: Rentable area
            usable_sqft: Usable area
            floor: Floor number
            is_occupied: Whether unit has a tenant

        Returns:
            Created unit ID
        """
        status = UnitStatus.OCCUPIED if is_occupied else UnitStatus.VACANT

        data = {
            "property_id": str(property_id),
            "unit_number": unit_number,
            "rentable_sqft": float(rentable_sqft),
            "usable_sqft": float(usable_sqft),
            "floor": floor,
            "status": status.value,
        }

        result = db.table("units").insert(data).execute()

        if not result.data:
            raise ValueError("Failed to create unit")

        return UUID(result.data[0]["id"])

    def _create_lease(
        self,
        db: Any,  # Supabase client
        property_id: UUID,
        unit_id: UUID,
        tenant_name: str,
        start_date: date,
        end_date: date,
        pro_rata_share: Decimal,
    ) -> UUID:
        """Create a lease in the database.

        Args:
            db: Supabase client
            property_id: Property ID
            unit_id: Unit ID
            tenant_name: Tenant name
            start_date: Lease start date
            end_date: Lease end date
            pro_rata_share: Tenant's pro-rata share

        Returns:
            Created lease ID
        """
        # Build recovery profile as JSON
        recovery_profile: dict[str, Any] = {
            "base_year": None,
            "base_year_amount": None,
            "gross_up_base_year": False,
            "pro_rata_share": str(pro_rata_share),
            "cap_type": CapType.NONE.value,
            "cap_rate": None,
            "admin_fee_percentage": "0",
            "management_fee_percentage": None,
            "excluded_pools": [],
        }

        data = {
            "property_id": str(property_id),
            "unit_id": str(unit_id),
            "tenant_name": tenant_name,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "status": LeaseStatus.ACTIVE.value,
            "recovery_profile": recovery_profile,
        }

        result = db.table("leases").insert(cast(Any, data)).execute()

        if not result.data:
            raise ValueError("Failed to create lease")

        return UUID(result.data[0]["id"])
