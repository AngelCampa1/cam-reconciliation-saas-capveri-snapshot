"""
Financial calculation engine for CAM reconciliation.

This module provides deterministic calculations for:
- Occupancy rates (weighted average)
- Gross-up factors
- Expense caps (cumulative, non-cumulative, compounding)
- Base year calculations
- Tenant share allocation
- Expense stops
- Full property reconciliation orchestration

All calculations use Decimal for financial accuracy and provide
a complete audit trail via CalculationTrace.
"""

from app.services.calculation.base_year import (
    BaseYearInput,
    BaseYearNormalizationInput,
    BaseYearResult,
    calculate_base_year_increase,
    normalize_base_year,
)
from app.services.calculation.caps import (
    CapInput,
    CapResult,
    CapType,
    apply_cap,
    calculate_cumulative_cap,
    calculate_cumulative_compounding_cap,
    calculate_non_cumulative_cap,
)
from app.services.calculation.data_fetcher import fetch_active_leases
from app.services.calculation.expense_stop import (
    ExpenseStopInput,
    ExpenseStopResult,
    apply_expense_stops,
    calculate_expense_stop,
)
from app.services.calculation.gross_up import (
    GrossUpConfig,
    apply_safety_valve,
    calculate_gross_up_factor,
    calculate_grossed_up_expenses,
)
from app.services.calculation.gross_up_orchestrator import (
    GrossUpInput,
    GrossUpResult,
    calculate_full_gross_up,
)
from app.services.calculation.models import (
    CalculationStep,
    CalculationTrace,
    OccupancyInput,
    OccupancyResult,
)
from app.services.calculation.occupancy import (
    LeaseOccupancy,
    calculate_occupancy,
)
from app.services.calculation.orchestrator import (
    PropertyReconciliation,
    ReconciliationInput,
    TenantReconciliation,
    run_property_reconciliation,
)
from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    PoolTotal,
    SplitAllocation,
    aggregate_by_pools,
    aggregate_with_splits,
    build_split_allocations_from_pool_allocations,
    pattern_to_regex,
    validate_split_allocation,
)
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    TenantShareResult,
    calculate_tenant_share,
)
from app.services.calculation.trace_persistence import (
    get_trace_from_snapshot,
    save_trace_to_snapshot,
    trace_to_readable_format,
)

__all__ = [
    "CalculationStep",
    "CalculationTrace",
    "OccupancyInput",
    "OccupancyResult",
    "LeaseOccupancy",
    "calculate_occupancy",
    "GrossUpConfig",
    "calculate_gross_up_factor",
    "apply_safety_valve",
    "calculate_grossed_up_expenses",
    "GrossUpInput",
    "GrossUpResult",
    "calculate_full_gross_up",
    "CapType",
    "CapResult",
    "CapInput",
    "calculate_non_cumulative_cap",
    "calculate_cumulative_cap",
    "calculate_cumulative_compounding_cap",
    "apply_cap",
    "BaseYearInput",
    "BaseYearNormalizationInput",
    "BaseYearResult",
    "calculate_base_year_increase",
    "normalize_base_year",
    "GLEntry",
    "PoolMapping",
    "PoolTotal",
    "SplitAllocation",
    "aggregate_by_pools",
    "aggregate_with_splits",
    "build_split_allocations_from_pool_allocations",
    "pattern_to_regex",
    "validate_split_allocation",
    "LeaseTerms",
    "TenantShareInput",
    "TenantShareResult",
    "calculate_tenant_share",
    "save_trace_to_snapshot",
    "get_trace_from_snapshot",
    "trace_to_readable_format",
    "ExpenseStopInput",
    "ExpenseStopResult",
    "calculate_expense_stop",
    "apply_expense_stops",
    "ReconciliationInput",
    "TenantReconciliation",
    "PropertyReconciliation",
    "run_property_reconciliation",
    "fetch_active_leases",
]
