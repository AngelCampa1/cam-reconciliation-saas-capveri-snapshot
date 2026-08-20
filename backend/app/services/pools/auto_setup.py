"""
Auto-setup expense pools from GL data.

Automatically derives expense pools and pool mappings from GL entry
account codes and descriptions. Uses deterministic keyword matching
on account_description — no LLMs involved.

Applies to ALL GL uploads (not just onboarding). Subsequent uploads
for the same property add mappings for new account codes only.
"""

import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages

logger = logging.getLogger(__name__)

# Keyword → pool category mapping (ordered by specificity).
# Each entry: (keywords, pool_name, pool_type)
# pool_type: "tax", "insurance", "operating", "other"
DESCRIPTION_KEYWORDS: list[tuple[list[str], str, str]] = [
    # Taxes (check before "insurance" since "taxes & insurance" is common)
    (
        ["tax", "assessment", "hcad", "municipal"],
        "Real Estate Taxes",
        "tax",
    ),
    # Insurance
    (
        ["insurance", "liability", "hazard", "premium"],
        "Insurance",
        "insurance",
    ),
    # Utilities
    (
        ["electric", "utility", "water", "sewer", "gas", "energy"],
        "Utilities",
        "operating",
    ),
    # R&M
    (
        ["hvac", "elevator", "plumbing", "electrical", "repair", "maintenance", "r&m"],
        "Repairs & Maintenance",
        "operating",
    ),
    # Janitorial
    (
        ["janitor", "cleaning", "custod", "window wash"],
        "Janitorial",
        "operating",
    ),
    # Landscaping
    (
        ["landscap", "lawn", "snow", "parking lot", "sweeping"],
        "Grounds & Parking",
        "operating",
    ),
    # Security
    (
        ["security", "guard", "alarm", "access control"],
        "Security",
        "operating",
    ),
    # Fire/Life Safety
    (
        ["fire", "life safety", "sprinkler"],
        "Fire & Life Safety",
        "operating",
    ),
    # Management
    (
        ["management fee", "admin", "office expense"],
        "Management Fee",
        "operating",
    ),
    # Payroll
    (
        ["payroll", "salary", "wages", "engineer"],
        "Building Payroll",
        "operating",
    ),
    # Professional fees
    (
        ["legal", "professional", "accounting", "audit"],
        "Professional Fees",
        "other",
    ),
    # Leasing (non-recoverable)
    (
        ["leasing", "commission", "marketing", "tenant improvement"],
        "Non-Recoverable",
        "other",
    ),
    # Software (non-recoverable)
    (
        ["software", "subscription", "saas", "tech"],
        "Non-Recoverable",
        "other",
    ),
]

# Pool types that are recoverable from tenants
RECOVERABLE_TYPES = {"tax", "insurance", "operating"}

# Default gross-up target for recoverable pools (standard CRE default)
DEFAULT_GROSS_UP_TARGET = Decimal("0.95")


@dataclass
class AutoSetupResult:
    """Result of auto-setup operation."""

    pools_created: int = 0
    mappings_created: int = 0
    classification_summary: dict[str, list[str]] = field(default_factory=dict)


def classify_account(account_description: str) -> tuple[str, str]:
    """
    Classify an account by its description using keyword matching.

    Returns:
        Tuple of (pool_name, pool_type)
    """
    desc_lower = account_description.lower()

    for keywords, pool_name, pool_type in DESCRIPTION_KEYWORDS:
        for keyword in keywords:
            if keyword in desc_lower:
                return pool_name, pool_type

    return "Other Operating", "operating"


def auto_setup_pools_from_gl(
    property_id: UUID,
    batch_id: UUID,
    organization_id: UUID,
    supabase: Any | None = None,
) -> AutoSetupResult:
    """
    Auto-create expense pools and mappings from GL entry data.

    Reads unique (account_code, account_description) pairs from gl_entries
    for the given batch, classifies each by keyword matching, and creates
    expense pools + pool mappings. Idempotent — won't duplicate existing
    pools or mappings.

    Args:
        property_id: Property these GL entries belong to
        batch_id: Import batch to read GL entries from
        organization_id: Organization context
        supabase: Optional Supabase client (defaults to admin client)

    Returns:
        AutoSetupResult with counts and classification summary
    """
    if supabase is None:
        supabase = get_supabase_admin()

    result = AutoSetupResult()

    # 1. Query unique (account_code, account_description) pairs from gl_entries
    gl_rows = fetch_all_pages(
        lambda: supabase.table("gl_entries")
        .select("account_code, account_description")
        .eq("import_batch_id", str(batch_id))
    )

    if not gl_rows:
        logger.info(
            "No GL entries found for batch %s, skipping pool auto-setup", batch_id
        )
        return result

    # Deduplicate account_code/description pairs
    seen_codes: set[str] = set()
    unique_accounts: list[tuple[str, str]] = []
    for row in gl_rows:
        code = str(row.get("account_code", "")).strip()
        desc = str(row.get("account_description", "")).strip()
        if code and code not in seen_codes:
            seen_codes.add(code)
            unique_accounts.append((code, desc))

    if not unique_accounts:
        return result

    # 2. Fetch existing expense pools for this property
    existing_pools_result = (
        supabase.table("expense_pools")
        .select("id, name")
        .eq("property_id", str(property_id))
        .execute()
    )
    existing_pool_names: dict[str, str] = {}
    for pool in existing_pools_result.data or []:
        existing_pool_names[pool["name"]] = pool["id"]

    # 3. Fetch existing pool mappings via expense pools for this property
    existing_pool_ids = list(existing_pool_names.values())
    existing_patterns: set[str] = set()
    if existing_pool_ids:
        existing_mappings_result = (
            supabase.table("pool_mappings")
            .select("gl_account_pattern")
            .in_("expense_pool_id", existing_pool_ids)
            .execute()
        )
        existing_patterns = {
            row["gl_account_pattern"] for row in (existing_mappings_result.data or [])
        }

    # 4. Classify each account and group by pool name
    pool_accounts: dict[str, list[tuple[str, str]]] = {}
    pool_types: dict[str, str] = {}

    for code, desc in unique_accounts:
        pool_name, pool_type = classify_account(desc)
        if pool_name not in pool_accounts:
            pool_accounts[pool_name] = []
            pool_types[pool_name] = pool_type
        pool_accounts[pool_name].append((code, desc))

    # 5. Create pools that don't exist yet
    for pool_name, accounts in pool_accounts.items():
        pool_type = pool_types[pool_name]
        is_recoverable = pool_type in RECOVERABLE_TYPES

        if pool_name not in existing_pool_names:
            pool_data = {
                "property_id": str(property_id),
                "name": pool_name,
                "pool_type": pool_type,
                "is_gross_up_applicable": is_recoverable,
            }
            if is_recoverable:
                pool_data["gross_up_target"] = str(DEFAULT_GROSS_UP_TARGET)

            insert_result = supabase.table("expense_pools").insert(pool_data).execute()

            if insert_result.data:
                pool_id = insert_result.data[0]["id"]
                existing_pool_names[pool_name] = pool_id
                result.pools_created += 1

        # Build classification summary
        result.classification_summary[pool_name] = [code for code, _ in accounts]

    # 6. Create mappings for unmapped account codes
    for pool_name, accounts in pool_accounts.items():
        pool_id = existing_pool_names.get(pool_name)
        if not pool_id:
            continue

        for code, _ in accounts:
            if code not in existing_patterns:
                supabase.table("pool_mappings").insert(
                    {
                        "expense_pool_id": pool_id,
                        "gl_account_pattern": code,
                    }
                ).execute()
                existing_patterns.add(code)
                result.mappings_created += 1

    logger.info(
        "Auto-setup pools for property %s: %d pools created, %d mappings created",
        property_id,
        result.pools_created,
        result.mappings_created,
    )

    return result
