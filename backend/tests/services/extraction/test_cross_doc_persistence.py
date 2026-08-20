"""Tests for cross_doc_persistence functions."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.extraction.cross_doc_models import CrossDocAnalysisResult
from app.services.extraction.cross_doc_persistence import (
    get_accepted_advisories,
    get_accepted_overrides,
    save_analysis,
    update_finding_decision,
)


def _make_result(
    property_id=None, period_year=2024, findings=None
) -> CrossDocAnalysisResult:
    return CrossDocAnalysisResult(
        property_id=property_id or uuid4(),
        period_year=period_year,
        findings=findings or [],
        overall_risk_score=20,
        analysis_summary="Test.",
        token_usage=500,
    )


def _make_db_for_save() -> MagicMock:
    db = MagicMock()
    new_id = str(uuid4())
    db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": new_id}]
    )
    return db, new_id


# ---------------------------------------------------------------------------
# save_analysis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_analysis_inserts_row() -> None:
    db, new_id = _make_db_for_save()
    result = _make_result()
    org_id = uuid4()

    returned_id = await save_analysis(db, result, org_id)
    assert returned_id == new_id
    db.table.assert_called_with("cross_doc_analyses")
    db.table.return_value.insert.assert_called_once()
    call_kwargs = db.table.return_value.insert.call_args[0][0]
    assert call_kwargs["status"] == "pending"
    assert call_kwargs["organization_id"] == str(org_id)
    assert call_kwargs["property_id"] == str(result.property_id)
    assert call_kwargs["period_year"] == 2024


@pytest.mark.asyncio
async def test_save_analysis_empty_data_returns_empty_string() -> None:
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    result = _make_result()
    org_id = uuid4()
    returned_id = await save_analysis(db, result, org_id)
    assert returned_id == ""


# ---------------------------------------------------------------------------
# update_finding_decision
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_finding_decision_merges_decisions() -> None:
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    # RPC returns the merged decisions
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Confirmed by auditor",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # _maybe_advance_status SELECT (no findings → no status advance)
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": {"findings": []}}
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Confirmed by auditor"
    )

    # Verify RPC was called with correct params
    db.rpc.assert_called_once()
    rpc_call = db.rpc.call_args
    assert rpc_call[0][0] == "merge_finding_decision"
    params = rpc_call[0][1]
    assert params["p_finding_id"] == finding_id
    assert params["p_decision"]["decision"] == "accepted"
    assert params["p_decision"]["decided_at"] is not None


# ---------------------------------------------------------------------------
# get_accepted_overrides
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_accepted_overrides_returns_accepted_only() -> None:
    prop_id = uuid4()
    org_id = uuid4()
    finding_id_accepted = str(uuid4())
    finding_id_dismissed = str(uuid4())
    override = {
        "field_name": "cap_rate",
        "lease_id": str(uuid4()),
        "current_value": "0.05",
        "suggested_value": "0.03",
        "reasoning": "Amendment reduces rate",
        "confidence": 88,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [
                        {
                            "id": finding_id_accepted,
                            "category": "term_override",
                            "severity": "warning",
                            "title": "Cap rate mismatch",
                            "detail": "...",
                            "affected_leases": [],
                            "affected_pools": [],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": override,
                        },
                        {
                            "id": finding_id_dismissed,
                            "category": "billing_anomaly",
                            "severity": "info",
                            "title": "High vendor spend",
                            "detail": "...",
                            "affected_leases": [],
                            "affected_pools": [],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": None,
                        },
                    ],
                    "lease_term_overrides": [],
                },
                "finding_decisions": {
                    finding_id_accepted: {
                        "decision": "accepted",
                        "reason": "Confirmed",
                    },
                    finding_id_dismissed: {
                        "decision": "dismissed",
                        "reason": "False positive",
                    },
                },
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert len(overrides) == 1
    assert overrides[0].field_name == "cap_rate"


@pytest.mark.asyncio
async def test_get_accepted_overrides_empty_when_none_accepted() -> None:
    prop_id = uuid4()
    org_id = uuid4()
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert overrides == []


# ---------------------------------------------------------------------------
# get_accepted_advisories
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_accepted_advisories_excludes_override_findings() -> None:
    prop_id = uuid4()
    org_id = uuid4()
    advisory_id = str(uuid4())
    override_finding_id = str(uuid4())

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [
                        {
                            "id": advisory_id,
                            "category": "billing_anomaly",
                            "severity": "warning",
                            "title": "High mgmt fee",
                            "detail": "Fee > 5%",
                            "affected_leases": [],
                            "affected_pools": ["CAM"],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": None,
                        },
                        {
                            "id": override_finding_id,
                            "category": "term_override",
                            "severity": "critical",
                            "title": "Cap rate wrong",
                            "detail": "...",
                            "affected_leases": ["lease-1"],
                            "affected_pools": [],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": {
                                "field_name": "cap_rate",
                                "lease_id": str(uuid4()),
                                "current_value": "0.05",
                                "suggested_value": "0.03",
                                "reasoning": "x",
                                "confidence": 90,
                            },
                        },
                    ],
                    "lease_term_overrides": [],
                },
                "finding_decisions": {
                    advisory_id: {"decision": "accepted", "reason": "Confirmed"},
                    override_finding_id: {
                        "decision": "accepted",
                        "reason": "Confirmed",
                    },
                },
            }
        ]
    )

    advisories = await get_accepted_advisories(db, prop_id, 2024, org_id)
    # Only advisory (no override_suggestion) should be returned
    assert len(advisories) == 1
    assert advisories[0].title == "High mgmt fee"


@pytest.mark.asyncio
async def test_get_accepted_advisories_returns_empty_list_when_no_rows() -> None:
    prop_id = uuid4()
    org_id = uuid4()
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )
    advisories = await get_accepted_advisories(db, prop_id, 2024, org_id)
    assert advisories == []


# ---------------------------------------------------------------------------
# _maybe_advance_status: already reviewed / all decided
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_finding_decision_advances_to_reviewed_when_all_decided() -> None:
    """When all findings have decisions, status advances to reviewed."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    # RPC returns merged decisions with the one finding decided
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "All decided",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # _maybe_advance_status SELECT returns analysis with one finding (same finding_id)
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={
            "status": "pending",
            "findings": {"findings": [{"id": finding_id, "override_suggestion": None}]},
        }
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "All decided"
    )

    # status should have been advanced to reviewed
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    assert any(p.get("status") == "reviewed" for p in update_payloads)


@pytest.mark.asyncio
async def test_update_finding_decision_skips_advance_when_already_reviewed() -> None:
    """_maybe_advance_status is a no-op when status is already reviewed."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Already reviewed",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={
            "status": "reviewed",
            "findings": {"findings": [{"id": finding_id}]},
        }
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Already reviewed"
    )

    # No status update should have been called (already reviewed)
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    assert not any("status" in p for p in update_payloads)


# ---------------------------------------------------------------------------
# get_accepted_overrides: top-level lease_term_overrides path + invalid parse
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_accepted_overrides_skips_invalid_override_suggestion() -> None:
    """Invalid override_suggestion dict logs warning and continues."""
    prop_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [
                        {
                            "id": finding_id,
                            "category": "term_override",
                            "severity": "warning",
                            "title": "Bad override",
                            "detail": "...",
                            "affected_leases": [],
                            "affected_pools": [],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": {"invalid": "data"},
                        }
                    ],
                    "lease_term_overrides": [],
                },
                "finding_decisions": {
                    finding_id: {"decision": "accepted", "reason": "ok"}
                },
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    # Invalid override_suggestion → exception swallowed, empty result
    assert overrides == []


@pytest.mark.asyncio
async def test_get_accepted_overrides_top_level_with_finding_ref() -> None:
    """Top-level lease_term_overrides with finding_id reference are collected."""
    prop_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())
    override_data = {
        "finding_id": finding_id,
        "field_name": "base_year",
        "lease_id": str(uuid4()),
        "current_value": "2020",
        "suggested_value": "2021",
        "reasoning": "Amendment",
        "confidence": 80,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [],
                    "lease_term_overrides": [override_data],
                },
                "finding_decisions": {
                    finding_id: {"decision": "accepted", "reason": "ok"}
                },
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert len(overrides) == 1
    assert overrides[0].field_name == "base_year"


@pytest.mark.asyncio
async def test_get_accepted_overrides_top_level_skips_empty_finding_ref() -> None:
    """Top-level override with no finding_id is skipped."""
    prop_id = uuid4()
    org_id = uuid4()
    override_data = {
        # no finding_id field
        "field_name": "base_year",
        "lease_id": str(uuid4()),
        "current_value": "2020",
        "suggested_value": "2021",
        "reasoning": "x",
        "confidence": 80,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [],
                    "lease_term_overrides": [override_data],
                },
                "finding_decisions": {},
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert overrides == []


@pytest.mark.asyncio
async def test_get_accepted_overrides_skips_override_with_missing_finding_id_key() -> (
    None
):
    """Top-level override with the 'finding_id' key entirely absent is skipped."""
    prop_id = uuid4()
    org_id = uuid4()
    override_data = {
        # "finding_id" key is entirely absent (not just empty string)
        "field_name": "pro_rata_share",
        "lease_id": str(uuid4()),
        "current_value": "0.10",
        "suggested_value": "0.15",
        "reasoning": "Mismatch detected",
        "confidence": 70,
    }
    assert "finding_id" not in override_data  # guard: key must truly be absent

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [],
                    "lease_term_overrides": [override_data],
                },
                "finding_decisions": {},
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert overrides == []


@pytest.mark.asyncio
async def test_get_accepted_overrides_accepted_finding_without_override_skipped() -> (
    None
):
    """Accepted finding with override_suggestion=None is skipped in overrides list."""
    prop_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [
                        {
                            "id": finding_id,
                            "category": "billing_anomaly",
                            "severity": "info",
                            "title": "High fee",
                            "detail": "...",
                            "affected_leases": [],
                            "affected_pools": [],
                            "financial_impact_estimate": None,
                            "source_documents": [],
                            "override_suggestion": None,  # no override
                        }
                    ],
                    "lease_term_overrides": [],
                },
                "finding_decisions": {
                    finding_id: {"decision": "accepted", "reason": "ok"}
                },
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert overrides == []  # no override_suggestion → nothing returned


@pytest.mark.asyncio
async def test_get_accepted_overrides_top_level_not_accepted_skipped() -> None:
    """Top-level lease_term_overrides with non-accepted decision are skipped."""
    prop_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())
    override_data = {
        "finding_id": finding_id,
        "field_name": "cap_rate",
        "lease_id": str(uuid4()),
        "current_value": "0.05",
        "suggested_value": "0.03",
        "reasoning": "x",
        "confidence": 75,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [],
                    "lease_term_overrides": [override_data],
                },
                "finding_decisions": {
                    finding_id: {"decision": "dismissed", "reason": "false positive"}
                },
            }
        ]
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, org_id)
    assert overrides == []


@pytest.mark.asyncio
async def test_get_accepted_advisories_skips_invalid_finding_parse() -> None:
    """Malformed finding dicts log a warning and are skipped."""
    prop_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "findings": {
                    "findings": [
                        # Missing required fields → validation error
                        {
                            "id": finding_id,
                            "override_suggestion": None,
                            # category/severity/title/detail missing → invalid
                        }
                    ],
                    "lease_term_overrides": [],
                },
                "finding_decisions": {
                    finding_id: {"decision": "accepted", "reason": "ok"}
                },
            }
        ]
    )

    advisories = await get_accepted_advisories(db, prop_id, 2024, org_id)
    # Invalid finding is skipped silently
    assert advisories == []


# ---------------------------------------------------------------------------
# Org scoping: wrong org_id returns empty results
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_accepted_overrides_wrong_org_returns_empty() -> None:
    """DB query includes org_id filter so a different org returns no rows."""
    prop_id = uuid4()
    wrong_org_id = uuid4()

    db = MagicMock()
    # Simulate DB returning data only for the correct org
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]  # wrong org sees no rows
    )

    overrides = await get_accepted_overrides(db, prop_id, 2024, wrong_org_id)
    assert overrides == []
    # Verify org_id was passed into the chain (last eq call arg)
    call_args = (
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.call_args
    )
    assert str(wrong_org_id) in call_args[0]


@pytest.mark.asyncio
async def test_get_accepted_advisories_wrong_org_returns_empty() -> None:
    """DB query includes org_id filter so a different org returns no rows."""
    prop_id = uuid4()
    wrong_org_id = uuid4()

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    advisories = await get_accepted_advisories(db, prop_id, 2024, wrong_org_id)
    assert advisories == []
    call_args = (
        db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.call_args
    )
    assert str(wrong_org_id) in call_args[0]


# ---------------------------------------------------------------------------
# in_review status transition
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_maybe_advance_status_handles_malformed_findings_blob() -> None:
    """_maybe_advance_status does not raise when findings column is null or non-dict."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Malformed blob test",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # findings column is a list instead of dict (malformed)
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": []}  # list instead of dict
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Malformed blob test"
    )

    # Only the (skipped) update fires — no status transitions
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    assert not any(p.get("status") == "reviewed" for p in update_payloads)


@pytest.mark.asyncio
async def test_update_finding_decision_sets_in_review_when_partial() -> None:
    """When only some findings are decided, status advances to in_review."""
    analysis_id = uuid4()
    finding_id_a = str(uuid4())
    finding_id_b = str(uuid4())

    db = MagicMock()
    # RPC returns decisions with only finding_a decided
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id_a: {
                "decision": "accepted",
                "reason": "Partial decision",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # _maybe_advance_status SELECT returns two findings
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={
            "status": "pending",
            "findings": {
                "findings": [
                    {"id": finding_id_a, "override_suggestion": None},
                    {"id": finding_id_b, "override_suggestion": None},
                ]
            },
        }
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(
        db, analysis_id, finding_id_a, "accepted", "Partial decision"
    )

    # Should have advanced to in_review (not reviewed)
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    statuses = [c.get("status") for c in update_payloads if "status" in c]
    assert "in_review" in statuses


@pytest.mark.asyncio
async def test_update_finding_decision_no_status_transition_when_zero_findings() -> (
    None
):
    """When the analysis has an empty findings list, no status update is emitted."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Zero findings",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": {"findings": []}}
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Zero findings"
    )

    # No status transitions should fire
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    assert all("status" not in p for p in update_payloads)


@pytest.mark.asyncio
async def test_update_finding_decision_noop_when_analysis_not_found() -> None:
    """When RPC returns empty (analysis not found), function logs warning and returns."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    # RPC returns empty data (row not found or org mismatch)
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=None)

    await update_finding_decision(db, analysis_id, finding_id, "accepted", "Not found")

    # No status update should have been called
    db.table.return_value.update.assert_not_called()


@pytest.mark.asyncio
async def test_update_finding_decision_with_org_id_scopes_status_updates() -> None:
    """When org_id is supplied, RPC includes org_id and status-advance uses org_id filter."""
    analysis_id = uuid4()
    org_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    # RPC returns merged decisions
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Org-scoped",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # _maybe_advance_status SELECT → all decided → reviewed
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={
            "status": "pending",
            "findings": {"findings": [{"id": finding_id}]},
        }
    )
    db.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Org-scoped", org_id=org_id
    )

    # Verify RPC was called with the org_id
    rpc_params = db.rpc.call_args[0][1]
    assert rpc_params["p_org_id"] == str(org_id)
    # Status-advance UPDATE should include org_id in second eq
    second_eq_calls = (
        db.table.return_value.update.return_value.eq.return_value.eq.call_args_list
    )
    all_second_args = [str(a) for call in second_eq_calls for a in call[0]]
    assert any(str(org_id) in arg for arg in all_second_args)


@pytest.mark.asyncio
async def test_update_finding_decision_includes_user_id_and_timestamp() -> None:
    """Decision record stored by RPC includes user_id and decided_at timestamp."""
    analysis_id = uuid4()
    finding_id = str(uuid4())
    user_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "dismissed",
                "reason": "Not applicable",
                "user_id": user_id,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": {"findings": []}}
    )

    await update_finding_decision(
        db, analysis_id, finding_id, "dismissed", "Not applicable", user_id=user_id
    )

    rpc_params = db.rpc.call_args[0][1]
    assert rpc_params["p_decision"]["user_id"] == user_id
    assert rpc_params["p_decision"]["decided_at"] is not None


@pytest.mark.asyncio
async def test_update_finding_decision_null_user_id_stored_correctly() -> None:
    """When no user_id is passed, the decision record stores null for user_id."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "Service call",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": {"findings": []}}
    )

    # No user_id kwarg supplied
    await update_finding_decision(
        db, analysis_id, finding_id, "accepted", "Service call"
    )

    rpc_params = db.rpc.call_args[0][1]
    assert rpc_params["p_decision"]["user_id"] is None
    assert rpc_params["p_decision"]["decided_at"] is not None


@pytest.mark.asyncio
async def test_update_finding_decision_second_call_overwrites_timestamp() -> None:
    """decide_finding is last-write-wins: second call with same finding_id succeeds
    and the RPC is called again (the new decided_at overwrites the old one)."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "retry",
                "user_id": None,
                "decided_at": "2024-06-01T00:00:00+00:00",
            }
        }
    )
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={"status": "pending", "findings": {"findings": []}}
    )

    await update_finding_decision(db, analysis_id, finding_id, "accepted", "first")
    await update_finding_decision(db, analysis_id, finding_id, "accepted", "retry")

    # RPC called twice — no short-circuit on repeat calls
    assert db.rpc.call_count == 2


@pytest.mark.asyncio
async def test_update_finding_decision_treats_finding_with_no_id_as_undecided() -> None:
    """A finding missing an id field is treated as never-decided — prevents premature reviewed."""
    analysis_id = uuid4()
    finding_id = str(uuid4())

    db = MagicMock()
    # Only the valid finding is in the decisions returned by RPC
    db.rpc.return_value.execute.return_value = SimpleNamespace(
        data={
            finding_id: {
                "decision": "accepted",
                "reason": "OK",
                "user_id": None,
                "decided_at": "2024-01-01T00:00:00+00:00",
            }
        }
    )
    # findings list has one normal finding and one with no id
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = SimpleNamespace(
        data={
            "status": "pending",
            "findings": {
                "findings": [
                    {"id": finding_id},  # has id, decided
                    {"id": None, "title": "X"},  # no id → undecidable
                ]
            },
        }
    )
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[])
    )

    await update_finding_decision(db, analysis_id, finding_id, "accepted", "OK")

    # Should NOT advance to reviewed (one finding has no id = undecidable)
    update_payloads = [c[0][0] for c in db.table.return_value.update.call_args_list]
    assert not any(p.get("status") == "reviewed" for p in update_payloads)
    # But in_review should be set (decisions dict is non-empty + status was pending)
    assert any(p.get("status") == "in_review" for p in update_payloads)
