"""Tests for ExpensePool Pydantic models.

Tests all ExpensePool models: ExpensePool, ExpensePoolCreate,
ExpensePoolUpdate, and ExpensePoolSummary.
"""

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.expense_pool import (
    ExpensePool,
    ExpensePoolCreate,
    ExpensePoolSummary,
    ExpensePoolUpdate,
    ExpensePoolWithChildren,
)


class TestExpensePoolModel:
    """Tests for the full ExpensePool model."""

    def test_expense_pool_with_all_fields(self) -> None:
        """Should accept expense pool with all fields."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Operating Expenses",
            pool_type="operating",
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.95"),
            description="General operating expenses for common areas",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.name == "Operating Expenses"
        assert pool.pool_type == "operating"
        assert pool.is_gross_up_applicable is True
        assert pool.gross_up_target == Decimal("0.95")

    def test_expense_pool_with_minimal_fields(self) -> None:
        """Should accept expense pool with minimal required fields."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Taxes",
            pool_type="tax",
            is_gross_up_applicable=False,
            description=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.name == "Taxes"
        assert pool.pool_type == "tax"
        assert pool.is_gross_up_applicable is False
        assert pool.gross_up_target is None
        assert pool.description is None

    def test_expense_pool_defaults(self) -> None:
        """Should apply default values correctly."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Insurance",
            pool_type="insurance",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.is_gross_up_applicable is True  # default


class TestPoolTypeValidation:
    """Tests for pool_type field validation."""

    def test_all_valid_pool_types(self) -> None:
        """Should accept all valid pool types."""
        pool_types = ["operating", "tax", "insurance", "capital", "other"]
        for pool_type in pool_types:
            pool = ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name=f"{pool_type.title()} Pool",
                pool_type=pool_type,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            assert pool.pool_type == pool_type

    def test_pool_type_required(self) -> None:
        """Should require pool_type field."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="Missing Type Pool",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "pool_type" in str(exc_info.value)


class TestNameValidation:
    """Tests for name field validation."""

    def test_name_min_length(self) -> None:
        """Should accept name with minimum length (1)."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="A",
            pool_type="operating",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.name == "A"

    def test_name_max_length(self) -> None:
        """Should accept name at maximum length (100)."""
        name = "N" * 100
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name=name,
            pool_type="operating",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert len(pool.name) == 100

    def test_name_empty_rejected(self) -> None:
        """Should reject empty name."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="",
                pool_type="operating",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "name" in str(exc_info.value)

    def test_name_over_max_rejected(self) -> None:
        """Should reject name over 100 characters."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="N" * 101,
                pool_type="operating",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "name" in str(exc_info.value)


class TestGrossUpValidation:
    """Tests for gross-up related fields."""

    def test_gross_up_target_valid_range(self) -> None:
        """Should accept gross_up_target between 0 and 1."""
        test_cases = [
            Decimal("0"),
            Decimal("0.5"),
            Decimal("0.95"),
            Decimal("1"),
        ]
        for target in test_cases:
            pool = ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="Test Pool",
                pool_type="operating",
                is_gross_up_applicable=True,
                gross_up_target=target,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            assert pool.gross_up_target == target

    def test_gross_up_target_below_zero_rejected(self) -> None:
        """Should reject gross_up_target below 0."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="Test Pool",
                pool_type="operating",
                is_gross_up_applicable=True,
                gross_up_target=Decimal("-0.1"),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "gross_up_target" in str(exc_info.value)

    def test_gross_up_target_above_one_rejected(self) -> None:
        """Should reject gross_up_target above 1."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="Test Pool",
                pool_type="operating",
                is_gross_up_applicable=True,
                gross_up_target=Decimal("1.01"),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "gross_up_target" in str(exc_info.value)

    def test_gross_up_not_applicable_clears_target(self) -> None:
        """Should clear gross_up_target when gross-up not applicable."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Fixed Cost Pool",
            pool_type="tax",
            is_gross_up_applicable=False,
            gross_up_target=Decimal("0.95"),  # Should be cleared
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.gross_up_target is None

    def test_gross_up_applicable_allows_none_target(self) -> None:
        """Should allow None gross_up_target even when applicable."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Variable Cost Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            gross_up_target=None,  # Can inherit from property default
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.is_gross_up_applicable is True
        assert pool.gross_up_target is None


class TestDescriptionValidation:
    """Tests for description field validation."""

    def test_description_max_length(self) -> None:
        """Should accept description at max length (500)."""
        description = "D" * 500
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Test Pool",
            pool_type="operating",
            description=description,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert len(pool.description) == 500

    def test_description_over_max_rejected(self) -> None:
        """Should reject description over 500 characters."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePool(
                id=uuid4(),
                property_id=uuid4(),
                name="Test Pool",
                pool_type="operating",
                description="D" * 501,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
        assert "description" in str(exc_info.value)


class TestExpensePoolCreate:
    """Tests for ExpensePoolCreate DTO."""

    def test_create_with_all_fields(self) -> None:
        """Should accept create with all fields."""
        create = ExpensePoolCreate(
            property_id=uuid4(),
            name="Operating Expenses",
            pool_type="operating",
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.95"),
            description="Common area operating costs",
        )
        assert create.name == "Operating Expenses"
        assert create.pool_type == "operating"
        assert create.gross_up_target == Decimal("0.95")

    def test_create_with_minimal_fields(self) -> None:
        """Should accept create with minimal required fields."""
        create = ExpensePoolCreate(
            property_id=uuid4(),
            name="Taxes",
            pool_type="tax",
        )
        assert create.name == "Taxes"
        assert create.is_gross_up_applicable is True  # default
        assert create.gross_up_target is None
        assert create.description is None

    def test_create_requires_property_id(self) -> None:
        """Should require property_id field."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePoolCreate(
                name="Missing Property Pool",
                pool_type="operating",
            )
        assert "property_id" in str(exc_info.value)

    def test_create_requires_name(self) -> None:
        """Should require name field."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePoolCreate(
                property_id=uuid4(),
                pool_type="operating",
            )
        assert "name" in str(exc_info.value)

    def test_create_gross_up_target_rejected_when_not_applicable(self) -> None:
        """Should reject gross_up_target when is_gross_up_applicable is False."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePoolCreate(
                property_id=uuid4(),
                name="Fixed Pool",
                pool_type="tax",
                is_gross_up_applicable=False,
                gross_up_target=Decimal("0.95"),
            )
        assert "gross_up_target" in str(exc_info.value).lower()

    def test_create_validates_name_length(self) -> None:
        """Should validate name length constraints."""
        with pytest.raises(ValidationError):
            ExpensePoolCreate(
                property_id=uuid4(),
                name="",
                pool_type="operating",
            )

        with pytest.raises(ValidationError):
            ExpensePoolCreate(
                property_id=uuid4(),
                name="N" * 101,
                pool_type="operating",
            )


class TestExpensePoolUpdate:
    """Tests for ExpensePoolUpdate DTO."""

    def test_update_all_fields_optional(self) -> None:
        """Should accept update with no fields."""
        update = ExpensePoolUpdate()
        assert update.name is None
        assert update.pool_type is None
        assert update.is_gross_up_applicable is None
        assert update.gross_up_target is None
        assert update.description is None

    def test_update_name_only(self) -> None:
        """Should accept update with name only."""
        update = ExpensePoolUpdate(name="Updated Pool Name")
        assert update.name == "Updated Pool Name"
        assert update.pool_type is None

    def test_update_pool_type_only(self) -> None:
        """Should accept update with pool_type only."""
        update = ExpensePoolUpdate(pool_type="capital")
        assert update.pool_type == "capital"
        assert update.name is None

    def test_update_gross_up_settings(self) -> None:
        """Should accept update with gross-up settings."""
        update = ExpensePoolUpdate(
            is_gross_up_applicable=False,
            gross_up_target=None,
        )
        assert update.is_gross_up_applicable is False
        assert update.gross_up_target is None

    def test_update_description(self) -> None:
        """Should accept update with description."""
        update = ExpensePoolUpdate(description="Updated description text")
        assert update.description == "Updated description text"

    def test_update_all_fields(self) -> None:
        """Should accept update with all fields."""
        update = ExpensePoolUpdate(
            name="Fully Updated Pool",
            pool_type="insurance",
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.90"),
            description="New description",
        )
        assert update.name == "Fully Updated Pool"
        assert update.pool_type == "insurance"
        assert update.is_gross_up_applicable is True
        assert update.gross_up_target == Decimal("0.90")
        assert update.description == "New description"

    def test_update_validates_name_length(self) -> None:
        """Should validate name length constraints in update."""
        with pytest.raises(ValidationError):
            ExpensePoolUpdate(name="")

        with pytest.raises(ValidationError):
            ExpensePoolUpdate(name="N" * 101)

    def test_update_validates_gross_up_target_range(self) -> None:
        """Should validate gross_up_target range in update."""
        with pytest.raises(ValidationError):
            ExpensePoolUpdate(gross_up_target=Decimal("-0.1"))

        with pytest.raises(ValidationError):
            ExpensePoolUpdate(gross_up_target=Decimal("1.5"))


class TestExpensePoolSummary:
    """Tests for ExpensePoolSummary model."""

    def test_summary_with_all_fields(self) -> None:
        """Should accept summary with all fields."""
        summary = ExpensePoolSummary(
            id=uuid4(),
            property_id=uuid4(),
            name="Operating Expenses",
            pool_type="operating",
            is_gross_up_applicable=True,
            total_amount=Decimal("50000.00"),
            entry_count=150,
        )
        assert summary.name == "Operating Expenses"
        assert summary.total_amount == Decimal("50000.00")
        assert summary.entry_count == 150

    def test_summary_with_minimal_fields(self) -> None:
        """Should accept summary with minimal fields."""
        summary = ExpensePoolSummary(
            id=uuid4(),
            property_id=uuid4(),
            name="Empty Pool",
            pool_type="other",
            is_gross_up_applicable=False,
        )
        assert summary.total_amount is None
        assert summary.entry_count == 0  # default

    def test_summary_with_zero_entries(self) -> None:
        """Should accept summary with zero entries."""
        summary = ExpensePoolSummary(
            id=uuid4(),
            property_id=uuid4(),
            name="New Pool",
            pool_type="capital",
            is_gross_up_applicable=False,
            total_amount=Decimal("0"),
            entry_count=0,
        )
        assert summary.total_amount == Decimal("0")
        assert summary.entry_count == 0

    def test_summary_entry_count_non_negative(self) -> None:
        """Should reject negative entry_count."""
        with pytest.raises(ValidationError) as exc_info:
            ExpensePoolSummary(
                id=uuid4(),
                property_id=uuid4(),
                name="Invalid Count Pool",
                pool_type="operating",
                is_gross_up_applicable=True,
                entry_count=-1,
            )
        assert "entry_count" in str(exc_info.value)


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self) -> None:
        """Should serialize to dictionary."""
        pool_id = uuid4()
        property_id = uuid4()
        now = datetime.now()

        pool = ExpensePool(
            id=pool_id,
            property_id=property_id,
            name="Test Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.95"),
            description="Test description",
            created_at=now,
            updated_at=now,
        )

        data = pool.model_dump()
        assert data["id"] == pool_id
        assert data["property_id"] == property_id
        assert data["name"] == "Test Pool"
        assert data["pool_type"] == "operating"
        assert data["gross_up_target"] == Decimal("0.95")

    def test_to_json(self) -> None:
        """Should serialize to JSON string."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="JSON Test Pool",
            pool_type="tax",
            is_gross_up_applicable=False,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        json_str = pool.model_dump_json()
        assert "JSON Test Pool" in json_str
        assert "tax" in json_str

    def test_from_attributes(self) -> None:
        """Should create from ORM-style object."""

        class MockORM:
            id = uuid4()
            property_id = uuid4()
            name = "ORM Pool"
            pool_type = "insurance"
            is_gross_up_applicable = True
            gross_up_target = Decimal("0.90")
            description = "From ORM"
            created_at = datetime.now()
            updated_at = datetime.now()

        pool = ExpensePool.model_validate(MockORM())
        assert pool.name == "ORM Pool"
        assert pool.pool_type == "insurance"
        assert pool.gross_up_target == Decimal("0.90")


class TestPoolHierarchy:
    """Tests for pool hierarchy functionality."""

    def test_pool_with_parent(self) -> None:
        """Should accept pool with parent_pool_id."""
        parent_id = uuid4()
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Child Pool",
            pool_type="operating",
            parent_pool_id=parent_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.parent_pool_id == parent_id

    def test_pool_without_parent(self) -> None:
        """Should accept pool without parent_pool_id (root pool)."""
        pool = ExpensePool(
            id=uuid4(),
            property_id=uuid4(),
            name="Root Pool",
            pool_type="operating",
            parent_pool_id=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        assert pool.parent_pool_id is None

    def test_create_with_parent_pool_id(self) -> None:
        """Should accept create with parent_pool_id."""
        parent_id = uuid4()
        create = ExpensePoolCreate(
            property_id=uuid4(),
            name="Child Pool",
            pool_type="operating",
            parent_pool_id=parent_id,
        )
        assert create.parent_pool_id == parent_id

    def test_update_parent_pool_id(self) -> None:
        """Should accept update with parent_pool_id."""
        parent_id = uuid4()
        update = ExpensePoolUpdate(parent_pool_id=parent_id)
        assert update.parent_pool_id == parent_id


class TestExpensePoolWithChildren:
    """Tests for ExpensePoolWithChildren hierarchical model."""

    def test_pool_with_no_children(self) -> None:
        """Should create leaf pool with empty children list."""
        pool = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Leaf Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )
        assert pool.is_parent is False
        assert pool.children == []

    def test_pool_with_children(self) -> None:
        """Should create parent pool with children."""
        child1 = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Child 1",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )
        child2 = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Child 2",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=uuid4(),
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )
        parent = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Parent Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[child1, child2],
        )
        assert parent.is_parent is True
        assert len(parent.children) == 2
        assert parent.children[0].name == "Child 1"
        assert parent.children[1].name == "Child 2"

    def test_is_child_property(self) -> None:
        """Should identify child pools correctly."""
        parent_id = uuid4()
        child = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Child Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=parent_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )
        root = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Root Pool",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )
        assert child.is_child is True
        assert root.is_child is False

    def test_total_amount_with_rollup(self) -> None:
        """Should include total_amount for rollup calculations."""
        pool = ExpensePoolWithChildren(
            id=uuid4(),
            property_id=uuid4(),
            name="Pool with Amount",
            pool_type="operating",
            is_gross_up_applicable=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
            total_amount=Decimal("12500.50"),
        )
        assert pool.total_amount == Decimal("12500.50")

    def test_nested_hierarchy(self) -> None:
        """Should support 2-level hierarchy (parent → child)."""
        grandchild_id = uuid4()
        child_id = uuid4()
        parent_id = uuid4()

        # Leaf nodes
        grandchild = ExpensePoolWithChildren(
            id=grandchild_id,
            property_id=uuid4(),
            name="Grandchild",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=child_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[],
        )

        # Child with grandchild
        child = ExpensePoolWithChildren(
            id=child_id,
            property_id=uuid4(),
            name="Child",
            pool_type="operating",
            is_gross_up_applicable=True,
            parent_pool_id=parent_id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[grandchild],
        )

        # Parent with child
        parent = ExpensePoolWithChildren(
            id=parent_id,
            property_id=uuid4(),
            name="Parent",
            pool_type="operating",
            is_gross_up_applicable=True,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            children=[child],
        )

        assert parent.is_parent is True
        assert parent.children[0].is_parent is True
        assert parent.children[0].children[0].is_parent is False


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """Should import ExpensePool from app.models."""
        from app.models import (
            ExpensePool,
            ExpensePoolCreate,
            ExpensePoolSummary,
            ExpensePoolUpdate,
            ExpensePoolWithChildren,
        )

        assert ExpensePool is not None
        assert ExpensePoolCreate is not None
        assert ExpensePoolUpdate is not None
        assert ExpensePoolSummary is not None
        assert ExpensePoolWithChildren is not None
