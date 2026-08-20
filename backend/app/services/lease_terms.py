"""Lease term version service for CRUD and temporal lookups.

Manages versioned recovery terms with effective-date semantics.
Each lease can have multiple term versions; the calculation engine
looks up the one effective during the reconciliation period.
"""

from datetime import date
from uuid import UUID

from app.database.client import SupabaseDB
from app.models.lease_term_version import (
    LeaseTermVersion,
    LeaseTermVersionCreate,
    LeaseTermVersionSummary,
)


class LeaseTermService:
    """Service for lease term version CRUD operations."""

    def __init__(self, client: SupabaseDB, org_id: UUID) -> None:
        self.client = client
        self.org_id = org_id

    def list_versions(self, lease_id: UUID) -> list[LeaseTermVersionSummary]:
        """List all term versions for a lease, ordered by effective date."""
        result = (
            self.client.table("lease_term_versions")
            .select(
                "id, version_number, effective_date,"
                " pro_rata_share, cap_type,"
                " amendment_reason, created_at"
            )
            .eq("lease_id", str(lease_id))
            .order("effective_date", desc=True)
            .execute()
        )
        return [LeaseTermVersionSummary(**row) for row in result.data]

    def get_version(
        self, version_id: UUID, lease_id: UUID | None = None
    ) -> LeaseTermVersion | None:
        """Get a specific term version by ID."""
        query = (
            self.client.table("lease_term_versions")
            .select("*")
            .eq("id", str(version_id))
        )
        if lease_id is not None:
            query = query.eq("lease_id", str(lease_id))
        result = query.execute()
        if not result.data:
            return None
        return LeaseTermVersion(**result.data[0])

    def get_effective_terms(
        self, lease_id: UUID, as_of_date: date
    ) -> LeaseTermVersion | None:
        """Find the term version effective on a given date.

        Returns the version with the largest effective_date <= as_of_date.
        """
        result = (
            self.client.table("lease_term_versions")
            .select("*")
            .eq("lease_id", str(lease_id))
            .lte("effective_date", as_of_date.isoformat())
            .order("effective_date", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return LeaseTermVersion(**result.data[0])

    def create_version(
        self,
        lease_id: UUID,
        data: LeaseTermVersionCreate,
        user_id: UUID,
    ) -> LeaseTermVersion:
        """Create a new term version, auto-incrementing version_number."""
        # Determine next version number
        max_result = (
            self.client.table("lease_term_versions")
            .select("version_number")
            .eq("lease_id", str(lease_id))
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
        next_version = (
            (max_result.data[0]["version_number"] + 1) if max_result.data else 1
        )

        row = {
            "lease_id": str(lease_id),
            "version_number": next_version,
            "effective_date": data.effective_date.isoformat(),
            "base_year": data.base_year,
            "base_year_amount": (
                str(data.base_year_amount)
                if data.base_year_amount is not None
                else None
            ),
            "gross_up_base_year": data.gross_up_base_year,
            "pro_rata_share": str(data.pro_rata_share),
            "cap_type": data.cap_type,
            "cap_rate": str(data.cap_rate) if data.cap_rate is not None else None,
            "admin_fee_percentage": str(data.admin_fee_percentage),
            "management_fee_percentage": (
                str(data.management_fee_percentage)
                if data.management_fee_percentage is not None
                else None
            ),
            "excluded_pools": data.excluded_pools,
            "rsf_measurement_standard": data.rsf_measurement_standard,
            "rsf_measurement_date": (
                data.rsf_measurement_date.isoformat()
                if data.rsf_measurement_date
                else None
            ),
            "amendment_reason": data.amendment_reason,
            "amendment_document_url": data.amendment_document_url,
            "created_by": str(user_id),
        }

        result = self.client.table("lease_term_versions").insert(row).execute()
        return LeaseTermVersion(**result.data[0])

    def delete_version(self, version_id: UUID, lease_id: UUID | None = None) -> None:
        """Delete a version. Blocked if referenced by finalized snapshots."""
        # Get the version first
        query = (
            self.client.table("lease_term_versions")
            .select("*")
            .eq("id", str(version_id))
        )
        if lease_id is not None:
            query = query.eq("lease_id", str(lease_id))
        result = query.execute()
        if not result.data:
            raise ValueError(f"Term version {version_id} not found")

        # Check for finalized snapshots referencing this version
        snap_result = (
            self.client.table("reconciliation_snapshots")
            .select("id")
            .eq("term_version_id", str(version_id))
            .eq("status", "finalized")
            .execute()
        )
        if snap_result.data:
            raise ValueError(
                f"Cannot delete term version {version_id}: "
                f"referenced by {len(snap_result.data)} finalized snapshot(s)"
            )

        # Safe to delete
        self.client.table("lease_term_versions").delete().eq(
            "id", str(version_id)
        ).execute()
