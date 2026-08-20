"""
Seed test data for E2E tests.

Creates:
- Test organization
- Test documents in READY_FOR_REVIEW status
- Links to existing test user (test@capveri.com)

Run with: python -m tests.seed_e2e_data
"""

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from supabase import Client

from app.config import settings
from app.database.client import SupabaseClientManager
from tests.fixtures.generators.document_generator import (
    generate_multiple_test_documents,
)

# Test organization ID (fixed UUID for repeatability)
TEST_ORG_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
TEST_ORG_NAME = "E2E Test Organization"


def get_supabase_client() -> Client:
    """Get Supabase client with service role key."""
    print(f"Connecting to Supabase at: {settings.supabase_url}")
    return SupabaseClientManager.get_service_client()


async def seed_organization(supabase: Client):
    """Create or update test organization."""
    print(f"Checking for organization {TEST_ORG_ID}...")

    # Check if org exists
    result = (
        supabase.table("organizations").select("*").eq("id", str(TEST_ORG_ID)).execute()
    )

    if result.data:
        print(f"✓ Organization already exists: {TEST_ORG_NAME}")
        return result.data[0]

    # Create organization
    print(f"Creating organization: {TEST_ORG_NAME}...")
    result = (
        supabase.table("organizations")
        .insert(
            {
                "id": str(TEST_ORG_ID),
                "name": TEST_ORG_NAME,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        .execute()
    )

    print(f"✓ Created organization: {TEST_ORG_NAME}")
    return result.data[0]


async def seed_property(supabase: Client):
    """Create or get test property."""
    from uuid import UUID

    test_property_id = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

    # Check if property exists
    result = (
        supabase.table("properties")
        .select("*")
        .eq("id", str(test_property_id))
        .execute()
    )

    if result.data:
        print("✓ Property already exists")
        return test_property_id

    # Create property
    print("Creating test property...")
    result = (
        supabase.table("properties")
        .insert(
            {
                "id": str(test_property_id),
                "organization_id": str(TEST_ORG_ID),
                "name": "E2E Test Building",
                "address_line1": "123 Test Street",
                "city": "Test City",
                "state": "CA",
                "postal_code": "90210",
                "total_rentable_sqft": 50000,
                "total_usable_sqft": 45000,
                "common_area_sqft": 5000,
                "target_occupancy": 0.95,
            }
        )
        .execute()
    )

    print("✓ Created test property")
    return test_property_id


async def seed_documents(supabase: Client, property_id: UUID, count: int = 5):
    """Create test documents in READY_FOR_REVIEW status."""
    print(f"\nGenerating {count} test documents...")

    # Generate documents using the fixture generator
    documents = generate_multiple_test_documents(TEST_ORG_ID, property_id, count=count)

    # Ensure at least 2 are completed (ready for verification in E2E tests)
    for i in range(min(2, count)):
        documents[i]["status"] = "completed"

    print(f"Inserting {len(documents)} documents into database...")

    # Delete existing test documents first (clean slate)
    supabase.table("documents").delete().eq(
        "organization_id", str(TEST_ORG_ID)
    ).execute()
    print("✓ Cleaned up existing test documents")

    # Insert new documents
    for i, doc in enumerate(documents, 1):
        _ = supabase.table("documents").insert(doc).execute()
        status = doc["status"]
        filename = doc["filename"]
        print(f"  {i}. {filename} ({status})")

    print(f"✓ Inserted {len(documents)} test documents")

    # Show summary
    completed_count = sum(1 for d in documents if d["status"] == "completed")
    print("\nSummary:")
    print(f"  - Total documents: {len(documents)}")
    print(f"  - Completed (ready for verification): {completed_count}")
    print(f"  - Other statuses: {len(documents) - completed_count}")


async def verify_data(supabase: Client):
    """Verify seeded data exists."""
    print("\nVerifying seeded data...")

    # Check organization
    org_result = (
        supabase.table("organizations").select("*").eq("id", str(TEST_ORG_ID)).execute()
    )
    if not org_result.data:
        print("✗ Organization not found!")
        return False
    print(f"✓ Organization exists: {org_result.data[0]['name']}")

    # Check documents
    doc_result = (
        supabase.table("documents")
        .select("*")
        .eq("organization_id", str(TEST_ORG_ID))
        .execute()
    )
    if not doc_result.data:
        print("✗ No documents found!")
        return False
    print(f"✓ Found {len(doc_result.data)} documents")

    # Check completed documents (ready for verification)
    completed_result = (
        supabase.table("documents")
        .select("*")
        .eq("organization_id", str(TEST_ORG_ID))
        .eq("status", "completed")
        .execute()
    )
    completed_count = len(completed_result.data)
    print(f"✓ Found {completed_count} documents ready for verification")

    if completed_count == 0:
        print("⚠ Warning: No documents in COMPLETED status - E2E tests may fail!")
        return False

    return True


async def main():
    """Main seeding function."""
    print("=" * 60)
    print("E2E Test Data Seeding Script")
    print("=" * 60)

    supabase = get_supabase_client()

    try:
        # Seed organization
        await seed_organization(supabase)

        # Seed property
        property_id = await seed_property(supabase)

        # Seed documents
        await seed_documents(supabase, property_id, count=5)

        # Verify
        success = await verify_data(supabase)

        print("\n" + "=" * 60)
        if success:
            print("✓ Test data seeding completed successfully!")
            print("\nYou can now run E2E tests with:")
            print("  cd frontend")
            print("  npm run test:e2e")
        else:
            print("✗ Test data seeding completed with warnings")
            print("  Check output above for issues")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ Error during seeding: {e}")
        import traceback

        traceback.print_exc()
        raise


if __name__ == "__main__":
    asyncio.run(main())
