from types import SimpleNamespace
from uuid import uuid4

from app.services.billing.quota_enforcement import QuotaEnforcementService


class Query:
    def __init__(self, data=None, count=0):
        self.data = data or []
        self.count = count

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args):
        return self

    def maybe_single(self):
        if isinstance(self.data, list):
            data = self.data[0] if self.data else None
        else:
            data = self.data
        return Query(data=data, count=1 if data else 0)

    def execute(self):
        return SimpleNamespace(data=self.data, count=self.count)


class FakeContext:
    def __init__(self, tier: str, properties: int = 0, units: int = 0):
        self.organization_id = uuid4()
        self._tier = tier
        self._properties = properties
        self._units = units

    def table(self, name: str):
        if name == "subscriptions":
            return Query(
                data=[
                    {
                        "plan": self._tier,
                        "tier": self._tier,
                        "status": "active",
                        "billing_model": "subscription",
                    }
                ],
                count=1,
            )
        if name == "properties":
            return Query(count=self._properties)
        if name == "units":
            return Query(count=self._units)
        raise AssertionError(f"Unexpected table {name}")


def test_reconcile_allows_large_configured_unit_counts() -> None:
    service = QuotaEnforcementService(FakeContext(tier="reconcile", units=2500))

    service.assert_can_add_billable_units(1)


def test_enterprise_allows_more_than_500_units() -> None:
    service = QuotaEnforcementService(FakeContext(tier="enterprise", units=900))

    service.assert_can_add_billable_units(100)


def test_reconcile_allows_more_than_50_properties() -> None:
    service = QuotaEnforcementService(FakeContext(tier="reconcile", properties=50))

    service.assert_can_add_property()


def test_enterprise_allows_more_than_50_properties() -> None:
    service = QuotaEnforcementService(FakeContext(tier="enterprise", properties=50))

    service.assert_can_add_property()
