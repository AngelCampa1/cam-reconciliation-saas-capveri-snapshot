"""
GL-by-category CSV exporter service.

Accepts pre-resolved pool detail dicts (as returned by _build_pool_details
in export.py) and renders them as a structured CSV for tax protest filing.
"""

import csv
from decimal import Decimal
from io import StringIO

from app.services.export.csv_safety import neutralize_formula


class GLCategoryCSVExporter:
    """Generate a GL-by-category CSV from resolved pool line-item data."""

    _FIELDNAMES = [
        "Tax Year",
        "Pool Name",
        "Pool Type",
        "Account Code",
        "Account Description",
        "Amount",
        "Pool Total",
    ]

    def __init__(self, pool_details: list[dict], tax_year: int) -> None:
        self._pools = pool_details
        self._tax_year = tax_year

    def generate(self) -> StringIO:
        """Return a StringIO containing the CSV content."""
        buf = StringIO()
        writer = csv.DictWriter(buf, fieldnames=self._FIELDNAMES)
        writer.writeheader()

        for pool in self._pools:
            pool_name = pool.get("pool_name", "")
            pool_type = pool.get("pool_type", "")
            pool_total = Decimal(str(pool.get("pool_total", "0")))
            items = pool.get("items", [])

            for item in items:
                writer.writerow(
                    {
                        "Tax Year": self._tax_year,
                        "Pool Name": neutralize_formula(pool_name),
                        "Pool Type": neutralize_formula(pool_type),
                        "Account Code": neutralize_formula(
                            item.get("account_code", "")
                        ),
                        "Account Description": neutralize_formula(
                            item.get("account_description", "")
                        ),
                        # Plain decimal, no thousands separator: this CSV is
                        # re-imported into spreadsheets and tax-protest tools, and
                        # a "1,234.56" cell parses as text (breaking SUM) because
                        # the embedded comma forces CSV quoting. Matches the ERP
                        # exporters' machine-parseable convention.
                        "Amount": f"{Decimal(str(item.get('amount', '0'))):.2f}",
                        "Pool Total": f"{pool_total:.2f}",
                    }
                )

        buf.seek(0)
        return buf

    def filename(self) -> str:
        """Return the suggested CSV filename."""
        return f"02_GL_by_Category_{self._tax_year}.csv"
