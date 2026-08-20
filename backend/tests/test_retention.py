"""Tests for data retention policy configuration.

Pure unit tests — no database connection required.
"""

from app.core.retention import (
    FINANCIAL_RETENTION_YEARS,
    RETENTION_POLICY,
    TRANSIENT_AUTH_EVENT_PURGE_DAYS,
    TRANSIENT_EMAIL_LOG_PURGE_DAYS,
    TRANSIENT_JOB_PURGE_DAYS,
    TRANSIENT_NOTIFICATION_PURGE_DAYS,
    TRANSIENT_WEBHOOK_PURGE_DAYS,
    RetentionCategory,
    RetentionPolicy,
    get_tables_by_category,
)


class TestRetentionCategoryEnum:
    def test_enum_has_three_values(self) -> None:
        assert len(RetentionCategory) == 3

    def test_financial_permanent_value(self) -> None:
        assert RetentionCategory.FINANCIAL_PERMANENT.value == "financial_permanent"

    def test_operational_value(self) -> None:
        assert RetentionCategory.OPERATIONAL.value == "operational"

    def test_transient_value(self) -> None:
        assert RetentionCategory.TRANSIENT.value == "transient"


class TestFinancialPermanentTables:
    FINANCIAL_TABLES = [
        "organizations",
        "users",
        "properties",
        "units",
        "leases",
        "import_batches",
        "gl_entries",
        "reconciliation_snapshots",
        "actual_billed_amounts",
        "expense_pools",
        "pool_mappings",
        "pool_allocations",
        "pool_templates",
        "subscriptions",
        "invoices",
        "audit_log",
        "disputes",
        "dispute_comments",
        "dispute_attachments",
        "audit_requests",
        "column_mappings",
    ]

    def test_all_financial_tables_present(self) -> None:
        financial = get_tables_by_category(RetentionCategory.FINANCIAL_PERMANENT)
        for table in self.FINANCIAL_TABLES:
            assert table in financial, f"Missing financial table: {table}"

    def test_exactly_21_financial_tables(self) -> None:
        financial = get_tables_by_category(RetentionCategory.FINANCIAL_PERMANENT)
        assert len(financial) == 21

    def test_financial_tables_have_10_year_retention(self) -> None:
        for table in self.FINANCIAL_TABLES:
            policy = RETENTION_POLICY[table]
            assert policy.retention_years == 10

    def test_financial_tables_have_no_purge_days(self) -> None:
        for table in self.FINANCIAL_TABLES:
            policy = RETENTION_POLICY[table]
            assert policy.purge_after_days is None

    def test_financial_constant_is_10(self) -> None:
        assert FINANCIAL_RETENTION_YEARS == 10


class TestTransientTables:
    def test_tenant_email_logs_purge_48h(self) -> None:
        policy = RETENTION_POLICY["tenant_email_logs"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_EMAIL_LOG_PURGE_DAYS
        assert TRANSIENT_EMAIL_LOG_PURGE_DAYS == 2

    def test_extraction_jobs_purge_90d(self) -> None:
        policy = RETENTION_POLICY["extraction_jobs"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_JOB_PURGE_DAYS
        assert TRANSIENT_JOB_PURGE_DAYS == 90

    def test_calculation_jobs_purge_90d(self) -> None:
        policy = RETENTION_POLICY["calculation_jobs"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_JOB_PURGE_DAYS

    def test_tenant_notifications_purge_90d(self) -> None:
        policy = RETENTION_POLICY["tenant_notifications"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_NOTIFICATION_PURGE_DAYS
        assert TRANSIENT_NOTIFICATION_PURGE_DAYS == 90

    def test_tenant_notifications_condition_mentions_read(self) -> None:
        policy = RETENTION_POLICY["tenant_notifications"]
        assert "read" in policy.purge_condition.lower()

    def test_stripe_webhook_events_purge_90d(self) -> None:
        policy = RETENTION_POLICY["stripe_webhook_events"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_WEBHOOK_PURGE_DAYS
        assert TRANSIENT_WEBHOOK_PURGE_DAYS == 90

    def test_auth_events_purge_365d(self) -> None:
        policy = RETENTION_POLICY["auth_events"]
        assert policy.category == RetentionCategory.TRANSIENT
        assert policy.purge_after_days == TRANSIENT_AUTH_EVENT_PURGE_DAYS
        assert TRANSIENT_AUTH_EVENT_PURGE_DAYS == 365

    def test_auth_events_condition_uses_timestamp_not_created_at(self) -> None:
        """auth_events uses 'timestamp' column — NOT 'created_at'."""
        policy = RETENTION_POLICY["auth_events"]
        assert "timestamp" in policy.purge_condition
        assert "created_at" not in policy.purge_condition

    def test_tenant_email_logs_condition_uses_sent_at(self) -> None:
        """tenant_email_logs uses 'sent_at' column — NOT 'created_at'."""
        policy = RETENTION_POLICY["tenant_email_logs"]
        assert "sent_at" in policy.purge_condition

    def test_exactly_6_transient_tables(self) -> None:
        transient = get_tables_by_category(RetentionCategory.TRANSIENT)
        assert len(transient) == 6

    def test_transient_tables_have_no_retention_years(self) -> None:
        transient = get_tables_by_category(RetentionCategory.TRANSIENT)
        for table in transient:
            policy = RETENTION_POLICY[table]
            assert policy.retention_years is None

    def test_transient_tables_have_purge_days(self) -> None:
        transient = get_tables_by_category(RetentionCategory.TRANSIENT)
        for table in transient:
            policy = RETENTION_POLICY[table]
            assert policy.purge_after_days is not None


class TestPolicyCompleteness:
    ALL_KNOWN_TABLES = {
        "organizations",
        "users",
        "properties",
        "units",
        "leases",
        "import_batches",
        "gl_entries",
        "reconciliation_snapshots",
        "actual_billed_amounts",
        "expense_pools",
        "pool_mappings",
        "pool_allocations",
        "pool_templates",
        "subscriptions",
        "invoices",
        "audit_log",
        "disputes",
        "dispute_comments",
        "dispute_attachments",
        "audit_requests",
        "column_mappings",
        "tenant_users",
        "tenant_lease_links",
        "tenant_invitations",
        "team_member_invitations",
        "tenant_email_preferences",
        "promotions",
        "promotion_redemptions",
        "feedback",
        "ocr_results",
        "content_leads",
        "tenant_email_logs",
        "extraction_jobs",
        "calculation_jobs",
        "tenant_notifications",
        "stripe_webhook_events",
        "auth_events",
    }

    def test_total_37_tables(self) -> None:
        assert len(RETENTION_POLICY) == 37

    def test_no_unknown_tables(self) -> None:
        unknown = set(RETENTION_POLICY.keys()) - self.ALL_KNOWN_TABLES
        assert not unknown, f"Unexpected tables in policy: {unknown}"

    def test_no_missing_tables(self) -> None:
        missing = self.ALL_KNOWN_TABLES - set(RETENTION_POLICY.keys())
        assert not missing, f"Missing tables from policy: {missing}"

    def test_every_entry_has_legal_basis(self) -> None:
        for table, policy in RETENTION_POLICY.items():
            assert policy.legal_basis, f"{table} is missing a legal_basis"

    def test_financial_tables_have_retention_years_not_purge(self) -> None:
        financial = get_tables_by_category(RetentionCategory.FINANCIAL_PERMANENT)
        for table in financial:
            policy = RETENTION_POLICY[table]
            assert policy.retention_years is not None
            assert policy.purge_after_days is None

    def test_transient_tables_have_purge_not_retention_years(self) -> None:
        transient = get_tables_by_category(RetentionCategory.TRANSIENT)
        for table in transient:
            policy = RETENTION_POLICY[table]
            assert policy.purge_after_days is not None
            assert policy.retention_years is None

    def test_get_tables_by_category_returns_list(self) -> None:
        result = get_tables_by_category(RetentionCategory.OPERATIONAL)
        assert isinstance(result, list)
        assert len(result) == 10

    def test_retention_policy_values_are_retention_policy_instances(self) -> None:
        for table, policy in RETENTION_POLICY.items():
            assert isinstance(
                policy, RetentionPolicy
            ), f"{table} value is not a RetentionPolicy instance"
