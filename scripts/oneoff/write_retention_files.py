import os
SQ = chr(39)

header = (
    chr(34)*3 + "Data retention policy configuration for CapVeri.

"
    + "Pure declarations -- no database logic.
"
    + chr(34)*3 + "

from dataclasses import dataclass, field
from enum import Enum


"
    + "class RetentionCategory(str, Enum):
"
    + "    " + chr(34)*3 + "Three-tier retention classification." + chr(34)*3 + "

"
    + "    FINANCIAL_PERMANENT = " + chr(34) + "financial_permanent" + chr(34) + "
"
    + "    OPERATIONAL = " + chr(34) + "operational" + chr(34) + "
"
    + "    TRANSIENT = " + chr(34) + "transient" + chr(34) + "


"
    + "FINANCIAL_RETENTION_YEARS: int = 10
"
    + "TRANSIENT_EMAIL_LOG_PURGE_DAYS: int = 2
"
    + "TRANSIENT_JOB_PURGE_DAYS: int = 90
"
    + "TRANSIENT_NOTIFICATION_PURGE_DAYS: int = 90
"
    + "TRANSIENT_WEBHOOK_PURGE_DAYS: int = 90
"
    + "TRANSIENT_AUTH_EVENT_PURGE_DAYS: int = 365


"
    + "@dataclass(frozen=True)
class RetentionPolicy:
"
    + "    " + chr(34)*3 + "Retention rule for a single database table." + chr(34)*3 + "

"
    + "    table_name: str
    category: RetentionCategory
"
    + "    retention_years: int | None
    purge_after_days: int | None
"
    + "    purge_condition: str
    legal_basis: str
"
    + "    notes: str = field(default=" + chr(34)*2 + ")


"
    + "RETENTION_POLICY: dict[str, RetentionPolicy] = {
"
)
print("header ok", len(header))
