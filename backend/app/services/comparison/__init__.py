"""
System Comparison / Variance service (Module B).

This package is deliberately separate from ``app.services.calculation`` (Module A,
which *produces* the correct CAM reconciliation). Module B *compares* CapVeri's
correct per-tenant recovery against what another system actually charged, and
reports every deviation as a signed, bidirectional finding:

- ``OVERCHARGE``: the other system charged more than correct
  (tenant exposure / refund risk).
- ``UNDERCHARGE``: the other system charged less than correct
  (recovery opportunity).
- ``MATCH``: within tolerance (confirmed correct).

The objective is *correctness* ("was the right amount charged?"), not recovery.
"""

from app.services.comparison.engine import build_comparison_result, compare_charges
from app.services.comparison.models import (
    ComparisonResult,
    TenantVariance,
    VarianceDirection,
)

__all__ = [
    "ComparisonResult",
    "TenantVariance",
    "VarianceDirection",
    "build_comparison_result",
    "compare_charges",
]
