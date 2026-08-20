"""Validation layer for lease extraction results.

Validates extracted lease data against business rules and flags inconsistencies.
Unlike Pydantic validators which raise hard errors, this layer issues warnings
that allow data to proceed but flag it for human review in the HITL UI.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.models.enums import CapType
from app.services.extraction.extraction_models import LeaseExtractionResult


@dataclass
class ValidationWarning:
    """Warning for out-of-range or suspicious values.

    Warnings allow the extraction to proceed but flag the field
    for careful review in the human-in-the-loop verification UI.
    """

    field: str
    message: str
    value: Decimal | int | str | None
    severity: str = "warning"  # "warning" or "info"


@dataclass
class ValidationError:
    """Critical validation error requiring attention.

    Errors indicate data consistency issues that must be resolved
    before the extraction can be saved (e.g., cap rate missing when cap type set).
    """

    field: str
    message: str
    value: Decimal | int | str | None = None


@dataclass
class ValidationResult:
    """Result of validation checks.

    Attributes:
        warnings: List of field warnings (out-of-range, suspicious values)
        errors: List of critical errors (consistency issues)
        is_valid: True if no errors (warnings are allowed)
    """

    warnings: list[ValidationWarning]
    errors: list[ValidationError]
    is_valid: bool


class LeaseExtractionValidator:
    """Validator for lease extraction results.

    Checks business rules and flags inconsistencies:
    - Range checks for financial values
    - Reasonableness checks for dates
    - Consistency checks between related fields

    Example:
        ```python
        validator = LeaseExtractionValidator()
        result = validator.validate(extraction_result)

        if not result.is_valid:
            # Critical errors - cannot save
            for error in result.errors:
                print(f"ERROR: {error.field} - {error.message}")
        elif result.warnings:
            # Warnings - flag for review
            for warning in result.warnings:
                print(f"WARNING: {warning.field} - {warning.message}")
        ```
    """

    # Business rule limits
    MIN_BASE_YEAR = 1990
    MAX_CAP_RATE = Decimal("0.25")  # 25% annual cap
    MAX_ADMIN_FEE = Decimal("0.20")  # 20% admin fee
    MIN_PRO_RATA = Decimal("0")  # 0%
    MAX_PRO_RATA = Decimal("1")  # 100%

    def validate(self, extraction: LeaseExtractionResult) -> ValidationResult:
        """Validate extraction result against business rules.

        Args:
            extraction: Parsed LeaseExtractionResult from Claude

        Returns:
            ValidationResult with warnings, errors, and validity flag

        Example:
            ```python
            result = validator.validate(extraction_result)
            if result.warnings:
                print(f"Found {len(result.warnings)} warnings")
                for w in result.warnings:
                    print(f"  - {w.field}: {w.message}")
            ```
        """
        warnings: list[ValidationWarning] = []
        errors: list[ValidationError] = []

        # Validate pro-rata share
        # (already checked by Pydantic, but warn if exactly 0 or 1)
        if extraction.pro_rata_share == Decimal("0"):
            warnings.append(
                ValidationWarning(
                    field="pro_rata_share",
                    message="Pro-rata share is 0% - tenant pays no CAM?",
                    value=extraction.pro_rata_share,
                    severity="warning",
                )
            )
        elif extraction.pro_rata_share == Decimal("1"):
            warnings.append(
                ValidationWarning(
                    field="pro_rata_share",
                    message="Pro-rata share is 100% - single tenant building?",
                    value=extraction.pro_rata_share,
                    severity="info",
                )
            )

        # Validate base year is reasonable (1990 to current year)
        if extraction.base_year is not None:
            current_year = datetime.now().year
            if extraction.base_year > current_year:
                warnings.append(
                    ValidationWarning(
                        field="base_year",
                        message=f"Base year {extraction.base_year} is in the future",
                        value=extraction.base_year,
                        severity="warning",
                    )
                )
            elif extraction.base_year < self.MIN_BASE_YEAR:
                warnings.append(
                    ValidationWarning(
                        field="base_year",
                        message=(
                            f"Base year {extraction.base_year} is before "
                            f"{self.MIN_BASE_YEAR}"
                        ),
                        value=extraction.base_year,
                        severity="warning",
                    )
                )

        # Validate cap rate is reasonable (0-25%)
        if extraction.cap_rate is not None:
            if extraction.cap_rate > self.MAX_CAP_RATE:
                warnings.append(
                    ValidationWarning(
                        field="cap_rate",
                        message=(
                            f"Cap rate {extraction.cap_rate:.1%} exceeds typical "
                            f"maximum of {self.MAX_CAP_RATE:.0%}"
                        ),
                        value=extraction.cap_rate,
                        severity="warning",
                    )
                )

        # Validate admin fee is reasonable (0-20%)
        if extraction.admin_fee_percentage > self.MAX_ADMIN_FEE:
            warnings.append(
                ValidationWarning(
                    field="admin_fee_percentage",
                    message=(
                        f"Admin fee {extraction.admin_fee_percentage:.1%} "
                        f"exceeds typical maximum of {self.MAX_ADMIN_FEE:.0%}"
                    ),
                    value=extraction.admin_fee_percentage,
                    severity="warning",
                )
            )

        # Consistency check: cap_type and cap_rate
        # Note: Pydantic validator already checks this,
        # but we add a friendlier error message
        if extraction.cap_type != CapType.NONE and extraction.cap_rate is None:
            errors.append(
                ValidationError(
                    field="cap_rate",
                    message=(
                        f"Cap rate is required when cap type is "
                        f"'{extraction.cap_type.value}'"
                    ),
                    value=None,
                )
            )

        # FIX EXT-6: Symmetric validation - cap_rate without cap_type is also an error
        # Previously this was only a warning, but orphaned cap_rates are invalid data
        # since you can't apply a cap without knowing the cap type
        if extraction.cap_rate is not None and extraction.cap_type == CapType.NONE:
            errors.append(
                ValidationError(
                    field="cap_type",
                    message=(
                        f"Cap type is required when cap rate is specified "
                        f"({extraction.cap_rate:.1%}). "
                        f"Choose cumulative, non_cumulative, or cumulative_compounding."
                    ),
                    value=extraction.cap_type.value,
                )
            )

        return ValidationResult(
            warnings=warnings,
            errors=errors,
            is_valid=len(errors) == 0,
        )


def validate_extraction(
    extraction: LeaseExtractionResult,
) -> ValidationResult:
    """Convenience function to validate an extraction result.

    Args:
        extraction: LeaseExtractionResult to validate

    Returns:
        ValidationResult with warnings and errors

    Example:
        ```python
        from app.services.extraction import validate_extraction

        result = await orchestrator.extract_lease_profile(doc_id)
        validation = validate_extraction(result.extraction_result)

        if not validation.is_valid:
            print("Critical errors found:")
            for error in validation.errors:
                print(f"  - {error.field}: {error.message}")
        ```
    """
    validator = LeaseExtractionValidator()
    return validator.validate(extraction)
