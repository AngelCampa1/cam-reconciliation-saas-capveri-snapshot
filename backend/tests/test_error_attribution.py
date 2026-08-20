from app.schemas.errors import ErrorResponse, ErrorSource


def test_error_source_enum_values():
    assert ErrorSource.USER_DATA == "user_data"
    assert ErrorSource.SOFTWARE_LOGIC == "software_logic"
    assert ErrorSource.SYSTEM_INFRASTRUCTURE == "system_infrastructure"


def test_error_response_has_error_source_field():
    resp = ErrorResponse(
        status_code=422,
        message="Invalid input",
        error_source=ErrorSource.USER_DATA,
    )
    assert resp.error_source == ErrorSource.USER_DATA


def test_error_response_error_source_optional_defaults_none():
    resp = ErrorResponse(
        status_code=500,
        message="Unexpected failure",
    )
    assert resp.error_source is None
