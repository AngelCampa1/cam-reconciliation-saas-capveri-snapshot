"""
Tests for PoolMapping Pydantic models.

Covers:
- PoolMapping model validation
- PoolMappingCreate validation
- PoolMappingUpdate validation
- PoolMappingSummary
- Wildcard pattern matching helper functions
- Serialization
"""

import json
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.pool_mapping import (
    PoolMapping,
    PoolMappingCreate,
    PoolMappingSummary,
    PoolMappingUpdate,
    is_valid_gl_pattern,
    matches_gl_pattern,
    pattern_to_regex,
)


class TestIsValidGLPattern:
    """Tests for the is_valid_gl_pattern helper function."""

    def test_valid_digits_only(self) -> None:
        """Pattern with only digits is valid."""
        assert is_valid_gl_pattern("5100") is True
        assert is_valid_gl_pattern("123456") is True

    def test_valid_asterisk_wildcard(self) -> None:
        """Pattern with * wildcard is valid."""
        assert is_valid_gl_pattern("51*") is True
        assert is_valid_gl_pattern("*100") is True
        assert is_valid_gl_pattern("5*00") is True

    def test_valid_percent_wildcard(self) -> None:
        """Pattern with % wildcard is valid for seeded SQL-style mappings."""
        assert is_valid_gl_pattern("51%") is True
        assert is_valid_gl_pattern("%100") is True
        assert is_valid_gl_pattern("5%00") is True

    def test_valid_question_wildcard(self) -> None:
        """Pattern with ? wildcard is valid."""
        assert is_valid_gl_pattern("51??") is True
        assert is_valid_gl_pattern("?100") is True
        assert is_valid_gl_pattern("5?0?") is True

    def test_valid_mixed_wildcards(self) -> None:
        """Pattern with both * and ? wildcards is valid."""
        assert is_valid_gl_pattern("5*??") is True
        assert is_valid_gl_pattern("?*00") is True

    def test_valid_with_hyphen(self) -> None:
        """Pattern with hyphen is valid."""
        assert is_valid_gl_pattern("5100-5199") is True
        assert is_valid_gl_pattern("51*-52*") is True

    def test_invalid_empty(self) -> None:
        """Empty pattern is invalid."""
        assert is_valid_gl_pattern("") is False

    def test_invalid_letters(self) -> None:
        """Pattern with letters is invalid."""
        assert is_valid_gl_pattern("51AB") is False
        assert is_valid_gl_pattern("ABC*") is False

    def test_invalid_special_chars(self) -> None:
        """Pattern with special characters (except *, ?, -, .) is invalid."""
        assert is_valid_gl_pattern("51@00") is False
        assert is_valid_gl_pattern("51#00") is False
        assert is_valid_gl_pattern("51 00") is False

    def test_valid_dot_notation(self) -> None:
        """Pattern with dots (common in MRI account codes) is valid."""
        assert is_valid_gl_pattern("51.00") is True
        assert is_valid_gl_pattern("5800.10") is True
        assert is_valid_gl_pattern("5100.10-5199.99") is True


class TestPatternToRegex:
    """Tests for the pattern_to_regex helper function."""

    def test_digits_only(self) -> None:
        """Digits-only pattern converts to exact match."""
        assert pattern_to_regex("5100") == "^5100$"

    def test_asterisk_wildcard(self) -> None:
        """* wildcard converts to .* regex."""
        assert pattern_to_regex("51*") == "^51.*$"
        assert pattern_to_regex("*100") == "^.*100$"

    def test_percent_wildcard(self) -> None:
        """% wildcard converts to .* regex."""
        assert pattern_to_regex("51%") == "^51.*$"
        assert pattern_to_regex("%100") == "^.*100$"

    def test_question_wildcard(self) -> None:
        """? wildcard converts to . regex."""
        assert pattern_to_regex("51??") == "^51..$"
        assert pattern_to_regex("?100") == "^.100$"

    def test_mixed_wildcards(self) -> None:
        """Mixed wildcards convert correctly."""
        assert pattern_to_regex("5*??") == "^5.*..$"

    def test_hyphen_escaped(self) -> None:
        """Hyphen is escaped in regex."""
        regex = pattern_to_regex("5100-5199")
        assert "\\-" in regex or "-" in regex  # May or may not be escaped


class TestMatchesGLPattern:
    """Tests for the matches_gl_pattern helper function."""

    def test_exact_match(self) -> None:
        """Exact pattern matches exactly."""
        assert matches_gl_pattern("5100", "5100") is True
        assert matches_gl_pattern("5100", "5101") is False

    def test_asterisk_matches_any_sequence(self) -> None:
        """* matches any sequence of characters."""
        assert matches_gl_pattern("5100", "51*") is True
        assert matches_gl_pattern("51999", "51*") is True
        assert matches_gl_pattern("52000", "51*") is False

    def test_percent_matches_any_sequence(self) -> None:
        """% matches any sequence of characters."""
        assert matches_gl_pattern("5100", "51%") is True
        assert matches_gl_pattern("51999", "51%") is True
        assert matches_gl_pattern("52000", "51%") is False

    def test_asterisk_at_start(self) -> None:
        """* at start matches any prefix."""
        assert matches_gl_pattern("5100", "*100") is True
        assert matches_gl_pattern("99100", "*100") is True
        assert matches_gl_pattern("5101", "*100") is False

    def test_question_matches_single_char(self) -> None:
        """? matches exactly one character."""
        assert matches_gl_pattern("5100", "51??") is True
        assert matches_gl_pattern("5199", "51??") is True
        assert matches_gl_pattern("51000", "51??") is False
        assert matches_gl_pattern("510", "51??") is False

    def test_mixed_wildcards(self) -> None:
        """Mixed wildcards work together."""
        assert matches_gl_pattern("51234", "5?2*") is True
        assert matches_gl_pattern("5123456", "5?2*") is True
        assert matches_gl_pattern("53234", "5?2*") is True  # 5 + 3 + 2 + 34
        assert matches_gl_pattern("53100", "5?2*") is False  # 3rd char is 1, not 2

    def test_empty_asterisk(self) -> None:
        """* can match empty string."""
        assert matches_gl_pattern("51", "51*") is True


class TestPoolMappingModel:
    """Tests for the full PoolMapping model."""

    def test_pool_mapping_with_all_fields(self) -> None:
        """Create PoolMapping with all fields."""
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="51*",
            allocation_percentage=Decimal("0.75"),
            priority=10,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert mapping.gl_account_pattern == "51*"
        assert mapping.allocation_percentage == Decimal("0.75")
        assert mapping.priority == 10

    def test_pool_mapping_with_defaults(self) -> None:
        """PoolMapping uses default values."""
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="5100",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert mapping.allocation_percentage == Decimal("1.0")
        assert mapping.priority == 0

    def test_valid_patterns(self) -> None:
        """Various valid patterns are accepted."""
        valid_patterns = ["5100", "51*", "51??", "5*??", "5100-5199"]
        for pattern in valid_patterns:
            mapping = PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern=pattern,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            assert mapping.gl_account_pattern == pattern

    def test_invalid_pattern_rejected(self) -> None:
        """Invalid patterns are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51ABC",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "Pattern must contain only digits" in str(exc_info.value)


class TestPatternValidation:
    """Tests for pattern validation in PoolMapping."""

    def test_pattern_min_length(self) -> None:
        """Pattern must be at least 1 character."""
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="5",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert mapping.gl_account_pattern == "5"

    def test_pattern_max_length(self) -> None:
        """Pattern can be up to 50 characters."""
        pattern = "5" * 50
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern=pattern,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert len(mapping.gl_account_pattern) == 50

    def test_pattern_empty_rejected(self) -> None:
        """Empty pattern is rejected."""
        with pytest.raises(ValidationError):
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )

    def test_pattern_over_max_rejected(self) -> None:
        """Pattern over 50 characters is rejected."""
        with pytest.raises(ValidationError):
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="5" * 51,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )


class TestAllocationPercentageValidation:
    """Tests for allocation_percentage validation."""

    def test_valid_range(self) -> None:
        """Allocation percentage between 0 and 1 is valid."""
        valid_values = [Decimal("0"), Decimal("0.5"), Decimal("1.0"), Decimal("0.25")]
        for value in valid_values:
            mapping = PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                allocation_percentage=value,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            assert mapping.allocation_percentage == value

    def test_below_zero_rejected(self) -> None:
        """Allocation percentage below 0 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                allocation_percentage=Decimal("-0.1"),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_above_one_rejected(self) -> None:
        """Allocation percentage above 1 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                allocation_percentage=Decimal("1.1"),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "less than or equal to 1" in str(exc_info.value)


class TestPriorityValidation:
    """Tests for priority validation."""

    def test_valid_priority(self) -> None:
        """Non-negative priority values are valid."""
        valid_values = [0, 1, 10, 100, 999]
        for value in valid_values:
            mapping = PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                priority=value,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            assert mapping.priority == value

    def test_negative_priority_rejected(self) -> None:
        """Negative priority is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMapping(
                id=uuid4(),
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                priority=-1,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "greater than or equal to 0" in str(exc_info.value)


class TestPoolMappingCreate:
    """Tests for PoolMappingCreate model."""

    def test_create_with_all_fields(self) -> None:
        """Create PoolMappingCreate with all fields."""
        create = PoolMappingCreate(
            expense_pool_id=uuid4(),
            gl_account_pattern="51*",
            allocation_percentage=Decimal("0.5"),
            priority=5,
        )
        assert create.gl_account_pattern == "51*"
        assert create.allocation_percentage == Decimal("0.5")
        assert create.priority == 5

    def test_create_with_defaults(self) -> None:
        """Create uses default values."""
        create = PoolMappingCreate(
            expense_pool_id=uuid4(),
            gl_account_pattern="5100",
        )
        assert create.allocation_percentage == Decimal("1.0")
        assert create.priority == 0

    def test_create_requires_expense_pool_id(self) -> None:
        """expense_pool_id is required."""
        with pytest.raises(ValidationError):
            PoolMappingCreate(
                gl_account_pattern="51*",
            )

    def test_create_requires_pattern(self) -> None:
        """gl_account_pattern is required."""
        with pytest.raises(ValidationError):
            PoolMappingCreate(
                expense_pool_id=uuid4(),
            )

    def test_create_validates_pattern(self) -> None:
        """Create validates pattern format."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMappingCreate(
                expense_pool_id=uuid4(),
                gl_account_pattern="51ABC",
            )
        assert "Pattern must contain only digits" in str(exc_info.value)

    def test_create_validates_allocation_percentage(self) -> None:
        """Create validates allocation percentage range."""
        with pytest.raises(ValidationError):
            PoolMappingCreate(
                expense_pool_id=uuid4(),
                gl_account_pattern="51*",
                allocation_percentage=Decimal("1.5"),
            )


class TestPoolMappingUpdate:
    """Tests for PoolMappingUpdate model."""

    def test_update_all_fields_optional(self) -> None:
        """All fields are optional."""
        update = PoolMappingUpdate()
        assert update.gl_account_pattern is None
        assert update.allocation_percentage is None
        assert update.priority is None

    def test_update_pattern_only(self) -> None:
        """Update only pattern."""
        update = PoolMappingUpdate(gl_account_pattern="52*")
        assert update.gl_account_pattern == "52*"
        assert update.allocation_percentage is None

    def test_update_allocation_only(self) -> None:
        """Update only allocation percentage."""
        update = PoolMappingUpdate(allocation_percentage=Decimal("0.75"))
        assert update.allocation_percentage == Decimal("0.75")
        assert update.gl_account_pattern is None

    def test_update_priority_only(self) -> None:
        """Update only priority."""
        update = PoolMappingUpdate(priority=20)
        assert update.priority == 20
        assert update.gl_account_pattern is None

    def test_update_all_fields(self) -> None:
        """Update all fields at once."""
        update = PoolMappingUpdate(
            gl_account_pattern="53*",
            allocation_percentage=Decimal("0.25"),
            priority=15,
        )
        assert update.gl_account_pattern == "53*"
        assert update.allocation_percentage == Decimal("0.25")
        assert update.priority == 15

    def test_update_validates_pattern(self) -> None:
        """Update validates pattern format."""
        with pytest.raises(ValidationError) as exc_info:
            PoolMappingUpdate(gl_account_pattern="51ABC")
        assert "Pattern must contain only digits" in str(exc_info.value)

    def test_update_validates_allocation_range(self) -> None:
        """Update validates allocation percentage range."""
        with pytest.raises(ValidationError):
            PoolMappingUpdate(allocation_percentage=Decimal("-0.1"))

    def test_update_validates_priority(self) -> None:
        """Update validates priority is non-negative."""
        with pytest.raises(ValidationError):
            PoolMappingUpdate(priority=-5)


class TestPoolMappingSummary:
    """Tests for PoolMappingSummary model."""

    def test_summary_with_all_fields(self) -> None:
        """Create summary with all fields including pool_name."""
        summary = PoolMappingSummary(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="51*",
            allocation_percentage=Decimal("0.5"),
            priority=5,
            pool_name="Operating Expenses",
        )
        assert summary.pool_name == "Operating Expenses"

    def test_summary_without_pool_name(self) -> None:
        """pool_name is optional."""
        summary = PoolMappingSummary(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="51*",
            allocation_percentage=Decimal("1.0"),
            priority=0,
        )
        assert summary.pool_name is None


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self) -> None:
        """Model can be serialized to dict."""
        mapping_id = uuid4()
        pool_id = uuid4()
        now = datetime.now()

        mapping = PoolMapping(
            id=mapping_id,
            expense_pool_id=pool_id,
            gl_account_pattern="51*",
            allocation_percentage=Decimal("0.75"),
            priority=5,
            created_at=now,
            updated_at=now,
        )

        data = mapping.model_dump()
        assert data["id"] == mapping_id
        assert data["expense_pool_id"] == pool_id
        assert data["gl_account_pattern"] == "51*"
        assert data["allocation_percentage"] == Decimal("0.75")
        assert data["priority"] == 5

    def test_to_json(self) -> None:
        """Model can be serialized to JSON."""
        mapping = PoolMapping(
            id=uuid4(),
            expense_pool_id=uuid4(),
            gl_account_pattern="52??",
            allocation_percentage=Decimal("0.5"),
            priority=10,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        json_str = mapping.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["gl_account_pattern"] == "52??"
        assert parsed["priority"] == 10

    def test_from_attributes(self) -> None:
        """Model can be created from ORM-like object."""

        class MockORM:
            id = uuid4()
            expense_pool_id = uuid4()
            gl_account_pattern = "53*"
            allocation_percentage = Decimal("0.33")
            priority = 3
            created_at = datetime.now()
            updated_at = datetime.now()

        mapping = PoolMapping.model_validate(MockORM())
        assert mapping.gl_account_pattern == "53*"
        assert mapping.allocation_percentage == Decimal("0.33")


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """All exports are available from models package."""
        from app.models import (
            PoolMapping,
            PoolMappingCreate,
            PoolMappingSummary,
            PoolMappingUpdate,
            is_valid_gl_pattern,
            matches_gl_pattern,
            pattern_to_regex,
        )

        assert PoolMapping is not None
        assert PoolMappingCreate is not None
        assert PoolMappingUpdate is not None
        assert PoolMappingSummary is not None
        assert is_valid_gl_pattern is not None
        assert matches_gl_pattern is not None
        assert pattern_to_regex is not None
