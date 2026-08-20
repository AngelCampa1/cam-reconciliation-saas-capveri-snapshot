"""Billing Data Parser.

Parses CAM reconciliation exports and billing statements from property management
systems to extract what was actually billed to tenants.

This data is compared against CapVeri calculations to identify leakage.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import BinaryIO

import pandas as pd
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class BilledAmountRow(BaseModel):
    """Single row of billed amount data."""

    tenant_name: str = Field(..., min_length=1, max_length=255)
    billed_amount: Decimal = Field(..., ge=Decimal("0"))
    suite: str | None = Field(None, max_length=100)


class BillingParseResult(BaseModel):
    """Result of parsing a billing data file."""

    model_config = {"arbitrary_types_allowed": True}

    success: bool = Field(description="True if parsing completed without fatal errors")
    source_type: str = Field(
        default="csv_import",
        description="Source type: yardi_recon, mri_recon, csv_import",
    )
    data: list[BilledAmountRow] = Field(
        default_factory=list, description="Parsed billing data rows"
    )
    total_billed: Decimal = Field(
        default=Decimal("0"), description="Sum of all billed amounts"
    )
    row_count: int = Field(default=0, ge=0, description="Number of valid rows parsed")
    error_count: int = Field(default=0, ge=0, description="Number of rows that failed")
    errors: list[str] = Field(default_factory=list, description="Error messages")
    warnings: list[str] = Field(default_factory=list, description="Warning messages")


class BillingParser:
    """Parser for billing data exports (CAM reconciliation reports, billing statements).

    Supports:
    - Yardi CAM reconciliation exports
    - MRI CAM reconciliation exports
    - Generic CSV/Excel with tenant and amount columns
    """

    def detect_source_type(self, file_header: bytes, file_name: str) -> str:
        """Detect the source type from file content.

        Args:
            file_header: First bytes of file
            file_name: Original file name

        Returns:
            Source type: yardi_recon, mri_recon, or csv_import
        """
        text = file_header.decode("utf-8", errors="ignore").upper()

        if "YARDI" in text or "VOYAGER" in text:
            if "RECONCILIATION" in text or "CAM" in text:
                return "yardi_recon"
            return "yardi_recon"  # Assume CAM recon for Yardi

        if "MRI" in text:
            return "mri_recon"

        # Check filename
        lower_name = file_name.lower()
        if "yardi" in lower_name:
            return "yardi_recon"
        if "mri" in lower_name:
            return "mri_recon"

        return "csv_import"

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
    ) -> BillingParseResult:
        """Parse billing data file.

        Args:
            file: File-like object to parse
            file_name: Original file name

        Returns:
            BillingParseResult with parsed tenant billing data
        """
        errors: list[str] = []
        warnings: list[str] = []

        try:
            # Read file header for source detection
            file_header = file.read(4096)
            file.seek(0)
            source_type = self.detect_source_type(file_header, file_name)

            # Read file based on extension
            if file_name.lower().endswith((".xlsx", ".xls")):
                df = pd.read_excel(file, header=0)
            else:
                # Try CSV with different encodings
                try:
                    df = pd.read_csv(file, encoding="utf-8-sig", on_bad_lines="skip")
                except pd.errors.EmptyDataError:
                    return BillingParseResult(
                        success=False,
                        source_type=source_type,
                        errors=["File is empty - no billing data to parse"],
                    )
                except Exception:
                    file.seek(0)
                    try:
                        df = pd.read_csv(file, encoding="latin-1", on_bad_lines="skip")
                    except pd.errors.EmptyDataError:
                        return BillingParseResult(
                            success=False,
                            source_type=source_type,
                            errors=["File is empty - no billing data to parse"],
                        )

            if df.empty:
                return BillingParseResult(
                    success=False,
                    source_type=source_type,
                    errors=["File is empty or could not be parsed"],
                )

            # Standardize column names
            df = self._standardize_columns(df)

            # Find tenant and amount columns
            tenant_col = self._find_column(
                df, ["tenant", "tenant_name", "lessee", "occupant", "name"]
            )
            amount_col = self._find_column(
                df,
                [
                    "billed",
                    "amount",
                    "total",
                    "charges",
                    "cam_charges",
                    "total_charges",
                    "billed_amount",
                    "recovery",
                ],
            )
            suite_col = self._find_column(df, ["suite", "unit", "space"])

            if not tenant_col:
                errors.append(
                    "Could not find tenant column. "
                    "Expected: tenant, lessee, occupant, or name"
                )
                return BillingParseResult(
                    success=False,
                    source_type=source_type,
                    errors=errors,
                )

            if not amount_col:
                errors.append(
                    "Could not find amount column. "
                    "Expected: billed, amount, total, or charges"
                )
                return BillingParseResult(
                    success=False,
                    source_type=source_type,
                    errors=errors,
                )

            # Parse rows
            rows: list[BilledAmountRow] = []
            total_billed = Decimal("0")
            error_count = 0

            for idx, row in df.iterrows():
                try:
                    tenant_name = str(row[tenant_col]).strip()
                    if not tenant_name or tenant_name.lower() in ["nan", "none", ""]:
                        continue

                    # Skip total/subtotal rows
                    if any(
                        word in tenant_name.lower()
                        for word in ["total", "subtotal", "sum", "grand"]
                    ):
                        continue

                    # Parse amount
                    amount_raw = row[amount_col]
                    if pd.isna(amount_raw):
                        continue

                    # Clean currency formatting
                    amount_str = (
                        str(amount_raw).replace("$", "").replace(",", "").strip()
                    )
                    # Handle parentheses for negatives
                    if amount_str.startswith("(") and amount_str.endswith(")"):
                        amount_str = "-" + amount_str[1:-1]

                    try:
                        amount = Decimal(amount_str)
                    except Exception:
                        error_count += 1
                        continue

                    # Skip zero or negative amounts
                    if amount <= 0:
                        continue

                    suite = None
                    if suite_col:
                        suite_raw = row[suite_col]
                        if pd.notna(suite_raw):
                            suite = str(suite_raw).strip()

                    rows.append(
                        BilledAmountRow(
                            tenant_name=tenant_name,
                            billed_amount=amount,
                            suite=suite,
                        )
                    )
                    total_billed += amount

                except Exception as e:
                    error_count += 1
                    logger.debug(f"Failed to parse row {idx}: {e}")

            if not rows:
                errors.append("No valid billing data found in file")
                return BillingParseResult(
                    success=False,
                    source_type=source_type,
                    errors=errors,
                    warnings=warnings,
                )

            if error_count > 0:
                warnings.append(f"Skipped {error_count} rows due to parsing errors")

            return BillingParseResult(
                success=True,
                source_type=source_type,
                data=rows,
                total_billed=total_billed,
                row_count=len(rows),
                error_count=error_count,
                errors=errors,
                warnings=warnings,
            )

        except Exception as e:
            logger.exception("Failed to parse billing file")
            return BillingParseResult(
                success=False,
                source_type="csv_import",
                errors=[f"Parse error: {str(e)}"],
            )

    def _standardize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Standardize column names to lowercase."""
        df.columns = df.columns.astype(str).str.lower().str.strip()
        # Replace spaces with underscores
        df.columns = df.columns.str.replace(" ", "_")
        return df

    def _find_column(self, df: pd.DataFrame, candidates: list[str]) -> str | None:
        """Find a column matching one of the candidate names.

        Args:
            df: DataFrame to search
            candidates: List of possible column names (lowercase)

        Returns:
            The matching column name or None
        """
        columns_lower = {c.lower(): c for c in df.columns}

        for candidate in candidates:
            # Exact match
            if candidate in columns_lower:
                return columns_lower[candidate]
            # Partial match
            for col_lower, col_original in columns_lower.items():
                if candidate in col_lower:
                    return col_original

        return None
