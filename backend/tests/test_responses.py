"""Tests for API response wrapper models."""

from decimal import Decimal

import pytest
from pydantic import BaseModel, ValidationError

from app.models.responses import (
    DataResponse,
    ErrorCodes,
    ErrorResponse,
    PaginatedResponse,
    SuccessResponse,
    create_error_response,
    create_paginated_response,
    create_success_response,
)


# Sample model for testing generic types
class SampleItem(BaseModel):
    """Sample item for testing paginated responses."""

    id: str
    name: str
    value: Decimal


class TestPaginatedResponse:
    """Tests for PaginatedResponse model."""

    def test_valid_paginated_response(self) -> None:
        """Test creating a valid paginated response."""
        items = [
            SampleItem(id="1", name="Item 1", value=Decimal("100.00")),
            SampleItem(id="2", name="Item 2", value=Decimal("200.00")),
        ]
        response = PaginatedResponse[SampleItem](
            items=items,
            total=50,
            page=1,
            page_size=10,
        )
        assert len(response.items) == 2
        assert response.total == 50
        assert response.page == 1
        assert response.page_size == 10

    def test_total_pages_computed_field(self) -> None:
        """Test total_pages is computed correctly."""
        response = PaginatedResponse[str](
            items=["a", "b"],
            total=50,
            page=1,
            page_size=10,
        )
        assert response.total_pages == 5

    def test_total_pages_with_remainder(self) -> None:
        """Test total_pages rounds up with remainder."""
        response = PaginatedResponse[str](
            items=["a"],
            total=51,
            page=1,
            page_size=10,
        )
        assert response.total_pages == 6

    def test_total_pages_zero_total(self) -> None:
        """Test total_pages is 0 when no items."""
        response = PaginatedResponse[str](
            items=[],
            total=0,
            page=1,
            page_size=10,
        )
        assert response.total_pages == 0

    def test_total_pages_exact_fit(self) -> None:
        """Test total_pages when items fit exactly."""
        response = PaginatedResponse[str](
            items=["a", "b"],
            total=100,
            page=1,
            page_size=10,
        )
        assert response.total_pages == 10

    def test_has_next_true(self) -> None:
        """Test has_next is True when more pages exist."""
        response = PaginatedResponse[str](
            items=["a"],
            total=50,
            page=1,
            page_size=10,
        )
        assert response.has_next is True

    def test_has_next_false_on_last_page(self) -> None:
        """Test has_next is False on last page."""
        response = PaginatedResponse[str](
            items=["a"],
            total=50,
            page=5,
            page_size=10,
        )
        assert response.has_next is False

    def test_has_next_false_single_page(self) -> None:
        """Test has_next is False when only one page."""
        response = PaginatedResponse[str](
            items=["a", "b"],
            total=5,
            page=1,
            page_size=10,
        )
        assert response.has_next is False

    def test_has_previous_false_on_first_page(self) -> None:
        """Test has_previous is False on first page."""
        response = PaginatedResponse[str](
            items=["a"],
            total=50,
            page=1,
            page_size=10,
        )
        assert response.has_previous is False

    def test_has_previous_true(self) -> None:
        """Test has_previous is True when not on first page."""
        response = PaginatedResponse[str](
            items=["a"],
            total=50,
            page=2,
            page_size=10,
        )
        assert response.has_previous is True

    def test_has_previous_on_last_page(self) -> None:
        """Test has_previous is True on last page."""
        response = PaginatedResponse[str](
            items=["a"],
            total=50,
            page=5,
            page_size=10,
        )
        assert response.has_previous is True

    def test_empty_items_list(self) -> None:
        """Test paginated response with empty items."""
        response = PaginatedResponse[str](
            items=[],
            total=0,
            page=1,
            page_size=10,
        )
        assert len(response.items) == 0
        assert response.total == 0
        assert response.total_pages == 0
        assert response.has_next is False
        assert response.has_previous is False

    def test_page_validation_minimum(self) -> None:
        """Test page must be at least 1."""
        with pytest.raises(ValidationError) as exc_info:
            PaginatedResponse[str](
                items=[],
                total=0,
                page=0,
                page_size=10,
            )
        assert "page" in str(exc_info.value)

    def test_page_size_validation_minimum(self) -> None:
        """Test page_size must be at least 1."""
        with pytest.raises(ValidationError) as exc_info:
            PaginatedResponse[str](
                items=[],
                total=0,
                page=1,
                page_size=0,
            )
        assert "page_size" in str(exc_info.value)

    def test_page_size_validation_maximum(self) -> None:
        """Test page_size must be at most 100."""
        with pytest.raises(ValidationError) as exc_info:
            PaginatedResponse[str](
                items=[],
                total=0,
                page=1,
                page_size=101,
            )
        assert "page_size" in str(exc_info.value)

    def test_total_validation_non_negative(self) -> None:
        """Test total must be non-negative."""
        with pytest.raises(ValidationError) as exc_info:
            PaginatedResponse[str](
                items=[],
                total=-1,
                page=1,
                page_size=10,
            )
        assert "total" in str(exc_info.value)

    def test_serialization_includes_computed_fields(self) -> None:
        """Test model_dump includes computed fields."""
        response = PaginatedResponse[str](
            items=["a", "b"],
            total=50,
            page=2,
            page_size=10,
        )
        data = response.model_dump()
        assert "total_pages" in data
        assert "has_next" in data
        assert "has_previous" in data
        assert data["total_pages"] == 5
        assert data["has_next"] is True
        assert data["has_previous"] is True

    def test_json_serialization(self) -> None:
        """Test JSON serialization includes computed fields."""
        response = PaginatedResponse[str](
            items=["a", "b"],
            total=50,
            page=1,
            page_size=10,
        )
        json_data = response.model_dump_json()
        assert '"total_pages":5' in json_data
        assert '"has_next":true' in json_data
        assert '"has_previous":false' in json_data

    def test_with_complex_items(self) -> None:
        """Test with nested Pydantic models."""
        items = [
            SampleItem(id="abc-123", name="Complex Item", value=Decimal("99999.99")),
        ]
        response = PaginatedResponse[SampleItem](
            items=items,
            total=1,
            page=1,
            page_size=10,
        )
        data = response.model_dump()
        assert data["items"][0]["id"] == "abc-123"
        assert data["items"][0]["value"] == Decimal("99999.99")


class TestErrorResponse:
    """Tests for ErrorResponse model."""

    def test_valid_error_response(self) -> None:
        """Test creating a valid error response."""
        response = ErrorResponse(
            error="VALIDATION_ERROR",
            message="Invalid input data",
        )
        assert response.error == "VALIDATION_ERROR"
        assert response.message == "Invalid input data"
        assert response.details is None

    def test_error_response_with_details(self) -> None:
        """Test error response with field validation details."""
        details = {
            "email": ["Invalid email format"],
            "name": ["Required field", "Must be at least 2 characters"],
        }
        response = ErrorResponse(
            error="VALIDATION_ERROR",
            message="Multiple validation errors",
            details=details,
        )
        assert response.details == details
        assert "email" in response.details
        assert len(response.details["name"]) == 2

    def test_error_response_nested_details(self) -> None:
        """Test error response with nested detail structure."""
        details = {
            "tenant": {
                "contact": {"email": "Invalid format"},
            },
        }
        response = ErrorResponse(
            error="VALIDATION_ERROR",
            message="Nested validation error",
            details=details,
        )
        assert response.details["tenant"]["contact"]["email"] == "Invalid format"

    def test_error_code_required(self) -> None:
        """Test error code is required."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(message="Error occurred")  # type: ignore
        assert "error" in str(exc_info.value)

    def test_error_code_not_empty(self) -> None:
        """Test error code cannot be empty."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(error="", message="Error occurred")
        assert "error" in str(exc_info.value)

    def test_message_required(self) -> None:
        """Test message is required."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(error="ERROR_CODE")  # type: ignore
        assert "message" in str(exc_info.value)

    def test_message_not_empty(self) -> None:
        """Test message cannot be empty."""
        with pytest.raises(ValidationError) as exc_info:
            ErrorResponse(error="ERROR_CODE", message="")
        assert "message" in str(exc_info.value)

    def test_serialization(self) -> None:
        """Test error response serialization."""
        response = ErrorResponse(
            error="NOT_FOUND",
            message="Resource not found",
            details={"id": "abc-123"},
        )
        data = response.model_dump()
        assert data["error"] == "NOT_FOUND"
        assert data["message"] == "Resource not found"
        assert data["details"]["id"] == "abc-123"

    def test_json_serialization_null_details(self) -> None:
        """Test JSON serialization with null details."""
        response = ErrorResponse(
            error="ERROR",
            message="Something went wrong",
        )
        json_data = response.model_dump_json()
        assert '"details":null' in json_data


class TestSuccessResponse:
    """Tests for SuccessResponse model."""

    def test_empty_success_response(self) -> None:
        """Test creating a success response with no message or data."""
        response = SuccessResponse()
        assert response.message is None
        assert response.data is None

    def test_success_response_with_message(self) -> None:
        """Test success response with message only."""
        response = SuccessResponse(message="Operation completed successfully")
        assert response.message == "Operation completed successfully"
        assert response.data is None

    def test_success_response_with_data(self) -> None:
        """Test success response with data only."""
        response = SuccessResponse(data={"id": "abc-123", "status": "created"})
        assert response.message is None
        assert response.data["id"] == "abc-123"

    def test_success_response_with_both(self) -> None:
        """Test success response with message and data."""
        response = SuccessResponse(
            message="Record created",
            data={"id": "abc-123"},
        )
        assert response.message == "Record created"
        assert response.data["id"] == "abc-123"

    def test_success_response_complex_data(self) -> None:
        """Test success response with complex nested data."""
        data = {
            "user": {"id": "123", "name": "John"},
            "permissions": ["read", "write"],
            "metadata": {"created_at": "2024-01-01"},
        }
        response = SuccessResponse(data=data)
        assert response.data["user"]["name"] == "John"
        assert len(response.data["permissions"]) == 2

    def test_serialization(self) -> None:
        """Test success response serialization."""
        response = SuccessResponse(
            message="Done",
            data=[1, 2, 3],
        )
        data = response.model_dump()
        assert data["message"] == "Done"
        assert data["data"] == [1, 2, 3]


class TestDataResponse:
    """Tests for DataResponse model."""

    def test_data_response_with_model(self) -> None:
        """Test data response wrapping a Pydantic model."""
        item = SampleItem(id="1", name="Test", value=Decimal("100.00"))
        response = DataResponse[SampleItem](data=item)
        assert response.data.id == "1"
        assert response.data.name == "Test"
        assert response.message is None

    def test_data_response_with_message(self) -> None:
        """Test data response with message."""
        response = DataResponse[dict](
            data={"key": "value"},
            message="Data retrieved successfully",
        )
        assert response.data["key"] == "value"
        assert response.message == "Data retrieved successfully"

    def test_data_response_required(self) -> None:
        """Test data field is required."""
        with pytest.raises(ValidationError) as exc_info:
            DataResponse[str]()  # type: ignore
        assert "data" in str(exc_info.value)

    def test_data_response_serialization(self) -> None:
        """Test data response serialization."""
        item = SampleItem(id="abc", name="Item", value=Decimal("50.00"))
        response = DataResponse[SampleItem](data=item, message="Found")
        data = response.model_dump()
        assert data["data"]["id"] == "abc"
        assert data["message"] == "Found"


class TestErrorCodes:
    """Tests for ErrorCodes constants."""

    def test_validation_error_code(self) -> None:
        """Test VALIDATION_ERROR constant."""
        assert ErrorCodes.VALIDATION_ERROR == "VALIDATION_ERROR"

    def test_not_found_code(self) -> None:
        """Test NOT_FOUND constant."""
        assert ErrorCodes.NOT_FOUND == "NOT_FOUND"

    def test_unauthorized_code(self) -> None:
        """Test UNAUTHORIZED constant."""
        assert ErrorCodes.UNAUTHORIZED == "UNAUTHORIZED"

    def test_forbidden_code(self) -> None:
        """Test FORBIDDEN constant."""
        assert ErrorCodes.FORBIDDEN == "FORBIDDEN"

    def test_conflict_code(self) -> None:
        """Test CONFLICT constant."""
        assert ErrorCodes.CONFLICT == "CONFLICT"

    def test_internal_error_code(self) -> None:
        """Test INTERNAL_ERROR constant."""
        assert ErrorCodes.INTERNAL_ERROR == "INTERNAL_ERROR"

    def test_bad_request_code(self) -> None:
        """Test BAD_REQUEST constant."""
        assert ErrorCodes.BAD_REQUEST == "BAD_REQUEST"

    def test_rate_limited_code(self) -> None:
        """Test RATE_LIMITED constant."""
        assert ErrorCodes.RATE_LIMITED == "RATE_LIMITED"

    def test_service_unavailable_code(self) -> None:
        """Test SERVICE_UNAVAILABLE constant."""
        assert ErrorCodes.SERVICE_UNAVAILABLE == "SERVICE_UNAVAILABLE"

    def test_error_codes_usable_in_response(self) -> None:
        """Test error codes can be used in ErrorResponse."""
        response = ErrorResponse(
            error=ErrorCodes.NOT_FOUND,
            message="Resource not found",
        )
        assert response.error == "NOT_FOUND"


class TestCreateErrorResponse:
    """Tests for create_error_response factory function."""

    def test_create_error_response_basic(self) -> None:
        """Test creating error response with factory."""
        response = create_error_response(
            error="ERROR_CODE",
            message="Error message",
        )
        assert isinstance(response, ErrorResponse)
        assert response.error == "ERROR_CODE"
        assert response.message == "Error message"
        assert response.details is None

    def test_create_error_response_with_details(self) -> None:
        """Test creating error response with details."""
        details = {"field": ["error1", "error2"]}
        response = create_error_response(
            error=ErrorCodes.VALIDATION_ERROR,
            message="Validation failed",
            details=details,
        )
        assert response.details == details

    def test_create_error_response_with_error_codes(self) -> None:
        """Test factory with ErrorCodes constants."""
        response = create_error_response(
            error=ErrorCodes.FORBIDDEN,
            message="Access denied",
        )
        assert response.error == "FORBIDDEN"


class TestCreateSuccessResponse:
    """Tests for create_success_response factory function."""

    def test_create_success_response_empty(self) -> None:
        """Test creating empty success response."""
        response = create_success_response()
        assert isinstance(response, SuccessResponse)
        assert response.message is None
        assert response.data is None

    def test_create_success_response_with_message(self) -> None:
        """Test creating success response with message."""
        response = create_success_response(message="Success!")
        assert response.message == "Success!"

    def test_create_success_response_with_data(self) -> None:
        """Test creating success response with data."""
        data = {"result": "completed"}
        response = create_success_response(data=data)
        assert response.data == data

    def test_create_success_response_with_both(self) -> None:
        """Test creating success response with message and data."""
        response = create_success_response(
            message="Created",
            data={"id": "123"},
        )
        assert response.message == "Created"
        assert response.data["id"] == "123"


class TestCreatePaginatedResponse:
    """Tests for create_paginated_response factory function."""

    def test_create_paginated_response(self) -> None:
        """Test creating paginated response with factory."""
        items = ["a", "b", "c"]
        response = create_paginated_response(
            items=items,
            total=100,
            page=2,
            page_size=10,
        )
        assert isinstance(response, PaginatedResponse)
        assert response.items == items
        assert response.total == 100
        assert response.page == 2
        assert response.page_size == 10
        assert response.total_pages == 10
        assert response.has_next is True
        assert response.has_previous is True

    def test_create_paginated_response_first_page(self) -> None:
        """Test creating paginated response for first page."""
        response = create_paginated_response(
            items=["x"],
            total=50,
            page=1,
            page_size=25,
        )
        assert response.has_previous is False
        assert response.has_next is True

    def test_create_paginated_response_last_page(self) -> None:
        """Test creating paginated response for last page."""
        response = create_paginated_response(
            items=["x"],
            total=50,
            page=2,
            page_size=25,
        )
        assert response.has_previous is True
        assert response.has_next is False

    def test_create_paginated_response_empty(self) -> None:
        """Test creating empty paginated response."""
        response = create_paginated_response(
            items=[],
            total=0,
            page=1,
            page_size=10,
        )
        assert len(response.items) == 0
        assert response.total_pages == 0


class TestPaginatedResponseEdgeCases:
    """Edge case tests for pagination calculations."""

    def test_single_item_single_page(self) -> None:
        """Test with exactly one item fitting in one page."""
        response = PaginatedResponse[int](
            items=[1],
            total=1,
            page=1,
            page_size=10,
        )
        assert response.total_pages == 1
        assert response.has_next is False
        assert response.has_previous is False

    def test_page_size_equals_total(self) -> None:
        """Test when page size equals total items."""
        response = PaginatedResponse[int](
            items=[1, 2, 3],
            total=3,
            page=1,
            page_size=3,
        )
        assert response.total_pages == 1
        assert response.has_next is False
        assert response.has_previous is False

    def test_large_page_number(self) -> None:
        """Test with large page number."""
        response = PaginatedResponse[str](
            items=["last"],
            total=1000,
            page=100,
            page_size=10,
        )
        assert response.total_pages == 100
        assert response.has_next is False
        assert response.has_previous is True

    def test_max_page_size(self) -> None:
        """Test with maximum allowed page size."""
        response = PaginatedResponse[int](
            items=list(range(100)),
            total=500,
            page=1,
            page_size=100,
        )
        assert response.total_pages == 5
        assert response.page_size == 100
