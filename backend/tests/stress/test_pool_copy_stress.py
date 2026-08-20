"""Property-based stress test for the expense-pool copy service.

``PoolCopyService.copy_pools`` clones a property's expense-pool hierarchy onto a
target property, preserving the parent→child structure with a two-pass remap
(roots first, then children re-pointed at their new parent ids). Pools are
capped at depth 2 (grandchildren are rejected at creation — see
``tests/api/test_expense_pools_crud.py``), so every child's parent is a root and
the FIX AS-1 orphan guard only fires on genuine corruption.

The risk surfaces are structural, not arithmetic: the parent/child/total count
partition must hold, no copied child may dangle (its ``parent_pool_id`` must be
one of the freshly-created roots), names must survive the copy intact, and the
MERGE/REPLACE delete accounting must be exact. We drive the FULL service against
a faithful in-memory fake of the synchronous Supabase client — only the DB
boundary is faked; the two-pass hierarchy logic runs for real.

Run standalone:
    pytest tests/stress/test_pool_copy_stress.py -q
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.pool_copy import CopyMode, PoolCopyRequest
from app.services.pools.copy_service import PoolCopyService

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


class _FakePoolTable:
    """A chainable query against one logical Supabase table backed by a list."""

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._filters: dict[str, str] = {}
        self._count_mode = False
        self._pending_insert: dict[str, Any] | None = None
        self._pending_delete = False

    def select(self, *_cols: Any, count: Any = None) -> _FakePoolTable:
        self._count_mode = count is not None
        return self

    def insert(self, data: dict[str, Any]) -> _FakePoolTable:
        self._pending_insert = data
        return self

    def delete(self) -> _FakePoolTable:
        self._pending_delete = True
        return self

    def eq(self, col: str, val: str) -> _FakePoolTable:
        self._filters[col] = val
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> _FakePoolTable:
        return self

    def _matching(self) -> list[dict[str, Any]]:
        return [
            r
            for r in self._rows
            if all(str(r.get(k)) == v for k, v in self._filters.items())
        ]

    def execute(self) -> SimpleNamespace:
        if self._pending_insert is not None:
            row = dict(self._pending_insert)
            row["id"] = str(uuid.uuid4())
            self._rows.append(row)
            return SimpleNamespace(data=[row], count=None)
        if self._pending_delete:
            survivors = [r for r in self._rows if r not in self._matching()]
            removed = len(self._rows) - len(survivors)
            self._rows[:] = survivors
            return SimpleNamespace(data=[], count=removed)
        matched = self._matching()
        count = len(matched) if self._count_mode else None
        return SimpleNamespace(data=list(matched), count=count)


class _FakeSupabase:
    """Routes ``.table(name)`` to per-table row stores."""

    def __init__(self, properties: list[dict[str, Any]], pools: list[dict[str, Any]]):
        self._tables = {"properties": properties, "expense_pools": pools}

    def table(self, name: str) -> _FakePoolTable:
        return _FakePoolTable(self._tables.setdefault(name, []))


@st.composite
def _scenario(draw):
    """Generate a depth<=2 source hierarchy plus a target pool count."""
    org_id = uuid4()
    source_id = uuid4()
    target_id = uuid4()

    n_roots = draw(st.integers(min_value=0, max_value=4))
    pools: list[dict[str, Any]] = []
    name_i = 0
    for _ in range(n_roots):
        root_id = str(uuid4())
        pools.append(
            {
                "id": root_id,
                "name": f"pool-{name_i}",
                "description": draw(st.none() | st.just("desc")),
                "property_id": str(source_id),
                "parent_pool_id": None,
                "gross_up_enabled": draw(st.booleans()),
                "organization_id": str(org_id),
            }
        )
        name_i += 1
        n_children = draw(st.integers(min_value=0, max_value=3))
        for _ in range(n_children):
            pools.append(
                {
                    "id": str(uuid4()),
                    "name": f"pool-{name_i}",
                    "description": None,
                    "property_id": str(source_id),
                    "parent_pool_id": root_id,  # depth 2: parent is a root
                    "gross_up_enabled": draw(st.booleans()),
                    "organization_id": str(org_id),
                }
            )
            name_i += 1

    n_existing_target = draw(st.integers(min_value=0, max_value=4))
    target_pools = [
        {
            "id": str(uuid4()),
            "name": f"existing-{i}",
            "description": None,
            "property_id": str(target_id),
            "parent_pool_id": None,
            "gross_up_enabled": True,
            "organization_id": str(org_id),
        }
        for i in range(n_existing_target)
    ]

    mode = draw(st.sampled_from([CopyMode.MERGE, CopyMode.REPLACE]))
    return org_id, source_id, target_id, pools, target_pools, mode


@STRESS
@given(scenario=_scenario())
def test_copy_pools_preserves_hierarchy_and_counts(scenario):
    org_id, source_id, target_id, source_pools, target_pools, mode = scenario

    n_roots = sum(1 for p in source_pools if p["parent_pool_id"] is None)
    n_children = len(source_pools) - n_roots
    source_names = sorted(p["name"] for p in source_pools)
    n_existing_target = len(target_pools)

    properties = [
        {"id": str(source_id), "organization_id": str(org_id)},
        {"id": str(target_id), "organization_id": str(org_id)},
    ]
    pool_store = [dict(p) for p in source_pools] + [dict(p) for p in target_pools]
    fake = _FakeSupabase(properties, pool_store)

    svc = PoolCopyService(supabase=fake, organization_id=org_id)
    result = svc.copy_pools(
        PoolCopyRequest(
            source_property_id=source_id,
            target_property_id=target_id,
            copy_mode=mode,
        )
    )

    # Count partition (the model validator also enforces this).
    assert result.pools_copied == result.parent_pools_copied + result.child_pools_copied
    assert result.pools_copied == len(source_pools)
    assert result.parent_pools_copied == n_roots
    # depth<=2 guarantees every child's parent is a root, so none is dropped.
    assert result.child_pools_copied == n_children

    # Delete accounting is exact and mode-specific. An EMPTY source short-circuits
    # before any delete (copy_pools returns early), so REPLACE with nothing to copy
    # is a no-op that leaves the target untouched rather than wiping it — a
    # deliberate guard against destroying target data on an empty source.
    if mode == CopyMode.REPLACE and source_pools:
        assert result.pools_deleted == n_existing_target
    else:
        assert result.pools_deleted == 0

    # Names survive the copy intact (a permutation, never lost or duplicated).
    assert sorted(p.name for p in result.copied_pools) == source_names

    # No copied child dangles: every child's new parent_pool_id is one of the
    # freshly-created roots on the TARGET property.
    new_target_pools = [r for r in pool_store if r["property_id"] == str(target_id)]
    if mode == CopyMode.REPLACE and source_pools:
        # Old target pools were deleted; only the copies remain.
        assert len(new_target_pools) == len(source_pools)
    new_root_ids = {r["id"] for r in new_target_pools if r["parent_pool_id"] is None}
    copied_ids = {str(p.id) for p in result.copied_pools}
    for r in new_target_pools:
        if r["id"] in copied_ids and r["parent_pool_id"] is not None:
            assert r["parent_pool_id"] in new_root_ids


@STRESS
@given(scenario=_scenario())
def test_copy_pools_targets_target_org_and_property(scenario):
    """Every copied row is written under the target property and the caller org,
    and a copy never reuses a source pool id."""
    org_id, source_id, target_id, source_pools, target_pools, mode = scenario
    properties = [
        {"id": str(source_id), "organization_id": str(org_id)},
        {"id": str(target_id), "organization_id": str(org_id)},
    ]
    pool_store = [dict(p) for p in source_pools] + [dict(p) for p in target_pools]
    fake = _FakeSupabase(properties, pool_store)

    svc = PoolCopyService(supabase=fake, organization_id=org_id)
    result = svc.copy_pools(
        PoolCopyRequest(
            source_property_id=source_id,
            target_property_id=target_id,
            copy_mode=mode,
        )
    )

    source_ids = {p["id"] for p in source_pools}
    for p in result.copied_pools:
        assert isinstance(p.id, UUID)
        assert str(p.id) not in source_ids  # brand-new id, never a source id

    copied_ids = {str(p.id) for p in result.copied_pools}
    for r in pool_store:
        if r["id"] in copied_ids:
            assert r["property_id"] == str(target_id)
            assert r["organization_id"] == str(org_id)


def test_missing_source_property_raises():
    org_id = uuid4()
    fake = _FakeSupabase(properties=[], pools=[])
    svc = PoolCopyService(supabase=fake, organization_id=org_id)
    with pytest.raises(ValueError):
        svc.copy_pools(
            PoolCopyRequest(
                source_property_id=uuid4(),
                target_property_id=uuid4(),
                copy_mode=CopyMode.MERGE,
            )
        )


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
