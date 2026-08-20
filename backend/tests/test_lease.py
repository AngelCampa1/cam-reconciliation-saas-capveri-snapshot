"""Tests for Lease domain model.

Tests cover:
- Full Lease model with all fields
- Date validation (end_date > start_date)
- LeaseStatus enum enforcement
- Embedded recovery_profile validation
- LeaseCreate DTO
- LeaseUpdate DTO with partial updates
- LeaseSummary view model
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import (
    Lease,
    LeaseCreate,
    LeaseSummary,
    LeaseUpdate,
)
from app.models.enums import CapType, LeaseStatus, PoolType
from app.models.lease_recovery_profile import (
    LeaseRecoveryProfile,
    LeaseRecoveryProfileUpdate,
)


def create_valid_recovery_profile() -> LeaseRecoveryProfile:
    """Helper to create a valid recovery profile for testing."""
    return LeaseRecoveryProfile(
        pro_rata_share=Decimal("0.05"),
        base_year=2024,
        base_year_amount=Decimal("50000.00"),
        gross_up_base_year=False,
        cap_type=CapType.NONE,
        admin_fee_percentage=Decimal("0.15"),
        excluded_pools=[],
    )


class TestLeaseModel:
    """Tests for the full Lease model."""

    def test_lease_with_all_fields(self):
        """Test creating a lease with all fields populated."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            unit_id=uuid4(),
            tenant_name="Acme Corporation",
            start_date=date(2024, 1, 1),
            end_date=date(2027, 12, 31),
            status=LeaseStatus.ACTIVE,
            recovery_profile=create_valid_recovery_profile(),
            document_url="https://s3.amazonaws.com/bucket/lease.pdf",
            created_at=now,
            updated_at=now,
        )

        assert lease.tenant_name == "Acme Corporation"
        assert lease.start_date == date(2024, 1, 1)
        assert lease.end_date == date(2027, 12, 31)
        assert lease.status == LeaseStatus.ACTIVE
        assert lease.recovery_profile.pro_rata_share == Decimal("0.05")
        assert lease.document_url == "https://s3.amazonaws.com/bucket/lease.pdf"

    def test_lease_with_minimal_fields(self):
        """Test creating a lease with only required fields."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Minimal Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 1, 2),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert lease.unit_id is None
        assert lease.status == LeaseStatus.DRAFT
        assert lease.document_url is None

    def test_lease_unit_id_optional(self):
        """Test that unit_id is optional (lease may cover multiple units)."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            unit_id=None,
            tenant_name="Multi-Unit Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert lease.unit_id is None

    def test_lease_document_url_optional(self):
        """Test that document_url is optional."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="No Doc Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            document_url=None,
            created_at=now,
            updated_at=now,
        )

        assert lease.document_url is None


class TestTenantNameValidation:
    """Tests for tenant_name field validation."""

    def test_tenant_name_required(self):
        """Test that tenant_name is required."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )

        assert "tenant_name" in str(exc_info.value)

    def test_tenant_name_min_length(self):
        """Test that tenant_name must be at least 1 character."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )

        assert "tenant_name" in str(exc_info.value)

    def test_tenant_name_max_length(self):
        """Test that tenant_name must be at most 255 characters."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="A" * 256,
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )

        assert "tenant_name" in str(exc_info.value)

    def test_tenant_name_at_max_length(self):
        """Test that tenant_name at exactly 255 characters is valid."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="A" * 255,
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert len(lease.tenant_name) == 255


class TestDateValidation:
    """Tests for date validation."""

    def test_end_date_after_start_date(self):
        """Test that end_date must be after start_date."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Valid Dates Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert lease.end_date > lease.start_date

    def test_end_date_equals_start_date_rejected(self):
        """Test that end_date == start_date is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="Same Date Tenant",
                start_date=date(2024, 6, 15),
                end_date=date(2024, 6, 15),
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )

        assert "End date must be after start date" in str(exc_info.value)

    def test_end_date_before_start_date_rejected(self):
        """Test that end_date < start_date is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="Reversed Date Tenant",
                start_date=date(2024, 12, 31),
                end_date=date(2024, 1, 1),
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )

        assert "End date must be after start date" in str(exc_info.value)

    def test_one_day_lease_valid(self):
        """Test that a lease ending one day after start is valid."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Short Term Tenant",
            start_date=date(2024, 6, 15),
            end_date=date(2024, 6, 16),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert (lease.end_date - lease.start_date).days == 1

    def test_multi_year_lease(self):
        """Test a multi-year lease."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Long Term Tenant",
            start_date=date(2020, 1, 1),
            end_date=date(2035, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        years = (lease.end_date - lease.start_date).days / 365
        assert years > 15


class TestLeaseStatus:
    """Tests for LeaseStatus enum."""

    def test_all_lease_statuses_valid(self):
        """Test all LeaseStatus enum values."""
        now = datetime.now()
        statuses = [
            LeaseStatus.DRAFT,
            LeaseStatus.ACTIVE,
            LeaseStatus.EXPIRED,
            LeaseStatus.TERMINATED,
        ]

        for status in statuses:
            lease = Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name=f"Tenant with {status.value}",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                status=status,
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )
            assert lease.status == status

    def test_default_status_is_draft(self):
        """Test that default status is DRAFT."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="New Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        assert lease.status == LeaseStatus.DRAFT

    def test_invalid_status_rejected(self):
        """Test that invalid status is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError):
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="Invalid Status Tenant",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                status="invalid_status",
                recovery_profile=create_valid_recovery_profile(),
                created_at=now,
                updated_at=now,
            )


class TestEmbeddedRecoveryProfile:
    """Tests for embedded recovery_profile."""

    def test_recovery_profile_required(self):
        """Test that recovery_profile is required."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="No Profile Tenant",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                created_at=now,
                updated_at=now,
            )

        assert "recovery_profile" in str(exc_info.value)

    def test_recovery_profile_with_cap(self):
        """Test recovery_profile with cap type and rate."""
        now = datetime.now()
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.08"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
        )

        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Capped Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=profile,
            created_at=now,
            updated_at=now,
        )

        assert lease.recovery_profile.cap_type == CapType.CUMULATIVE
        assert lease.recovery_profile.cap_rate == Decimal("0.05")

    def test_recovery_profile_with_exclusions(self):
        """Test recovery_profile with excluded pools."""
        now = datetime.now()
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
            excluded_pools=[PoolType.CAPITAL, PoolType.OTHER],
        )

        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Exclusions Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=profile,
            created_at=now,
            updated_at=now,
        )

        assert PoolType.CAPITAL in lease.recovery_profile.excluded_pools
        assert PoolType.OTHER in lease.recovery_profile.excluded_pools

    def test_invalid_recovery_profile_rejected(self):
        """Test that invalid recovery_profile is rejected."""
        # Cap type requires cap_rate
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.05"),
                cap_type=CapType.CUMULATIVE,
                # Missing cap_rate
            )


class TestDocumentUrl:
    """Tests for document_url field."""

    def test_valid_url(self):
        """Test valid S3 URL."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="S3 Doc Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            document_url="https://my-bucket.s3.amazonaws.com/leases/doc.pdf",
            created_at=now,
            updated_at=now,
        )

        assert "s3.amazonaws.com" in lease.document_url

    def test_url_max_length(self):
        """Test URL maximum length of 2048 characters."""
        now = datetime.now()
        # Create a URL that's exactly 2048 characters
        base_url = "https://example.com/"
        path = "x" * (2048 - len(base_url))
        long_url = base_url + path

        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="Long URL Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            document_url=long_url,
            created_at=now,
            updated_at=now,
        )

        assert len(lease.document_url) == 2048

    def test_url_over_max_length_rejected(self):
        """Test URL over 2048 characters is rejected."""
        now = datetime.now()
        long_url = "https://example.com/" + "x" * 2040

        with pytest.raises(ValidationError) as exc_info:
            Lease(
                id=uuid4(),
                property_id=uuid4(),
                tenant_name="Too Long URL Tenant",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                recovery_profile=create_valid_recovery_profile(),
                document_url=long_url,
                created_at=now,
                updated_at=now,
            )

        assert "document_url" in str(exc_info.value)


class TestLeaseCreate:
    """Tests for LeaseCreate DTO."""

    def test_create_with_all_fields(self):
        """Test creating with all fields."""
        create = LeaseCreate(
            property_id=uuid4(),
            unit_id=uuid4(),
            tenant_name="New Tenant Inc.",
            start_date=date(2024, 1, 1),
            end_date=date(2027, 12, 31),
            status=LeaseStatus.ACTIVE,
            recovery_profile=create_valid_recovery_profile(),
            document_url="https://example.com/lease.pdf",
        )

        assert create.tenant_name == "New Tenant Inc."
        assert create.status == LeaseStatus.ACTIVE

    def test_create_with_minimal_fields(self):
        """Test creating with minimal required fields."""
        create = LeaseCreate(
            property_id=uuid4(),
            tenant_name="Minimal Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
        )

        assert create.unit_id is None
        assert create.status == LeaseStatus.DRAFT
        assert create.document_url is None

    def test_create_validates_dates(self):
        """Test that create validates end_date > start_date."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseCreate(
                property_id=uuid4(),
                tenant_name="Invalid Date Tenant",
                start_date=date(2024, 12, 31),
                end_date=date(2024, 1, 1),
                recovery_profile=create_valid_recovery_profile(),
            )

        assert "End date must be after start date" in str(exc_info.value)

    def test_create_requires_property_id(self):
        """Test that property_id is required."""
        with pytest.raises(ValidationError) as exc_info:
            LeaseCreate(
                tenant_name="No Property Tenant",
                start_date=date(2024, 1, 1),
                end_date=date(2025, 12, 31),
                recovery_profile=create_valid_recovery_profile(),
            )

        assert "property_id" in str(exc_info.value)


class TestLeaseUpdate:
    """Tests for LeaseUpdate DTO."""

    def test_update_all_fields_optional(self):
        """Test that all fields are optional for updates."""
        update = LeaseUpdate()
        assert update.tenant_name is None
        assert update.start_date is None
        assert update.end_date is None
        assert update.status is None
        assert update.recovery_profile is None
        assert update.unit_id is None
        assert update.document_url is None

    def test_update_partial_tenant_name(self):
        """Test partial update with just tenant_name."""
        update = LeaseUpdate(tenant_name="Updated Tenant Name")
        assert update.tenant_name == "Updated Tenant Name"
        assert update.status is None

    def test_update_partial_status(self):
        """Test partial update with just status."""
        update = LeaseUpdate(status=LeaseStatus.TERMINATED)
        assert update.status == LeaseStatus.TERMINATED
        assert update.tenant_name is None

    def test_update_partial_recovery_profile(self):
        """Test partial update with recovery_profile changes."""
        profile_update = LeaseRecoveryProfileUpdate(
            pro_rata_share=Decimal("0.08"),
        )
        update = LeaseUpdate(recovery_profile=profile_update)
        assert update.recovery_profile.pro_rata_share == Decimal("0.08")

    def test_update_validates_tenant_name_length(self):
        """Test update validates tenant_name constraints."""
        with pytest.raises(ValidationError):
            LeaseUpdate(tenant_name="")

        with pytest.raises(ValidationError):
            LeaseUpdate(tenant_name="A" * 256)

    def test_update_dates_not_cross_validated(self):
        """Test that update doesn't cross-validate dates (deferred to service)."""
        # This should not raise - cross-validation deferred to service layer
        update = LeaseUpdate(
            start_date=date(2025, 12, 31),
            end_date=date(2024, 1, 1),
        )
        # Both values are set, even though they're invalid together
        assert update.start_date == date(2025, 12, 31)
        assert update.end_date == date(2024, 1, 1)


class TestLeaseSummary:
    """Tests for LeaseSummary view model."""

    def test_summary_contains_essential_fields(self):
        """Test summary contains essential display fields."""
        summary = LeaseSummary(
            id=uuid4(),
            property_id=uuid4(),
            unit_id=uuid4(),
            tenant_name="Summary Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            status=LeaseStatus.ACTIVE,
        )

        assert summary.tenant_name == "Summary Tenant"
        assert summary.status == LeaseStatus.ACTIVE

    def test_summary_unit_id_optional(self):
        """Test summary with no unit_id."""
        summary = LeaseSummary(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="No Unit Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            status=LeaseStatus.DRAFT,
        )

        assert summary.unit_id is None


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self):
        """Test serialization to dictionary."""
        now = datetime.now()
        lease_id = uuid4()
        property_id = uuid4()

        lease = Lease(
            id=lease_id,
            property_id=property_id,
            tenant_name="Serialization Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        data = lease.model_dump()
        assert data["id"] == lease_id
        assert data["property_id"] == property_id
        assert data["tenant_name"] == "Serialization Tenant"
        assert "recovery_profile" in data
        assert data["recovery_profile"]["pro_rata_share"] == Decimal("0.05")

    def test_to_json(self):
        """Test serialization to JSON."""
        now = datetime.now()
        lease = Lease(
            id=uuid4(),
            property_id=uuid4(),
            tenant_name="JSON Tenant",
            start_date=date(2024, 1, 1),
            end_date=date(2025, 12, 31),
            recovery_profile=create_valid_recovery_profile(),
            created_at=now,
            updated_at=now,
        )

        json_str = lease.model_dump_json()
        assert "JSON Tenant" in json_str
        assert "recovery_profile" in json_str

    def test_from_attributes(self):
        """Test creating from ORM-like object."""

        class MockLease:
            id = uuid4()
            property_id = uuid4()
            unit_id = None
            tenant_name = "ORM Tenant"
            start_date = date(2024, 1, 1)
            end_date = date(2025, 12, 31)
            status = LeaseStatus.ACTIVE
            recovery_profile = {
                "pro_rata_share": Decimal("0.05"),
                "cap_type": "none",
                "admin_fee_percentage": Decimal("0.15"),
                "gross_up_base_year": False,
                "excluded_pools": [],
            }
            document_url = None
            created_at = datetime.now()
            updated_at = datetime.now()

        lease = Lease.model_validate(MockLease())
        assert lease.tenant_name == "ORM Tenant"
        assert lease.recovery_profile.pro_rata_share == Decimal("0.05")


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self):
        """Test importing from app.models package."""
        from app.models import (
            Lease,
            LeaseCreate,
            LeaseSummary,
            LeaseUpdate,
        )

        assert Lease is not None
        assert LeaseCreate is not None
        assert LeaseSummary is not None
        assert LeaseUpdate is not None
