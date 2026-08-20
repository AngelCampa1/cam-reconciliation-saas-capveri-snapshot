"""Tests for content lead capture API endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.leads.asset_registry import (
    ASSETS,
    CALCULATOR_UNLOCK_SLUGS,
    DOWNLOAD_SLUGS,
)


@pytest.fixture(autouse=True)
def bypass_turnstile():
    """Bypass Turnstile verification by default so endpoint tests stay
    deterministic and never make a real network call (the local .env may set
    TURNSTILE_SECRET_KEY). Tests asserting the fail-closed path override this
    with their own patch."""
    with patch(
        "app.api.v1.leads.verify_turnstile",
        new_callable=AsyncMock,
        return_value=True,
    ):
        yield


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    db = MagicMock()
    # Default: no existing leads (rate limit not exceeded)
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[]
    )
    # Default: suppression check returns empty (not suppressed)
    db.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    # Default: insert succeeds with ID
    db.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "test-lead-id"}]
    )
    # Default: storage signed URL succeeds
    db.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://storage.example.com/signed/cam.xlsx?token=abc"
    }
    # Default: upsert/update/is queries succeed
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    db.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[]
    )
    db.table.return_value.select.return_value.eq.return_value.is_.return_value.execute.return_value = MagicMock(
        data=[]
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        MagicMock(data=[])
    )
    return db


@pytest.fixture
def mock_email_service():
    """Mock email service."""
    service = MagicMock()
    service.send_content_download = AsyncMock(
        return_value={"status": "sent", "id": "email-123"}
    )
    return service


@pytest.fixture
def mock_sequencer_enroll():
    """Mock Sequencer enrollment so no network calls are made."""
    with patch(
        "app.api.v1.leads.enroll_sequencer_sequence",
        new_callable=AsyncMock,
    ) as mock:
        yield mock


@pytest.fixture
def mock_sequencer_event():
    """Mock Sequencer event recording so no network calls are made."""
    with patch(
        "app.api.v1.leads.record_sequencer_event",
        new_callable=AsyncMock,
    ) as mock:
        yield mock


@pytest.fixture
def mock_sequencer_unsubscribe():
    """Mock Sequencer unsubscribe forwarding so no network calls are made."""
    with patch(
        "app.api.v1.leads.unsubscribe_sequencer_contact",
        new_callable=AsyncMock,
    ) as mock:
        yield mock


@pytest.fixture
def mock_storage_url():
    """Mock R2 signed URL generation."""
    with patch(
        "app.api.v1.leads.get_lead_magnet_url",
        return_value="https://r2.example.com/lead-magnet.xlsx?sig=test",
    ) as mock:
        yield mock


@pytest.fixture(autouse=True)
def mock_capture_backend_event():
    """Mock PostHog capture so lead tests never depend on network/config."""
    with patch(
        "app.api.v1.leads.capture_backend_event",
        new_callable=AsyncMock,
    ) as mock:
        yield mock


@pytest.fixture
def client(
    mock_supabase,
    mock_email_service,
    mock_sequencer_enroll,
    mock_sequencer_event,
    mock_sequencer_unsubscribe,
    mock_storage_url,
):
    """Test client with mocked dependencies."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    yield TestClient(app)

    app.dependency_overrides.clear()


VALID_PAYLOAD = {
    "first_name": "Jane",
    "email": "jane@example.com",
    "company": "Acme REIT",
    "asset_slug": "cam-gross-up-calculator",
    "source": "reddit",
    "utm_source": "reddit",
    "utm_medium": "social",
    "utm_campaign": "feb-launch",
    "ve_product": "capveri",
    "ve_icp": "cv_property_controllers",
    "ve_campaign_id": "capveri-controller-presend-qa-2026_06-01",
    "ve_variant": "plain_founder",
    "ve_step": "3",
    "ve_offer": "free_audit",
    "ve_instantly_campaign_id": "instantly-capveri-01",
    "ve_lead_list_id": "capveri-controller-list",
    "ve_sender_pool": "capveri",
    "ve_sequence_day": "5",
    "ve_branding": "plain",
}


# ---------------------------------------------------------------------------
# Registry consistency tests
# ---------------------------------------------------------------------------


def test_download_slugs_are_consistent():
    """DOWNLOAD_SLUGS contains only pdf/xlsx assets that are enabled."""
    for slug in DOWNLOAD_SLUGS:
        asset = ASSETS[slug]
        assert asset.format in ("pdf", "xlsx")
        assert asset.enabled is True


def test_calculator_unlock_slugs_are_consistent():
    """CALCULATOR_UNLOCK_SLUGS contains only calculator_unlock assets that are enabled."""
    for slug in CALCULATOR_UNLOCK_SLUGS:
        asset = ASSETS[slug]
        assert asset.format == "calculator_unlock"
        assert asset.enabled is True


def test_all_assets_have_storage_paths():
    """Every asset has an R2 storage path; follow-up sequencing is centralized."""
    for slug, asset in ASSETS.items():
        assert asset.storage_path, f"{slug!r} is missing a storage path"


# ---------------------------------------------------------------------------
# Content download tests
# ---------------------------------------------------------------------------


def test_capture_lead_success(
    client,
    mock_supabase,
    mock_email_service,
    mock_sequencer_enroll,
    mock_capture_backend_event,
):
    """Valid payload captures lead, sends delivery, enrolls Sequencer."""
    response = client.post("/api/v1/leads/content-download", json=VALID_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "email" in body["message"].lower()

    mock_supabase.table.assert_any_call("content_leads")
    mock_email_service.send_content_download.assert_awaited_once()
    mock_sequencer_enroll.assert_awaited_once()
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["email"] == "jane@example.com"
    assert call_kwargs["sequence_slug"] == "capveri-nurture-value-1"
    assert call_kwargs["external_id"] == "content:test-lead-id:nurture"
    assert call_kwargs["metadata"]["assetSlug"] == "cam-gross-up-calculator"
    assert call_kwargs["metadata"]["ve_campaign_id"] == (
        "capveri-controller-presend-qa-2026_06-01"
    )
    assert call_kwargs["metadata"]["ve_variant"] == "plain_founder"
    mock_capture_backend_event.assert_awaited_once()
    assert mock_capture_backend_event.await_args.args[0] == "lead_form_submit"
    analytics_kwargs = mock_capture_backend_event.await_args.kwargs
    assert analytics_kwargs["distinct_id"].startswith("lead:example.com:")
    assert analytics_kwargs["properties"] == {
        "lead_email_domain": "example.com",
        "lead_id": "test-lead-id",
        "lead_type": "content_download",
        "asset_slug": "cam-gross-up-calculator",
        "asset_format": "xlsx",
        "source": "reddit",
        "utm_source": "reddit",
        "utm_medium": "social",
        "utm_campaign": "feb-launch",
        "ve_product": "capveri",
        "ve_icp": "cv_property_controllers",
        "ve_campaign_id": "capveri-controller-presend-qa-2026_06-01",
        "ve_variant": "plain_founder",
        "ve_step": "3",
        "ve_offer": "free_audit",
        "ve_instantly_campaign_id": "instantly-capveri-01",
        "ve_lead_list_id": "capveri-controller-list",
        "ve_sender_pool": "capveri",
        "ve_sequence_day": "5",
        "ve_branding": "plain",
    }


def test_capture_lead_exit_intent_routes_to_tailored_sequence(
    client, mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """source 'exit_intent_popup' enrolls into the exit-intent nurture sequence."""
    payload = {**VALID_PAYLOAD, "source": "exit_intent_popup"}

    response = client.post("/api/v1/leads/content-download", json=payload)

    assert response.status_code == 200
    mock_sequencer_enroll.assert_awaited_once()
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["sequence_slug"] == "capveri-exit-intent-nurture"


def test_capture_lead_absent_source_uses_default_sequence(
    client, mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """A missing source falls back to the default nurture sequence."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "source"}

    response = client.post("/api/v1/leads/content-download", json=payload)

    assert response.status_code == 200
    mock_sequencer_enroll.assert_awaited_once()
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["sequence_slug"] == "capveri-nurture-value-1"


def test_capture_lead_unknown_source_uses_default_sequence(
    client, mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """An unmapped (non-null) source falls back to the default nurture sequence."""
    payload = {**VALID_PAYLOAD, "source": "organic_blog"}

    response = client.post("/api/v1/leads/content-download", json=payload)

    assert response.status_code == 200
    mock_sequencer_enroll.assert_awaited_once()
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["sequence_slug"] == "capveri-nurture-value-1"


def test_capture_lead_canonicalizes_email(
    client, mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Mixed-case emails are stored and processed using one canonical value."""
    payload = {**VALID_PAYLOAD, "email": "Jane@Example.com"}

    response = client.post("/api/v1/leads/content-download", json=payload)

    assert response.status_code == 200
    insert_payload = mock_supabase.table.return_value.insert.call_args.args[0]
    assert insert_payload["email"] == "jane@example.com"
    assert mock_email_service.send_content_download.await_args.kwargs["to_email"] == (
        "jane@example.com"
    )
    assert mock_sequencer_enroll.await_args.kwargs["email"] == "jane@example.com"


def test_capture_lead_invalid_slug(client):
    """Unknown asset_slug returns 422."""
    payload = {**VALID_PAYLOAD, "asset_slug": "unknown-tool"}
    response = client.post("/api/v1/leads/content-download", json=payload)
    assert response.status_code == 422


def test_capture_lead_formerly_disabled_asset_now_available(client):
    """Every registered downloadable asset is available."""
    payload = {**VALID_PAYLOAD, "asset_slug": "admin-fee-calculator"}
    response = client.post("/api/v1/leads/content-download", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_capture_lead_calculator_slug_rejected(client):
    """calculator_unlock slugs are rejected from content-download endpoint."""
    payload = {**VALID_PAYLOAD, "asset_slug": "boma-2024-calculator"}
    response = client.post("/api/v1/leads/content-download", json=payload)
    assert response.status_code == 422


def test_capture_lead_rate_limited(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Second request for same email+slug within 24h returns 429."""
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[{"id": "existing-lead-id"}]
    )

    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post("/api/v1/leads/content-download", json=VALID_PAYLOAD)

    app.dependency_overrides.clear()

    assert response.status_code == 429
    assert "already requested" in response.json()["detail"].lower()


def test_capture_lead_suppressed_email_silently_succeeds(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Suppressed email returns 200 without processing."""
    with patch("app.api.v1.leads._check_suppressed", return_value=True):
        from app.database.client import get_supabase_admin
        from app.services.email import get_email_service

        app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
        app.dependency_overrides[get_email_service] = lambda: mock_email_service

        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/content-download", json=VALID_PAYLOAD
        )
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["success"] is True
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


def test_capture_lead_storage_error_fails_closed(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Storage failure blocks a successful capture without a download link."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    with patch(
        "app.api.v1.leads.get_lead_magnet_url",
        side_effect=Exception("Storage unavailable"),
    ):
        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/content-download", json=VALID_PAYLOAD
        )

    app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "download link" in response.json()["detail"].lower()
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


def test_capture_lead_sequencer_failure_still_succeeds(client, mock_sequencer_enroll):
    """Sequencer failure does not block lead capture."""
    mock_sequencer_enroll.side_effect = Exception("Sequencer down")

    response = client.post("/api/v1/leads/content-download", json=VALID_PAYLOAD)

    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_capture_lead_defers_side_effects_to_background(
    mock_supabase, mock_email_service, mock_sequencer_enroll, mock_storage_url
):
    """The response returns before the email + Sequencer side-effects run (F-144).

    The endpoint must only *schedule* the best-effort side-effects; they run
    after the HTTP response is sent.
    """
    from fastapi import BackgroundTasks

    from app.api.v1.leads import ContentLeadRequest, capture_content_lead

    background_tasks = BackgroundTasks()
    payload = ContentLeadRequest(**VALID_PAYLOAD)
    http_request = MagicMock()

    with patch(
        "app.api.v1.leads.verify_turnstile",
        new_callable=AsyncMock,
        return_value=True,
    ):
        result = await capture_content_lead(
            payload=payload,
            http_request=http_request,
            background_tasks=background_tasks,
            email_service=mock_email_service,
            db=mock_supabase,
        )

    # Response is ready, but side-effects have only been scheduled.
    assert result.success is True
    assert len(background_tasks.tasks) == 2
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()

    # Running the queued tasks performs the deferred side-effects.
    await background_tasks()
    mock_email_service.send_content_download.assert_awaited_once()
    mock_sequencer_enroll.assert_awaited_once()


def test_capture_lead_no_first_name_succeeds(client, mock_email_service):
    """Submitting without first_name (email-only form) returns 200."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "first_name"}
    response = client.post("/api/v1/leads/content-download", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True
    call_kwargs = mock_email_service.send_content_download.await_args.kwargs
    assert call_kwargs["first_name"] == ""


def test_capture_lead_missing_required_fields(client):
    """Missing email returns 422."""
    response = client.post(
        "/api/v1/leads/content-download",
        json={"asset_slug": "cam-gross-up-calculator"},
    )
    assert response.status_code == 422


def test_capture_lead_lease_matrix_slug(client, mock_sequencer_enroll):
    """lease-abstract-matrix slug is accepted."""
    payload = {
        **VALID_PAYLOAD,
        "asset_slug": "lease-abstract-matrix",
        "email": "test2@example.com",
    }
    response = client.post("/api/v1/leads/content-download", json=payload)
    assert response.status_code == 200
    assert response.json()["success"] is True
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["metadata"]["assetSlug"] == "lease-abstract-matrix"


# ---------------------------------------------------------------------------
# Calculator unlock tests
# ---------------------------------------------------------------------------

VALID_UNLOCK_PAYLOAD = {
    "first_name": "Jane",
    "email": "jane@example.com",
    "slug": "boma-2024-calculator",
    "source": "test",
}


def test_calculator_unlock_success(
    client,
    mock_supabase,
    mock_email_service,
    mock_sequencer_enroll,
    mock_capture_backend_event,
):
    """Valid payload captures lead and returns unlocked: true."""
    response = client.post("/api/v1/leads/calculator-unlock", json=VALID_UNLOCK_PAYLOAD)
    assert response.status_code == 200
    body = response.json()
    assert body["unlocked"] is True
    assert "unlocked" in body["message"].lower()
    mock_supabase.table.assert_any_call("content_leads")
    mock_email_service.send_content_download.assert_awaited_once()
    mock_sequencer_enroll.assert_awaited_once()
    call_kwargs = mock_sequencer_enroll.await_args.kwargs
    assert call_kwargs["sequence_slug"] == "capveri-nurture-value-1"
    assert call_kwargs["external_id"] == "calculator:test-lead-id:nurture"
    assert call_kwargs["metadata"]["assetSlug"] == "boma-2024-calculator"
    mock_capture_backend_event.assert_awaited_once()
    assert mock_capture_backend_event.await_args.args[0] == (
        "calculator_unlock_completed"
    )
    analytics_kwargs = mock_capture_backend_event.await_args.kwargs
    assert analytics_kwargs["distinct_id"].startswith("lead:example.com:")
    assert analytics_kwargs["properties"] == {
        "lead_email_domain": "example.com",
        "lead_id": "test-lead-id",
        "lead_type": "calculator_unlock",
        "asset_slug": "boma-2024-calculator",
        "source": "test",
    }


def test_calculator_unlock_canonicalizes_email(
    client, mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Calculator unlock stores and sends using lower-case email."""
    payload = {**VALID_UNLOCK_PAYLOAD, "email": "Jane@Example.com"}

    response = client.post("/api/v1/leads/calculator-unlock", json=payload)

    assert response.status_code == 200
    insert_payload = mock_supabase.table.return_value.insert.call_args.args[0]
    assert insert_payload["email"] == "jane@example.com"
    assert mock_email_service.send_content_download.await_args.kwargs["to_email"] == (
        "jane@example.com"
    )
    assert mock_sequencer_enroll.await_args.kwargs["email"] == "jane@example.com"


def test_calculator_unlock_unknown_slug(client):
    """Unknown slug returns 422."""
    payload = {**VALID_UNLOCK_PAYLOAD, "slug": "unknown-tool"}
    response = client.post("/api/v1/leads/calculator-unlock", json=payload)
    assert response.status_code == 422


def test_calculator_unlock_download_slug_rejected(client):
    """A pdf/xlsx slug is rejected from the calculator-unlock endpoint."""
    payload = {**VALID_UNLOCK_PAYLOAD, "slug": "cam-gross-up-calculator"}
    response = client.post("/api/v1/leads/calculator-unlock", json=payload)
    assert response.status_code == 422


def test_calculator_unlock_formerly_disabled_slug_now_available(client):
    """Every registered calculator unlock is available."""
    payload = {**VALID_UNLOCK_PAYLOAD, "slug": "fixed-cam-vs-traditional"}
    response = client.post("/api/v1/leads/calculator-unlock", json=payload)
    assert response.status_code == 200
    assert response.json()["unlocked"] is True


def test_calculator_unlock_rate_limit(client, mock_supabase):
    """Duplicate submission within 24h returns 429."""
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[{"id": "existing-lead"}]
    )
    response = client.post("/api/v1/leads/calculator-unlock", json=VALID_UNLOCK_PAYLOAD)
    assert response.status_code == 429


def test_calculator_unlock_missing_email(client):
    """Missing email returns 422."""
    payload = {"first_name": "Jane", "slug": "boma-2024-calculator"}
    response = client.post("/api/v1/leads/calculator-unlock", json=payload)
    assert response.status_code == 422


def test_calculator_unlock_no_source(client, mock_supabase):
    """Source field is optional."""
    payload = {
        "first_name": "Jane",
        "email": "jane@example.com",
        "slug": "boma-2024-calculator",
    }
    response = client.post("/api/v1/leads/calculator-unlock", json=payload)
    assert response.status_code == 200
    assert response.json()["unlocked"] is True


def test_calculator_unlock_storage_error_fails_closed(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Calculator unlock does not succeed when companion signing fails."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    with patch(
        "app.api.v1.leads.get_lead_magnet_url",
        side_effect=Exception("Storage unavailable"),
    ):
        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/calculator-unlock", json=VALID_UNLOCK_PAYLOAD
        )

    app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "companion download" in response.json()["detail"].lower()
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


def test_calculator_unlock_suppressed_email_silently_succeeds(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Suppressed email on calculator unlock returns 200 without processing."""
    with patch("app.api.v1.leads._check_suppressed", return_value=True):
        from app.database.client import get_supabase_admin
        from app.services.email import get_email_service

        app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
        app.dependency_overrides[get_email_service] = lambda: mock_email_service

        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/calculator-unlock", json=VALID_UNLOCK_PAYLOAD
        )
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["unlocked"] is True
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


# ---------------------------------------------------------------------------
# PLG free-audit signup tests
# ---------------------------------------------------------------------------

VALID_PLG_PAYLOAD = {
    "email": "plg@example.com",
    "first_name": "Alex",
    "organization_name": "Acme REIT",
    "leakage_amount": 12500.0,
    "property_name": "Tower 1",
    "utm_source": "google",
    "utm_campaign": "plg-launch",
    "ve_product": "capveri",
    "ve_icp": "cv_property_controllers",
    "ve_campaign_id": "capveri-controller-plg-2026_06-01",
    "ve_variant": "product_branded",
    "ve_step": "9",
    "ve_offer": "free_audit",
    "ve_branding": "branded",
}


def test_plg_signup_stores_lead(
    client,
    mock_supabase,
    mock_capture_backend_event,
    mock_sequencer_event,
):
    """Valid PLG signup stores lead in content_leads."""
    response = client.post("/api/v1/leads/plg-signup", json=VALID_PLG_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    mock_supabase.table.assert_any_call("content_leads")
    mock_capture_backend_event.assert_awaited_once()
    assert mock_capture_backend_event.await_args.args[0] == ("plg_signup_lead_captured")
    analytics_kwargs = mock_capture_backend_event.await_args.kwargs
    assert analytics_kwargs["distinct_id"].startswith("lead:example.com:")
    assert analytics_kwargs["properties"] == {
        "lead_email_domain": "example.com",
        "lead_id": "test-lead-id",
        "lead_type": "plg_free_audit",
        "asset_slug": "plg_free_audit",
        "leakage_amount_bucket": "10k-50k",
        "utm_source": "google",
        "utm_campaign": "plg-launch",
        "ve_product": "capveri",
        "ve_icp": "cv_property_controllers",
        "ve_campaign_id": "capveri-controller-plg-2026_06-01",
        "ve_variant": "product_branded",
        "ve_step": "9",
        "ve_offer": "free_audit",
        "ve_branding": "branded",
    }
    mock_sequencer_event.assert_awaited_once()
    event_kwargs = mock_sequencer_event.await_args.kwargs
    assert event_kwargs["email"] == "plg@example.com"
    assert event_kwargs["event"] == "signup_completed"
    assert event_kwargs["metadata"] == {
        "lead_id": "test-lead-id",
        "source": "plg_free_audit",
        "asset_slug": "plg_free_audit",
        "utm_source": "google",
        "utm_campaign": "plg-launch",
        "ve_product": "capveri",
        "ve_icp": "cv_property_controllers",
        "ve_campaign_id": "capveri-controller-plg-2026_06-01",
        "ve_variant": "product_branded",
        "ve_step": "9",
        "ve_offer": "free_audit",
        "ve_branding": "branded",
    }


def test_plg_signup_sequencer_event_failure_still_succeeds(
    client,
    mock_sequencer_event,
):
    """Sequencer event capture failure does not block signup capture."""
    mock_sequencer_event.side_effect = Exception("Sequencer down")

    response = client.post("/api/v1/leads/plg-signup", json=VALID_PLG_PAYLOAD)

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_plg_signup_canonicalizes_email(client, mock_supabase):
    """PLG signup stores mixed-case email in canonical lower-case form."""
    payload = {**VALID_PLG_PAYLOAD, "email": "PLG@Example.com"}

    response = client.post("/api/v1/leads/plg-signup", json=payload)

    assert response.status_code == 200
    insert_payload = mock_supabase.table.return_value.insert.call_args.args[0]
    assert insert_payload["email"] == "plg@example.com"


def test_plg_signup_rate_limits_duplicate_email(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Second PLG signup from same email within 24h returns 429."""
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[{"id": "existing-lead"}]
    )

    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post("/api/v1/leads/plg-signup", json=VALID_PLG_PAYLOAD)
    app.dependency_overrides.clear()

    assert response.status_code == 429


def test_plg_signup_validates_required_fields(client):
    """Missing email or first_name returns 422."""
    # Missing first_name
    response = client.post(
        "/api/v1/leads/plg-signup",
        json={"email": "plg@example.com"},
    )
    assert response.status_code == 422

    # Missing email
    response = client.post(
        "/api/v1/leads/plg-signup",
        json={"first_name": "Alex"},
    )
    assert response.status_code == 422


def test_plg_signup_minimal_payload(client, mock_supabase):
    """PLG signup succeeds with only required fields (email + first_name)."""
    response = client.post(
        "/api/v1/leads/plg-signup",
        json={"email": "min@example.com", "first_name": "Min"},
    )
    assert response.status_code == 200
    assert response.json()["success"] is True


def test_plg_signup_honeypot_returns_success_without_side_effects(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Honeypot filled returns success with no DB insert."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(
        "/api/v1/leads/plg-signup",
        json={**VALID_PLG_PAYLOAD, "company_website": "http://spam.example"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["success"] is True
    mock_supabase.table.return_value.insert.assert_not_called()


def test_plg_signup_turnstile_failure_returns_403(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Turnstile verification failure returns 403 with no DB insert."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    with patch(
        "app.api.v1.leads.verify_turnstile",
        new=AsyncMock(return_value=False),
    ):
        test_client = TestClient(app)
        response = test_client.post("/api/v1/leads/plg-signup", json=VALID_PLG_PAYLOAD)

    app.dependency_overrides.clear()

    assert response.status_code == 403
    mock_supabase.table.return_value.insert.assert_not_called()


# ---------------------------------------------------------------------------
# Unsubscribe endpoint tests
# ---------------------------------------------------------------------------


def test_unsubscribe_valid_token(
    mock_supabase, mock_email_service, mock_sequencer_unsubscribe
):
    """Valid unsubscribe token suppresses email and returns 200."""
    from app.services.leads.unsubscribe import build_unsubscribe_token

    email = "unsub@example.com"
    email_b64, token = build_unsubscribe_token(email, "dev-unsub-hmac-secret")

    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(f"/api/v1/leads/unsubscribe?e={email_b64}&t={token}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "unsubscribed" in body["message"].lower()

    # Verify suppression table was written
    mock_supabase.table.assert_any_call("email_suppressions")
    mock_sequencer_unsubscribe.assert_awaited_once()


def test_unsubscribe_invalid_token(
    mock_supabase, mock_email_service, mock_sequencer_unsubscribe
):
    """Invalid HMAC token returns 400."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(
        "/api/v1/leads/unsubscribe?e=dXNlckBleGFtcGxlLmNvbQ&t=invalidtoken"
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "invalid" in response.json()["detail"].lower()


def test_unsubscribe_returns_ok_when_sequencer_forwarding_fails(
    mock_supabase, mock_email_service, mock_sequencer_unsubscribe
):
    """Local suppression succeeds even if Sequencer forwarding fails."""
    from app.services.leads.unsubscribe import build_unsubscribe_token

    email = "forward-fail@example.com"
    email_b64, token = build_unsubscribe_token(email, "dev-unsub-hmac-secret")
    mock_sequencer_unsubscribe.side_effect = Exception("Sequencer down")

    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(f"/api/v1/leads/unsubscribe?e={email_b64}&t={token}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    mock_sequencer_unsubscribe.assert_awaited_once()


# ---------------------------------------------------------------------------
# Honeypot + Turnstile tests - content-download
# ---------------------------------------------------------------------------


def test_content_download_honeypot_returns_success_without_side_effects(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Honeypot filled returns success with no DB insert or email."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(
        "/api/v1/leads/content-download",
        json={**VALID_PAYLOAD, "company_website": "http://spam.example"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["success"] is True
    mock_supabase.table.return_value.insert.assert_not_called()
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


def test_content_download_turnstile_failure_returns_403(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Turnstile verification failure returns 403 with no side effects."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    with patch(
        "app.api.v1.leads.verify_turnstile",
        new=AsyncMock(return_value=False),
    ):
        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/content-download", json=VALID_PAYLOAD
        )

    app.dependency_overrides.clear()

    assert response.status_code == 403
    mock_supabase.table.return_value.insert.assert_not_called()
    mock_email_service.send_content_download.assert_not_awaited()


# ---------------------------------------------------------------------------
# Honeypot + Turnstile tests - calculator-unlock
# ---------------------------------------------------------------------------


def test_calculator_unlock_honeypot_returns_success_without_side_effects(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Honeypot filled returns success with no DB insert or email."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    test_client = TestClient(app)
    response = test_client.post(
        "/api/v1/leads/calculator-unlock",
        json={**VALID_UNLOCK_PAYLOAD, "company_website": "http://spam.example"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["unlocked"] is True
    mock_supabase.table.return_value.insert.assert_not_called()
    mock_email_service.send_content_download.assert_not_awaited()
    mock_sequencer_enroll.assert_not_awaited()


def test_calculator_unlock_turnstile_failure_returns_403(
    mock_supabase, mock_email_service, mock_sequencer_enroll
):
    """Turnstile verification failure returns 403 with no side effects."""
    from app.database.client import get_supabase_admin
    from app.services.email import get_email_service

    app.dependency_overrides[get_supabase_admin] = lambda: mock_supabase
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    with patch(
        "app.api.v1.leads.verify_turnstile",
        new=AsyncMock(return_value=False),
    ):
        test_client = TestClient(app)
        response = test_client.post(
            "/api/v1/leads/calculator-unlock", json=VALID_UNLOCK_PAYLOAD
        )

    app.dependency_overrides.clear()

    assert response.status_code == 403
    mock_supabase.table.return_value.insert.assert_not_called()
    mock_email_service.send_content_download.assert_not_awaited()
