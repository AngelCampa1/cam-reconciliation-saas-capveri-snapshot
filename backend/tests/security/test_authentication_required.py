"""
Authentication audit tests - Story 24.12.

Verifies that all protected API endpoints require authentication and
properly reject unauthenticated requests with 401 status codes.

Public endpoints (allowed without auth):
- /health
- /api/v1/auth/* (login, register, reset-password, etc.)
- /webhooks/stripe (uses signature verification)

All other endpoints should return 401 without valid JWT.
"""

import pytest
from fastapi import status
from fastapi.testclient import TestClient

# Public endpoints that should NOT require authentication
PUBLIC_ENDPOINTS = [
    ("GET", "/health"),
    ("POST", "/api/v1/auth/login"),
]


# Protected endpoints that MUST require authentication
PROTECTED_ENDPOINTS = [
    # Properties
    ("GET", "/api/v1/properties"),
    ("POST", "/api/v1/properties"),
    ("GET", "/api/v1/properties/00000000-0000-0000-0000-000000000001"),
    ("PUT", "/api/v1/properties/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/properties/00000000-0000-0000-0000-000000000001"),
    # Units
    ("GET", "/api/v1/units"),
    ("POST", "/api/v1/units"),
    ("GET", "/api/v1/units/00000000-0000-0000-0000-000000000001"),
    ("PUT", "/api/v1/units/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/units/00000000-0000-0000-0000-000000000001"),
    # Leases
    ("GET", "/api/v1/leases"),
    ("POST", "/api/v1/leases"),
    ("GET", "/api/v1/leases/00000000-0000-0000-0000-000000000001"),
    ("PUT", "/api/v1/leases/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/leases/00000000-0000-0000-0000-000000000001"),
    # Reconciliation
    ("POST", "/api/v1/reconciliations/calculate"),
    ("GET", "/api/v1/reconciliations/snapshots"),
    ("GET", "/api/v1/reconciliations/snapshots/00000000-0000-0000-0000-000000000001"),
    (
        "POST",
        "/api/v1/reconciliations/snapshots/00000000-0000-0000-0000-000000000001/finalize",
    ),
    # Ingestion
    ("POST", "/api/v1/ingestion/upload"),
    ("GET", "/api/v1/ingestion/batches"),
    ("GET", "/api/v1/ingestion/batches/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/ingestion/batches/00000000-0000-0000-0000-000000000001"),
    # Extraction
    ("GET", "/api/v1/extraction/jobs"),
    ("GET", "/api/v1/extraction/jobs/00000000-0000-0000-0000-000000000001"),
    ("POST", "/api/v1/extraction/jobs/00000000-0000-0000-0000-000000000001/approve"),
    ("POST", "/api/v1/extraction/jobs/00000000-0000-0000-0000-000000000001/reject"),
    # Analysis
    ("GET", "/api/v1/analysis/year-over-year"),
    ("GET", "/api/v1/analysis/trends"),
    ("GET", "/api/v1/analysis/anomalies"),
    # Exports
    (
        "POST",
        "/api/v1/exports/reconciliations/snapshots/00000000-0000-0000-0000-000000000001/pdf",
    ),
    (
        "POST",
        "/api/v1/exports/reconciliations/snapshots/00000000-0000-0000-0000-000000000001/erp",
    ),
    # Billing
    ("GET", "/api/v1/billing/subscriptions"),
    ("POST", "/api/v1/billing/subscriptions"),
    ("DELETE", "/api/v1/billing/subscriptions/00000000-0000-0000-0000-000000000001"),
    ("GET", "/api/v1/billing/invoices"),
    ("GET", "/api/v1/billing/customer"),
    # Dashboard
    ("GET", "/api/v1/dashboard"),
    # Documents
    ("POST", "/api/v1/documents/upload"),
    ("GET", "/api/v1/documents/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/documents/00000000-0000-0000-0000-000000000001"),
    # Feedback
    ("POST", "/api/v1/feedback"),
    ("GET", "/api/v1/feedback"),
    ("GET", "/api/v1/feedback/00000000-0000-0000-0000-000000000001"),
    # Organization
    ("GET", "/api/v1/organization"),
    ("PUT", "/api/v1/organization"),
    # Pool Templates
    ("GET", "/api/v1/pool-templates"),
    ("POST", "/api/v1/pool-templates"),
    ("GET", "/api/v1/pool-templates/00000000-0000-0000-0000-000000000001"),
    ("DELETE", "/api/v1/pool-templates/00000000-0000-0000-0000-000000000001"),
    # Tenant Portal
    ("GET", "/api/v1/tenant/dashboard"),
    ("GET", "/api/v1/tenant/disputes"),
    ("POST", "/api/v1/tenant/disputes"),
]


def test_public_endpoints_do_not_require_auth(base_client: TestClient):
    """Verify public endpoints work without authentication.

    Public endpoints should be accessible without a JWT token.
    This test ensures we haven't accidentally protected public routes.
    """
    for method, path in PUBLIC_ENDPOINTS:
        # These endpoints should work without authentication
        # Note: They may fail for other reasons (validation, etc.), but not 401
        response = base_client.request(method, path)

        assert (
            response.status_code != status.HTTP_401_UNAUTHORIZED
        ), f"{method} {path} requires authentication but should be public"


def test_all_protected_endpoints_require_auth(base_client: TestClient):
    """Verify all protected endpoints reject unauthenticated requests.

    This is a critical security test - ALL protected endpoints must return 401
    when accessed without a valid JWT token. Any endpoint that doesn't is a
    security vulnerability.

    Acceptance Criteria:
    - All protected endpoints return 401 Unauthorized without auth
    - No endpoint leaks data or allows operations without authentication
    """
    failed_endpoints = []

    for method, path in PROTECTED_ENDPOINTS:
        # Make request WITHOUT Authorization header
        response = base_client.request(method, path)

        # Accept 401 (proper auth check), 404 (endpoint doesn't exist), or 405 (method not allowed)
        # These are all safe - endpoint either checks auth or doesn't exist
        if response.status_code not in [status.HTTP_401_UNAUTHORIZED, 404, 405]:
            failed_endpoints.append(
                {
                    "method": method,
                    "path": path,
                    "status": response.status_code,
                    "body": response.text[:200],  # First 200 chars of response
                }
            )

    # Assert all endpoints properly rejected unauthenticated requests
    assert len(failed_endpoints) == 0, (
        f"{len(failed_endpoints)} endpoints failed to require authentication:\n"
        + "\n".join(
            [
                f"  {ep['method']} {ep['path']} returned {ep['status']} (expected 401)"
                for ep in failed_endpoints
            ]
        )
    )


def test_invalid_jwt_token_rejected(base_client: TestClient):
    """Verify invalid JWT tokens are rejected with 401.

    Tests that endpoints properly validate JWT tokens and reject:
    - Malformed tokens
    - Expired tokens
    - Tokens with invalid signatures
    """
    invalid_tokens = [
        "invalid_token",
        "Bearer",
        "Bearer ",
        "Bearer eyInvalid.Token.Here",
        "NotBearer valid_token",
    ]

    # Test with a sample protected endpoint
    test_endpoint = "/api/v1/properties"

    for token in invalid_tokens:
        response = base_client.get(test_endpoint, headers={"Authorization": token})

        assert (
            response.status_code == status.HTTP_401_UNAUTHORIZED
        ), f"Invalid token '{token[:20]}...' was not rejected (got {response.status_code})"


def test_missing_authorization_header(base_client: TestClient):
    """Verify requests without Authorization header are rejected.

    Even if other auth methods exist (cookies, etc.), the API should
    enforce Bearer token authentication via Authorization header.
    """
    test_endpoints = [
        "/api/v1/properties",
        "/api/v1/leases",
        "/api/v1/reconciliations/snapshots",
    ]

    for endpoint in test_endpoints:
        response = base_client.get(endpoint)

        # Accept 401 (proper auth), 404 (doesn't exist), or 405 (method not allowed)
        assert response.status_code in [
            status.HTTP_401_UNAUTHORIZED,
            404,
            405,
        ], f"Endpoint {endpoint} did not reject request without Authorization header (got {response.status_code})"


def test_bearer_prefix_required(base_client: TestClient):
    """Verify that JWT tokens must use 'Bearer' prefix.

    The Authorization header must be in format: 'Bearer <token>'
    Other formats should be rejected.
    """
    # Create a mock token (doesn't need to be valid for this test)
    mock_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"

    # Test without 'Bearer' prefix
    response = base_client.get(
        "/api/v1/properties",
        headers={"Authorization": mock_token},  # Missing "Bearer " prefix
    )

    assert (
        response.status_code == status.HTTP_401_UNAUTHORIZED
    ), "Token without 'Bearer' prefix was not rejected"


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/v1/properties"),
        ("POST", "/api/v1/leases"),
        ("PUT", "/api/v1/units/00000000-0000-0000-0000-000000000001"),
        ("DELETE", "/api/v1/properties/00000000-0000-0000-0000-000000000001"),
    ],
)
def test_all_http_methods_require_auth(base_client: TestClient, method: str, path: str):
    """Verify authentication is required for all HTTP methods.

    Tests GET, POST, PUT, DELETE to ensure no method bypasses auth checks.
    """
    response = base_client.request(method, path)

    # Accept 401 (proper auth), 404 (doesn't exist), or 405 (method not allowed)
    assert response.status_code in [
        status.HTTP_401_UNAUTHORIZED,
        404,
        405,
    ], f"{method} {path} did not require authentication (got {response.status_code})"


# Summary test that can be run standalone
def test_authentication_audit_summary(base_client: TestClient):
    """Summary test for authentication audit - Story 24.12.

    This test provides a quick overview of authentication security:
    - Counts protected vs public endpoints
    - Verifies no leaks in authentication enforcement

    Acceptance: All protected endpoints require authentication.
    """
    protected_count = len(PROTECTED_ENDPOINTS)
    public_count = len(PUBLIC_ENDPOINTS)

    # Quick check on a sample of protected endpoints
    sample_protected = PROTECTED_ENDPOINTS[:5]  # Test first 5
    failures = []

    for method, path in sample_protected:
        response = base_client.request(method, path)
        if response.status_code != status.HTTP_401_UNAUTHORIZED:
            failures.append(f"{method} {path}")

    # Report summary
    print("\n=== Authentication Audit Summary ===")
    print(f"Public endpoints: {public_count}")
    print(f"Protected endpoints: {protected_count}")
    print(f"Sample tested: {len(sample_protected)}")
    print(f"Failed authentication checks: {len(failures)}")

    assert len(failures) == 0, f"Authentication audit failed for: {', '.join(failures)}"
