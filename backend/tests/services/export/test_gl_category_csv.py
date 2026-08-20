"""
Unit tests for the GL-by-category CSV exporter service.

Tests cover:
- Returns StringIO
- Header row present
- Rows written per pool/entry
- Empty pools produce empty output (header only)
"""

from io import StringIO


class TestGLCategoryCSVExporter:
    def _make_pool_details(self):
        return [
            {
                "pool_name": "CAM",
                "pool_type": "operating",
                "pool_total": "12500.00",
                "items": [
                    {
                        "account_code": "5100",
                        "account_description": "Janitorial",
                        "amount": "5000.00",
                    },
                    {
                        "account_code": "5200",
                        "account_description": "Landscaping",
                        "amount": "7500.00",
                    },
                ],
            },
            {
                "pool_name": "Insurance",
                "pool_type": "insurance",
                "pool_total": "3000.00",
                "items": [
                    {
                        "account_code": "6100",
                        "account_description": "Property Insurance",
                        "amount": "3000.00",
                    },
                ],
            },
        ]

    def test_returns_string_io(self):
        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        exporter = GLCategoryCSVExporter(self._make_pool_details(), 2024)
        result = exporter.generate()
        assert isinstance(result, StringIO)

    def test_header_row_present(self):
        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        exporter = GLCategoryCSVExporter(self._make_pool_details(), 2024)
        buf = exporter.generate()
        buf.seek(0)
        content = buf.read()
        assert "Pool Name" in content
        assert "Account Code" in content
        assert "Amount" in content

    def test_pool_entries_in_output(self):
        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        exporter = GLCategoryCSVExporter(self._make_pool_details(), 2024)
        buf = exporter.generate()
        buf.seek(0)
        content = buf.read()
        assert "CAM" in content
        assert "Janitorial" in content
        assert "5100" in content

    def test_empty_pools_returns_header_only(self):
        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        exporter = GLCategoryCSVExporter([], 2024)
        buf = exporter.generate()
        buf.seek(0)
        lines = [line for line in buf.read().splitlines() if line]
        assert len(lines) == 1  # header only

    def test_filename_includes_year(self):
        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        exporter = GLCategoryCSVExporter([], 2024)
        assert "2024" in exporter.filename()

    def test_amounts_are_plain_numbers_for_reimport(self):
        """Amount/Pool Total must be machine-parseable (no thousands comma).

        This CSV is re-imported into spreadsheets and tax-protest tools; a
        ``1,234.56`` cell gets CSV-quoted and parses as text, breaking SUM.
        """
        import csv
        import io

        from app.services.export.gl_category_csv import GLCategoryCSVExporter

        pools = [
            {
                "pool_name": "CAM",
                "pool_type": "operating",
                "pool_total": "1234567.89",
                "items": [
                    {
                        "account_code": "6100",
                        "account_description": "Landscaping",
                        "amount": "12345.67",
                    },
                    {
                        "account_code": "6200",
                        "account_description": "Snow Removal",
                        "amount": "-5000.00",
                    },
                ],
            }
        ]
        content = GLCategoryCSVExporter(pools, 2024).generate().read()

        # No thousands separators anywhere in the numeric cells.
        assert "12,345.67" not in content
        assert "1,234,567.89" not in content

        rows = list(csv.DictReader(io.StringIO(content)))
        # Each cell parses as a float and the column sums correctly.
        assert float(rows[0]["Amount"]) == 12345.67
        assert float(rows[1]["Amount"]) == -5000.00
        assert float(rows[0]["Pool Total"]) == 1234567.89
        assert round(sum(float(r["Amount"]) for r in rows), 2) == 7345.67
