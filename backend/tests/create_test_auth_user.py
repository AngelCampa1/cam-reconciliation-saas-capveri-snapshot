"""
Create E2E test authentication user in Supabase.
"""

from uuid import UUID

from supabase import Client

from app.database.client import SupabaseClientManager

TEST_USER_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
TEST_ORG_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
TEST_EMAIL = "test@capveri.com"
TEST_PASSWORD = "Test1234!"


def create_test_user():
    """Create test user in Supabase Auth."""
    print("Creating E2E test user in Supabase Auth...")

    client: Client = SupabaseClientManager.get_service_client()

    try:
        # Create auth user using Supabase Admin API
        result = client.auth.admin.create_user(
            {
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "email_confirm": True,
                "user_metadata": {"full_name": "E2E Test User"},
            }
        )

        print(f"[OK] Created auth user: {TEST_EMAIL}")
        print(f"  User ID: {result.user.id}")

        # Create corresponding public.users record
        _ = (
            client.table("users")
            .upsert(
                {
                    "id": str(result.user.id),
                    "organization_id": str(TEST_ORG_ID),
                    "email": TEST_EMAIL,
                    "full_name": "E2E Test User",
                    "role": "admin",
                }
            )
            .execute()
        )

        print("[OK] Created public.users record")

    except Exception as e:
        # User might already exist
        if "already been registered" in str(e) or "duplicate" in str(e).lower():
            print(f"[OK] User already exists: {TEST_EMAIL}")
        else:
            print(f"[ERROR] Error: {e}")
            raise


if __name__ == "__main__":
    create_test_user()
