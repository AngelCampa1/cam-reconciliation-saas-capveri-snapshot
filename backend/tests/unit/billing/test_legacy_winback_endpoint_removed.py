from app.api.v1 import billing as billing_routes


def test_legacy_free_audit_winback_processor_is_not_exposed() -> None:
    route_paths = {route.path for route in billing_routes.router.routes}

    assert "/free-audit-winback/process" not in route_paths
    assert not hasattr(billing_routes, "process_free_audit_winback")
    assert not hasattr(billing_routes, "ProcessFreeAuditWinbackResponse")
