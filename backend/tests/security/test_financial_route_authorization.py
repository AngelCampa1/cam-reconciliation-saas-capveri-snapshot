"""Regression tests for high-impact financial mutation route authorization."""

from pathlib import Path

BACKEND_ROOT = Path(__file__).parent.parent.parent
API_DIR = BACKEND_ROOT / "app" / "api" / "v1"


def _decorator_for_function(relative_path: str, function_name: str) -> str:
    content = (API_DIR / relative_path).read_text()
    function_start = content.index(f"async def {function_name}(")
    decorator_start = content.rfind("@router.", 0, function_start)
    assert decorator_start != -1, f"Missing route decorator for {function_name}"
    return content[decorator_start:function_start]


def _function_body(relative_path: str, function_name: str) -> str:
    content = (API_DIR / relative_path).read_text()
    function_start = content.index(f"async def {function_name}(")
    next_function = content.find("\nasync def ", function_start + 1)
    if next_function == -1:
        return content[function_start:]
    return content[function_start:next_function]


def test_money_back_guarantee_claim_requires_owner() -> None:
    decorator = _decorator_for_function("billing.py", "claim_money_back_guarantee")
    assert "Depends(require_org_owner)" in decorator


def test_property_and_unit_mutations_require_editor_or_admin() -> None:
    for function_name in [
        "create_property",
        "update_property",
        "create_unit",
        "update_unit",
        "delete_unit",
    ]:
        relative_path = "properties.py" if "property" in function_name else "units.py"
        decorator = _decorator_for_function(relative_path, function_name)
        assert "Depends(require_org_editor)" in decorator

    delete_property_route = _decorator_for_function("properties.py", "delete_property")
    assert "@router.delete" in delete_property_route
    assert "admin: CurrentAdminUser" in _function_body(
        "properties.py", "delete_property"
    )


def test_ingestion_mutations_require_editor_or_admin() -> None:
    editor_functions = ["upload_file"]
    admin_functions = [
        "retry_import_batch",
        "delete_import_batch",
        "create_column_mapping",
    ]

    for function_name in editor_functions:
        decorator = _decorator_for_function("ingestion.py", function_name)
        assert "Depends(require_org_editor)" in decorator

    for function_name in admin_functions:
        decorator = _decorator_for_function("ingestion.py", function_name)
        assert "Depends(require_org_admin)" in decorator


def test_property_unit_ingestion_mutations_require_full_access() -> None:
    """Read-only paywall lock: every property/unit/ingestion mutation is gated
    by ``require_full_access`` so an expired/paused trial cannot write data."""
    property_unit_mutations = {
        "properties.py": ["create_property", "update_property", "delete_property"],
        "units.py": ["create_unit", "update_unit", "delete_unit"],
        "ingestion.py": [
            "upload_file",
            "apply_batch_mapping",
            "retry_import_batch",
            "delete_import_batch",
            "create_column_mapping",
        ],
    }
    for relative_path, function_names in property_unit_mutations.items():
        for function_name in function_names:
            decorator = _decorator_for_function(relative_path, function_name)
            assert (
                "Depends(require_full_access)" in decorator
            ), f"{relative_path}:{function_name} is missing the read-only paywall gate"


def test_reconciliation_mutations_require_editor_or_admin() -> None:
    for function_name in [
        "start_reconciliation",
        "update_reconciliation_cell",
    ]:
        actual_name = (
            "calculate_reconciliation"
            if function_name == "start_reconciliation"
            else function_name
        )
        decorator = _decorator_for_function("reconciliation.py", actual_name)
        assert "Depends(require_org_editor)" in decorator

    for function_name in [
        "finalize_snapshot",
        "finalize_snapshots_batch",
    ]:
        decorator = _decorator_for_function("reconciliation.py", function_name)
        assert "Depends(require_org_admin)" in decorator


def test_compliance_workflow_mutations_require_editor() -> None:
    for function_name in [
        "create_sb1103_request",
        "update_sb1103_request",
        "export_sb1103_request",
    ]:
        decorator = _decorator_for_function("compliance.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_campaign_transitions_require_editor_or_admin() -> None:
    editor_functions = ["submit_for_review", "reject_campaign"]
    admin_functions = ["approve_campaign", "mark_sent"]

    for function_name in editor_functions:
        decorator = _decorator_for_function("campaigns.py", function_name)
        assert "Depends(require_org_editor)" in decorator

    for function_name in admin_functions:
        decorator = _decorator_for_function("campaigns.py", function_name)
        assert "Depends(require_org_admin)" in decorator


def test_analysis_mutations_require_editor() -> None:
    for function_name in [
        "run_gl_narrative",
        "dismiss_gl_narrative",
        "run_capex_classification",
        "review_capex_flag",
        "bulk_review_capex_flags",
    ]:
        decorator = _decorator_for_function("analysis.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_document_storage_mutations_require_editor() -> None:
    for function_name in ["upload_document", "delete_document"]:
        decorator = _decorator_for_function("documents.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_lease_mutations_require_editor() -> None:
    for function_name in [
        "create_lease",
        "update_lease",
        "update_recovery_profile",
    ]:
        decorator = _decorator_for_function("leases.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_lease_term_version_creation_requires_editor() -> None:
    decorator = _decorator_for_function("lease_term_versions.py", "create_term_version")
    assert "Depends(require_org_editor)" in decorator


def test_expense_pool_mutations_require_editor() -> None:
    for function_name in [
        "create_expense_pool",
        "update_expense_pool",
        "delete_expense_pool",
    ]:
        decorator = _decorator_for_function("expense_pools.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_pool_mapping_mutations_require_editor() -> None:
    for function_name in [
        "create_pool_mapping",
        "update_pool_mapping",
        "delete_pool_mapping",
    ]:
        decorator = _decorator_for_function("pool_mappings.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_pool_allocation_mutations_require_editor() -> None:
    for function_name in [
        "create_pool_allocation",
        "update_pool_allocation",
        "delete_pool_allocation",
    ]:
        decorator = _decorator_for_function("pool_allocations.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_pool_template_mutations_require_editor() -> None:
    for function_name in [
        "create_template",
        "update_template",
        "delete_template",
        "apply_template",
        "copy_pools",
    ]:
        decorator = _decorator_for_function("pool_templates.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_actual_billed_mutations_require_editor() -> None:
    for function_name in [
        "upload_billing_file",
        "create_manual_billing",
        "delete_billed_amounts",
    ]:
        decorator = _decorator_for_function("actual_billed.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_extraction_state_mutations_require_editor() -> None:
    for function_name in [
        "process_extraction",
        "approve_extraction",
        "save_draft",
        "reject_extraction",
        "retry_job",
    ]:
        decorator = _decorator_for_function("extraction.py", function_name)
        assert "Depends(require_org_editor)" in decorator


def test_cross_doc_mutations_require_editor() -> None:
    for function_name in [
        "trigger_cross_doc_analysis",
        "decide_finding",
        "update_auditor_config",
        "update_auditor_overrides",
    ]:
        decorator = _decorator_for_function("cross_doc_analysis.py", function_name)
        assert "Depends(require_org_editor)" in decorator
