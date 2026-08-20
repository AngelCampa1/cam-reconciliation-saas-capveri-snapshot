"""Generic Rent Roll Parser.

Fallback parser for rent roll files that don't match specific ERP systems.
Uses flexible column mapping to handle various naming conventions.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, BinaryIO

import pandas as pd

from app.services.ingestion.schemas import (
    PropertyMetadata,
    RentRollParseResult,
    RentRollRow,
)

logger = logging.getLogger(__name__)


class GenericRentRollParser:
    """Generic parser for rent roll exports.

    This parser serves as a fallback for files that don't match specific
    ERP systems (Yardi, MRI). It uses flexible column mapping to handle
    various naming conventions.

    Returns a lower confidence score than specialized parsers to ensure
    they take precedence when appropriate.
    """

    @property
    def source_system(self) -> str:
        """Return the source system identifier."""
        return "generic_rent_roll"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like a rent roll file.

        As a fallback parser, always returns a score but lower than
        specialized parsers to let them take precedence.

        Args:
            file_header: First bytes of file for signature detection
            file_name: Original file name

        Returns:
            Confidence score 0.0-1.0
        """
        text = file_header.decode("utf-8", errors="ignore").upper()
        file_name_upper = file_name.upper()

        # Base score - always return something as fallback
        score = 0.1

        # Penalize if this looks like a specific ERP
        if "YARDI" in text or "VOYAGER" in text:
            score -= 0.05
        if "MRI SOFTWARE" in text or "PROPERTY CODE:" in text:
            score -= 0.05

        # Boost for rent roll keywords in content
        rent_roll_keywords = [
            "UNIT",
            "SUITE",
            "SPACE",
            "SQFT",
            "SF",
            "TENANT",
            "LEASE",
            "RENT",
            "OCCUPANT",
        ]
        keyword_matches = sum(1 for kw in rent_roll_keywords if kw in text)
        if keyword_matches >= 3:
            score += 0.3
        elif keyword_matches >= 2:
            score += 0.2
        elif keyword_matches >= 1:
            score += 0.1

        # Boost for rent roll in filename
        if "RENT_ROLL" in file_name_upper or "RENT-ROLL" in file_name_upper:
            score += 0.15
        elif "RENTROLL" in file_name_upper:
            score += 0.15
        elif "RENT" in file_name_upper and "ROLL" in file_name_upper:
            score += 0.1

        # Cap at 0.45 to stay below specialized parsers
        return min(max(score, 0.05), 0.45)

    def parse(self, file: BinaryIO, file_name: str) -> RentRollParseResult:
        """Parse generic rent roll export.

        Args:
            file: File-like object to parse
            file_name: Original file name

        Returns:
            RentRollParseResult with units and parse statistics
        """
        errors: list[str] = []
        warnings: list[str] = []

        try:
            # Read file content
            file_content = file.read()
            if not file_content or len(file_content.strip()) == 0:
                return RentRollParseResult(
                    success=False,
                    source_system=self.source_system,
                    property_metadata=PropertyMetadata(
                        name=None,
                        address_line1=None,
                        city=None,
                        state=None,
                        postal_code=None,
                    ),
                    units=[],
                    row_count=0,
                    error_count=1,
                    errors=["File is empty or could not be read"],
                )

            # Try to read as CSV
            try:
                df = pd.read_csv(
                    BytesIO(file_content),
                    encoding="utf-8-sig",
                    on_bad_lines="skip",
                )
            except Exception:
                try:
                    df = pd.read_csv(
                        BytesIO(file_content),
                        encoding="latin-1",
                        on_bad_lines="skip",
                    )
                except Exception as e:
                    return RentRollParseResult(
                        success=False,
                        source_system=self.source_system,
                        property_metadata=PropertyMetadata(
                            name=None,
                            address_line1=None,
                            city=None,
                            state=None,
                            postal_code=None,
                        ),
                        units=[],
                        row_count=0,
                        error_count=1,
                        errors=[f"Could not parse CSV: {str(e)}"],
                    )

            if df.empty:
                return RentRollParseResult(
                    success=True,
                    source_system=self.source_system,
                    property_metadata=PropertyMetadata(
                        name=None,
                        address_line1=None,
                        city=None,
                        state=None,
                        postal_code=None,
                    ),
                    units=[],
                    row_count=0,
                )

            # Standardize column names with flexible mapping
            df = self._standardize_column_names(df)

            # Parse units from rows
            units: list[RentRollRow] = []
            error_count = 0
            seen_units: set[str] = set()

            for idx, row in df.iterrows():
                try:
                    unit = self._parse_row(row, idx, warnings)
                    if unit is not None:
                        # Check for duplicate unit numbers
                        if unit.unit_number in seen_units:
                            warnings.append(
                                f"Row {idx}: Duplicate unit number "
                                f"'{unit.unit_number}' - will be skipped"
                            )
                            continue
                        seen_units.add(unit.unit_number)
                        units.append(unit)
                except Exception as e:
                    error_count += 1
                    warnings.append(f"Row {idx}: {str(e)}")

            return RentRollParseResult(
                success=True,
                source_system=self.source_system,
                property_metadata=PropertyMetadata(
                    name=None,
                    address_line1=None,
                    city=None,
                    state=None,
                    postal_code=None,
                ),
                units=units,
                row_count=len(units),
                error_count=error_count,
                errors=errors,
                warnings=warnings,
            )

        except Exception as e:
            return RentRollParseResult(
                success=False,
                source_system=self.source_system,
                property_metadata=PropertyMetadata(
                    name=None,
                    address_line1=None,
                    city=None,
                    state=None,
                    postal_code=None,
                ),
                units=[],
                row_count=0,
                error_count=1,
                errors=[f"Parse error: {str(e)}"],
            )

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map various column names to standard names.

        Uses broad matching to handle many naming conventions.

        Args:
            df: DataFrame with original column names

        Returns:
            DataFrame with standardized column names
        """
        # Lowercase and strip column names
        df.columns = df.columns.astype(str).str.lower().str.strip()

        # Build comprehensive mapping
        column_mappings: dict[str, str] = {}

        for col in df.columns:
            col_lower = col

            # Unit number mappings
            if any(kw in col_lower for kw in ["unit", "suite", "space"]):
                if (
                    "number" in col_lower
                    or "id" in col_lower
                    or "code" in col_lower
                    or col_lower in ["unit", "suite", "space"]
                ):
                    column_mappings[col] = "unit_number"

            # Square footage mappings - must check before other mappings
            if any(kw in col_lower for kw in ["sf", "sqft", "feet", "area"]):
                if "rentable" in col_lower or "rsf" == col_lower:
                    column_mappings[col] = "rentable_sqft"
                elif "usable" in col_lower or "usf" == col_lower:
                    column_mappings[col] = "usable_sqft"
                elif "rentable_sqft" not in column_mappings.values():
                    # Default to rentable if no explicit rentable sqft column
                    column_mappings[col] = "rentable_sqft"

            # Tenant name mappings
            if any(kw in col_lower for kw in ["tenant", "occupant", "lessee"]):
                column_mappings[col] = "tenant_name"

            # Lease start mappings
            if any(
                start_kw in col_lower for start_kw in ["start", "commence", "begin"]
            ):
                column_mappings[col] = "lease_start"

            # Lease end mappings
            if any(end_kw in col_lower for end_kw in ["end", "expir", "termin"]):
                column_mappings[col] = "lease_end"

            # Rent mappings
            if "rent" in col_lower:
                if "base" in col_lower or "monthly" in col_lower or col_lower == "rent":
                    column_mappings[col] = "base_rent"

            # CAM share mappings
            if any(
                kw in col_lower
                for kw in ["share", "pro rata", "cam", "percentage", "%"]
            ):
                column_mappings[col] = "cam_share"

            # Floor mappings
            if col_lower in ["floor", "flr", "level"]:
                column_mappings[col] = "floor"

        df = df.rename(columns=column_mappings)
        return df

    def _parse_row(
        self, row: pd.Series, row_idx: Any, warnings: list[str]
    ) -> RentRollRow | None:
        """Parse a single row into a RentRollRow.

        Args:
            row: Pandas Series representing the row
            row_idx: Row index for error messages
            warnings: List to append warnings to

        Returns:
            RentRollRow if valid, None if row should be skipped
        """
        # Get unit number
        unit_number = self._get_string_value(row, "unit_number")

        # Skip total/summary rows
        if unit_number and unit_number.lower() in [
            "total",
            "totals",
            "subtotal",
            "grand total",
        ]:
            return None

        # Skip if no unit number
        if not unit_number:
            return None

        # Get square footage (required)
        rentable_sqft = self._get_decimal_value(row, "rentable_sqft")
        if rentable_sqft is None:
            warnings.append(f"Row {row_idx + 1}: Missing or invalid rentable_sqft")
            return None

        # Get optional fields
        usable_sqft = self._get_decimal_value(row, "usable_sqft")
        floor = self._get_int_value(row, "floor")

        # Tenant/lease info (may be None for vacant units)
        tenant_name = self._get_string_value(row, "tenant_name")
        lease_start = self._get_date_value(row, "lease_start", warnings, row_idx)
        lease_end = self._get_date_value(row, "lease_end", warnings, row_idx)
        base_rent = self._get_decimal_value(row, "base_rent")

        # For vacant units with 0.00 rent, convert to None
        if base_rent == Decimal("0.00") and tenant_name is None:
            base_rent = None

        # CAM share - handle percentage format
        cam_share = self._get_cam_share(row)

        # Build raw row data for debugging
        raw_row_data = {str(k): str(v) for k, v in row.items() if pd.notna(v)}

        return RentRollRow(
            unit_number=unit_number,
            rentable_sqft=rentable_sqft,
            usable_sqft=usable_sqft,
            floor=floor,
            tenant_name=tenant_name,
            lease_start=lease_start,
            lease_end=lease_end,
            base_rent=base_rent,
            cam_share=cam_share,
            raw_row_data=raw_row_data,
        )

    def _get_string_value(self, row: pd.Series, column: str) -> str | None:
        """Get a string value from a row, handling NaN and empty strings."""
        if column not in row.index:
            return None

        val = row[column]
        if pd.isna(val):
            return None

        val_str = str(val).strip()
        if val_str == "" or val_str.lower() == "nan":
            return None

        return val_str

    def _get_decimal_value(
        self, row: pd.Series, column: str, precision: int = 2
    ) -> Decimal | None:
        """Get a Decimal value from a row, handling currency formatting."""
        if column not in row.index:
            return None

        val = row[column]
        if pd.isna(val):
            return None

        quantize_str = "0." + "0" * precision

        # Handle numeric types directly
        if isinstance(val, int | float):
            if pd.isna(val):
                return None
            return Decimal(str(val)).quantize(Decimal(quantize_str))

        # Handle string values
        val_str = str(val).strip()
        if val_str == "" or val_str.lower() == "nan":
            return None

        # Remove currency formatting ($, commas)
        val_str = val_str.replace("$", "").replace(",", "").strip()

        try:
            return Decimal(val_str).quantize(Decimal(quantize_str))
        except InvalidOperation:
            return None

    def _get_cam_share(self, row: pd.Series) -> Decimal | None:
        """Get CAM share, converting from percentage format if needed."""
        if "cam_share" not in row.index:
            return None

        val = row["cam_share"]
        if pd.isna(val):
            return None

        try:
            # Handle string with % sign
            if isinstance(val, str):
                val_str = val.strip().replace("%", "")
                if val_str == "" or val_str.lower() == "nan":
                    return None
                raw_value = Decimal(val_str)
            else:
                raw_value = Decimal(str(val))

            # If value is > 1, assume it's a percentage and convert
            # e.g., 5.23 -> 0.0523
            if raw_value > 1:
                return (raw_value / 100).quantize(Decimal("0.0001"))
            else:
                return raw_value.quantize(Decimal("0.0001"))

        except InvalidOperation:
            return None

    def _get_int_value(self, row: pd.Series, column: str) -> int | None:
        """Get an integer value from a row."""
        if column not in row.index:
            return None

        val = row[column]
        if pd.isna(val):
            return None

        try:
            return int(float(val))
        except (ValueError, TypeError):
            return None

    def _get_date_value(
        self, row: pd.Series, column: str, warnings: list[str], row_idx: Any
    ) -> date | None:
        """Get a date value from a row, handling various formats."""
        if column not in row.index:
            return None

        val = row[column]
        if pd.isna(val):
            return None

        val_str = str(val).strip()
        if val_str == "" or val_str.lower() == "nan":
            return None

        # Try various date formats
        date_formats = [
            "%m/%d/%Y",  # 01/15/2024
            "%Y-%m-%d",  # 2024-01-15
            "%d-%b-%Y",  # 15-Jan-2024
            "%d/%m/%Y",  # 15/01/2024
            "%Y/%m/%d",  # 2024/01/15
            "%b %d, %Y",  # Jan 15, 2024
            "%m-%d-%Y",  # 01-15-2024
        ]

        for fmt in date_formats:
            try:
                parsed = pd.to_datetime(val_str, format=fmt).date()
                return parsed
            except (ValueError, TypeError):
                continue

        # Try pandas auto-detection as fallback
        try:
            parsed = pd.to_datetime(val_str)
            if pd.notna(parsed):
                return parsed.date()
        except (ValueError, TypeError):
            pass

        # Could not parse date
        warnings.append(
            f"Row {row_idx + 1}: Could not parse date '{val_str}' in {column}"
        )
        return None
