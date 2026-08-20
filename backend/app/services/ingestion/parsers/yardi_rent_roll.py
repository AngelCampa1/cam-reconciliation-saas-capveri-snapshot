"""Yardi Rent Roll Parser.

Parses rent roll exports from Yardi Voyager property management software.
Extracts property metadata, unit information, and lease data.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import TYPE_CHECKING, Any, BinaryIO

import pandas as pd

from app.services.ingestion.schemas import (
    PropertyMetadata,
    RentRollParseResult,
    RentRollRow,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class YardiRentRollParser:
    """Parser for Yardi Voyager Rent Roll exports.

    Expected format:
    - CSV export from Yardi Voyager
    - Header section with property name, address, run date
    - Data columns: Unit, Suite SF, Usable SF, Floor, Tenant Name,
      Lease Start, Lease End, Monthly Rent, Pro Rata Share
    - Optional Total row at the end
    """

    @property
    def source_system(self) -> str:
        """Return the source system identifier."""
        return "yardi_rent_roll"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like a Yardi rent roll export.

        Args:
            file_header: First bytes of file for signature detection
            file_name: Original file name

        Returns:
            Confidence score 0.0-1.0
        """
        text = file_header.decode("utf-8", errors="ignore").upper()
        file_name_upper = file_name.upper()

        score = 0.0

        # Strong indicators - Yardi Voyager branding
        if "YARDI VOYAGER" in text:
            score += 0.6
        elif "YARDI" in text:
            score += 0.4
        elif "VOYAGER" in text:
            score += 0.3

        # Rent Roll specific keywords
        if "RENT ROLL" in text:
            score += 0.3
        elif "RENT" in text and "ROLL" in text:
            score += 0.2

        # Column patterns typical of rent roll
        rent_roll_columns = ["UNIT", "SUITE SF", "TENANT", "LEASE START", "LEASE END"]
        column_matches = sum(1 for col in rent_roll_columns if col in text)
        if column_matches >= 3:
            score += 0.3
        elif column_matches >= 2:
            score += 0.2
        elif column_matches >= 1:
            score += 0.1

        # Filename hints
        if "RENT_ROLL" in file_name_upper or "RENT-ROLL" in file_name_upper:
            score += 0.2
        elif "RENTROLL" in file_name_upper:
            score += 0.2
        elif "RENT" in file_name_upper and "ROLL" in file_name_upper:
            score += 0.1

        # Penalize if this looks like a GL report
        if "GL DETAIL" in text or "GENERAL LEDGER" in text:
            score -= 0.3

        return min(max(score, 0.0), 1.0)

    def parse(self, file: BinaryIO, file_name: str) -> RentRollParseResult:
        """Parse Yardi rent roll export.

        Args:
            file: File-like object to parse
            file_name: Original file name

        Returns:
            RentRollParseResult with property metadata, units, and parse statistics
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

            # Decode content
            try:
                text_content = file_content.decode("utf-8-sig")
            except UnicodeDecodeError:
                text_content = file_content.decode("latin-1")

            lines = text_content.strip().split("\n")

            # Extract property metadata from header lines
            property_metadata = self._extract_property_metadata(lines)

            # Find the header row and parse data
            header_row_idx = self._find_header_row(lines)
            if header_row_idx is None:
                # Try to parse anyway with default columns
                header_row_idx = 0

            # Read CSV data starting from header row
            file.seek(0)
            try:
                df = pd.read_csv(
                    BytesIO(file_content),
                    skiprows=header_row_idx,
                    encoding="utf-8-sig",
                    on_bad_lines="skip",
                )
            except Exception:
                df = pd.read_csv(
                    BytesIO(file_content),
                    skiprows=header_row_idx,
                    encoding="latin-1",
                    on_bad_lines="skip",
                )

            if df.empty:
                return RentRollParseResult(
                    success=True,
                    source_system=self.source_system,
                    property_metadata=property_metadata,
                    units=[],
                    row_count=0,
                )

            # Standardize column names
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
                property_metadata=property_metadata,
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

    def _extract_property_metadata(self, lines: list[str]) -> PropertyMetadata:
        """Extract property name and address from header lines.

        Args:
            lines: All lines from the file

        Returns:
            PropertyMetadata with extracted information
        """
        name: str | None = None
        address_line1: str | None = None
        city: str | None = None
        state: str | None = None
        postal_code: str | None = None

        # Look at first 10 lines for metadata
        for line in lines[:10]:
            line = line.strip()

            # Property name - "Property: Name"
            if line.lower().startswith("property:"):
                name = line.split(":", 1)[1].strip()
                continue

            # Address line - "Address: 123 Main St, City, ST 12345"
            if line.lower().startswith("address:"):
                address_part = line.split(":", 1)[1].strip()
                parsed = self._parse_address(address_part)
                address_line1 = parsed.get("address_line1")
                city = parsed.get("city")
                state = parsed.get("state")
                postal_code = parsed.get("postal_code")
                continue

        return PropertyMetadata(
            name=name,
            address_line1=address_line1,
            city=city,
            state=state,
            postal_code=postal_code,
        )

    def _parse_address(self, address_str: str) -> dict[str, str | None]:
        """Parse a full address string into components.

        Args:
            address_str: Full address like "123 Main St, Austin, TX 78701"

        Returns:
            Dict with address_line1, city, state, postal_code
        """
        result: dict[str, str | None] = {
            "address_line1": None,
            "city": None,
            "state": None,
            "postal_code": None,
        }

        if not address_str:
            return result

        # Split by comma
        parts = [p.strip() for p in address_str.split(",")]

        if len(parts) >= 1:
            result["address_line1"] = parts[0]

        if len(parts) >= 2:
            result["city"] = parts[1]

        if len(parts) >= 3:
            # Last part should be "ST 12345" or "ST" or "12345"
            state_zip = parts[2].strip()
            # Try to extract state and zip
            match = re.match(r"([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?", state_zip)
            if match:
                result["state"] = match.group(1)
                if match.group(2):
                    result["postal_code"] = match.group(2)
            elif re.match(r"\d{5}", state_zip):
                result["postal_code"] = state_zip[:5]

        return result

    def _find_header_row(self, lines: list[str]) -> int | None:
        """Find the header row by looking for expected column names.

        Args:
            lines: List of file lines

        Returns:
            Index of the header row (0-based), or None if not found
        """
        # Look for typical rent roll column headers
        header_keywords = ["UNIT", "SF", "TENANT", "LEASE", "RENT"]

        for i, line in enumerate(lines):
            line_upper = line.upper()
            matches = sum(1 for kw in header_keywords if kw in line_upper)
            if matches >= 2:
                return i

        return None

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map Yardi column names to standard names.

        Args:
            df: DataFrame with original column names

        Returns:
            DataFrame with standardized column names
        """
        # Lowercase and strip column names
        df.columns = df.columns.astype(str).str.lower().str.strip()

        column_mappings = {
            # Unit number
            "unit": "unit_number",
            "unit number": "unit_number",
            "unit #": "unit_number",
            "suite": "unit_number",
            "space": "unit_number",
            # Square footage
            "suite sf": "rentable_sqft",
            "rentable sf": "rentable_sqft",
            "rsf": "rentable_sqft",
            "sq ft": "rentable_sqft",
            "sqft": "rentable_sqft",
            "sf": "rentable_sqft",
            # Usable SF
            "usable sf": "usable_sqft",
            "usf": "usable_sqft",
            # Floor
            "floor": "floor",
            "flr": "floor",
            # Tenant
            "tenant name": "tenant_name",
            "tenant": "tenant_name",
            "lessee": "tenant_name",
            "occupant": "tenant_name",
            # Lease dates
            "lease start": "lease_start",
            "start date": "lease_start",
            "commencement": "lease_start",
            "lease end": "lease_end",
            "end date": "lease_end",
            "expiration": "lease_end",
            "expiry": "lease_end",
            # Rent
            "monthly rent": "base_rent",
            "rent": "base_rent",
            "base rent": "base_rent",
            "annual rent": "base_rent",
            # CAM share
            "pro rata share": "cam_share",
            "pro-rata share": "cam_share",
            "share": "cam_share",
            "cam share": "cam_share",
            "pro rata": "cam_share",
        }

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
        # CAM share needs 4 decimal places for percentages like 0.0523
        cam_share = self._get_decimal_value(row, "cam_share", precision=4)

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
        """Get a string value from a row, handling NaN and empty strings.

        Args:
            row: Pandas Series
            column: Column name

        Returns:
            String value or None
        """
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
        """Get a Decimal value from a row, handling currency formatting.

        Args:
            row: Pandas Series
            column: Column name
            precision: Number of decimal places to keep (default 2 for currency)

        Returns:
            Decimal value or None
        """
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

    def _get_int_value(self, row: pd.Series, column: str) -> int | None:
        """Get an integer value from a row.

        Args:
            row: Pandas Series
            column: Column name

        Returns:
            Integer value or None
        """
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
        """Get a date value from a row, handling various formats.

        Args:
            row: Pandas Series
            column: Column name
            warnings: List to append warnings to
            row_idx: Row index for error messages

        Returns:
            date value or None
        """
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
