"""Yardi Voyager GL Export Fixture Generator.

Generates realistic Yardi GL export files for testing the YardiVoyagerGLParser.
"""

from __future__ import annotations

import csv
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from faker import Faker

fake = Faker()
fake.seed_instance(42)  # For reproducible fixtures


class YardiGLFixtureGenerator:
    """Generator for realistic Yardi Voyager GL export fixtures."""

    # Yardi GL account code structure (5xxx-6xxx series for expenses)
    ACCOUNT_STRUCTURE = {
        "5100": {"name": "Real Estate Taxes", "category": "Taxes", "variance": 0.05},
        "5110": {
            "name": "Property Insurance",
            "category": "Insurance",
            "variance": 0.03,
        },
        "5120": {
            "name": "General Liability Insurance",
            "category": "Insurance",
            "variance": 0.02,
        },
        "5200": {"name": "Electric", "category": "Utilities", "variance": 0.15},
        "5210": {"name": "Gas", "category": "Utilities", "variance": 0.20},
        "5220": {"name": "Water/Sewer", "category": "Utilities", "variance": 0.12},
        "5300": {"name": "Janitorial Services", "category": "CAM", "variance": 0.08},
        "5310": {"name": "Landscaping", "category": "CAM", "variance": 0.10},
        "5320": {"name": "Snow Removal", "category": "R&M", "variance": 0.30},
        "5330": {"name": "HVAC Maintenance", "category": "R&M", "variance": 0.15},
        "5340": {"name": "Elevator Maintenance", "category": "R&M", "variance": 0.05},
        "5350": {
            "name": "Parking Lot Maintenance",
            "category": "R&M",
            "variance": 0.12,
        },
        "5400": {"name": "Building Repairs", "category": "R&M", "variance": 0.25},
        "5410": {"name": "Plumbing Repairs", "category": "R&M", "variance": 0.20},
        "5420": {"name": "Electrical Repairs", "category": "R&M", "variance": 0.18},
        "5500": {"name": "Security Services", "category": "CAM", "variance": 0.06},
        "5600": {
            "name": "Management Fee",
            "category": "Management Fee",
            "variance": 0.02,
        },
        "5610": {
            "name": "Administrative Fee",
            "category": "Management Fee",
            "variance": 0.03,
        },
        "5700": {"name": "Professional Fees", "category": "CAM", "variance": 0.10},
    }

    # Realistic vendor names by category
    VENDORS = {
        "Taxes": ["County Tax Assessor", "City of Denver Tax Collector"],
        "Insurance": ["State Farm Commercial", "Liberty Mutual", "Travelers Insurance"],
        "Utilities": [
            "Xcel Energy",
            "Denver Water",
            "Atmos Energy",
            "Public Service Co",
        ],
        "CAM": [
            "ABC Janitorial Services",
            "Premier Cleaning Co",
            "GreenScape Landscaping",
            "SecureWatch Security",
        ],
        "R&M": [
            "Mile High HVAC",
            "Denver Elevator Co",
            "Rocky Mountain Plumbing",
            "Front Range Electric",
            "Asphalt Experts LLC",
        ],
        "Management Fee": ["Property Management Inc"],
    }

    def __init__(
        self,
        property_name: str = "Riverside Corporate Center",
        property_code: str = "RCC-001",
        start_date: date | None = None,
        end_date: date | None = None,
    ):
        """Initialize the generator.

        Args:
            property_name: Name of the property
            property_code: Property code for the GL export
            start_date: Start of the GL period (defaults to 12 months ago)
            end_date: End of the GL period (defaults to today)
        """
        self.property_name = property_name
        self.property_code = property_code

        # Default to 12-month period
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=365)

        self.start_date = start_date
        self.end_date = end_date

    def generate_standard_fixture(
        self, output_path: Path, num_rows: int = 500
    ) -> dict[str, Any]:
        """Generate a standard Yardi GL export fixture.

        Args:
            output_path: Path to write the CSV file
            num_rows: Target number of data rows (excluding headers)

        Returns:
            Dictionary with expected values for test assertions
        """
        # Calculate rows per account to reach target
        num_accounts = len(self.ACCOUNT_STRUCTURE)
        rows_per_account = max(1, num_rows // num_accounts)

        rows: list[dict[str, Any]] = []
        total_debits = Decimal("0")
        total_credits = Decimal("0")

        # Generate transactions for each account
        for account_code, account_info in self.ACCOUNT_STRUCTURE.items():
            account_rows = self._generate_account_transactions(
                account_code=account_code,
                account_name=account_info["name"],
                category=account_info["category"],
                variance=account_info["variance"],
                num_transactions=rows_per_account,
            )
            rows.extend(account_rows)

            # Track totals
            for row in account_rows:
                if row["Debit"]:
                    total_debits += Decimal(str(row["Debit"]))
                if row["Credit"]:
                    total_credits += Decimal(str(row["Credit"]))

        # Sort by date then account
        rows.sort(key=lambda x: (x["Date"], x["Account Code"]))

        # Write CSV with Yardi-specific header
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            # Write Yardi header rows (for fingerprint detection)
            f.write("Yardi Voyager GL Detail Report\n")
            f.write(f"Property: {self.property_name} ({self.property_code})\n")
            start = self.start_date.strftime("%m/%d/%Y")
            end = self.end_date.strftime("%m/%d/%Y")
            f.write(f"Period: {start} - {end}\n")
            f.write(f"Run Date: {datetime.now().strftime('%m/%d/%Y %I:%M %p')}\n")
            f.write("\n")  # Blank line before data

            # Write data rows
            fieldnames = [
                "Account Code",
                "Account Description",
                "Date",
                "Vendor",
                "Debit",
                "Credit",
                "Balance",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        # Calculate expected values
        expected_values = {
            "row_count": len(rows),
            "total_debits": float(total_debits),
            "total_credits": float(total_credits),
            "net_amount": float(total_debits - total_credits),
            "account_count": len(self.ACCOUNT_STRUCTURE),
            "date_range": {
                "start": self.start_date.isoformat(),
                "end": self.end_date.isoformat(),
            },
            "categories": list(
                set(info["category"] for info in self.ACCOUNT_STRUCTURE.values())
            ),
        }

        return expected_values

    def generate_malformed_fixture(self, output_path: Path) -> None:
        """Generate a malformed fixture for error handling tests.

        Creates a file with common issues:
        - Missing required columns
        - Invalid date formats
        - Non-numeric amounts
        - Empty rows
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            # Write minimal header (missing Yardi identifiers)
            f.write("GL Export Report\n")
            f.write("\n")

            # Write malformed data
            writer = csv.writer(f)

            # Header row with wrong column names
            writer.writerow(
                ["Acct", "Name", "Trans Date", "Supplier", "Dr", "Cr", "Bal"]
            )

            # Row with missing account code
            writer.writerow(
                ["", "Some Expense", "01/15/2024", "Vendor A", "1000.00", "", ""]
            )

            # Row with invalid date
            writer.writerow(
                ["5100", "Taxes", "NOT_A_DATE", "Vendor B", "500.00", "", ""]
            )

            # Row with non-numeric amount
            writer.writerow(
                ["5200", "Electric", "02/15/2024", "Vendor C", "INVALID", "", ""]
            )

            # Empty row
            writer.writerow(["", "", "", "", "", "", ""])

            # Row with mixed debit/credit (should be one or the other)
            writer.writerow(
                ["5300", "Janitorial", "03/15/2024", "Vendor D", "100.00", "100.00", ""]
            )

    def _generate_account_transactions(
        self,
        account_code: str,
        account_name: str,
        category: str,
        variance: float,
        num_transactions: int,
    ) -> list[dict[str, Any]]:
        """Generate realistic transactions for a single account.

        Args:
            account_code: GL account code
            account_name: Account description
            category: Expense category
            variance: Monthly variance factor (0.0-1.0)
            num_transactions: Number of transactions to generate

        Returns:
            List of transaction dictionaries
        """
        rows: list[dict[str, Any]] = []
        vendors = self.VENDORS.get(category, ["Generic Vendor"])

        # Calculate base monthly amount (spread evenly across year)
        # Total annual amounts vary by category
        annual_amounts = {
            "Taxes": 120000,
            "Insurance": 48000,
            "Utilities": 84000,
            "CAM": 96000,
            "R&M": 72000,
            "Management Fee": 60000,
        }
        base_monthly = annual_amounts.get(category, 50000) / 12

        # Generate transactions spread across the period
        days_in_period = (self.end_date - self.start_date).days
        transaction_dates = [
            self.start_date + timedelta(days=int(days_in_period * i / num_transactions))
            for i in range(num_transactions)
        ]

        running_balance = Decimal("0")

        for trans_date in transaction_dates:
            # Add variance to monthly amount
            variance_factor = 1 + (fake.random.uniform(-variance, variance))
            amount = Decimal(
                str(base_monthly * variance_factor / (num_transactions / 12))
            )
            amount = amount.quantize(Decimal("0.01"))

            # Occasionally generate credits (refunds/adjustments) ~5% of the time
            is_credit = fake.random.random() < 0.05

            if is_credit:
                # Credits are typically smaller (10-30% of normal transaction)
                amount = amount * Decimal(str(fake.random.uniform(0.1, 0.3)))
                amount = amount.quantize(Decimal("0.01"))
                running_balance -= amount
                debit = ""
                credit = f"{amount:.2f}"
            else:
                running_balance += amount
                debit = f"{amount:.2f}"
                credit = ""

            row = {
                "Account Code": account_code,
                "Account Description": account_name,
                "Date": trans_date.strftime("%m/%d/%Y"),
                "Vendor": fake.random.choice(vendors),
                "Debit": debit,
                "Credit": credit,
                "Balance": f"{running_balance:.2f}",
            }
            rows.append(row)

        return rows


def generate_all_fixtures() -> None:
    """Generate all Yardi GL fixtures for testing."""
    base_path = Path(__file__).parent.parent / "yardi"

    # Generate standard fixture
    generator = YardiGLFixtureGenerator()
    expected_values = generator.generate_standard_fixture(
        output_path=base_path / "gl_export_standard.csv",
        num_rows=520,  # Slightly over 500 to ensure we meet requirement
    )

    # Save expected values
    expected_path = Path(__file__).parent.parent / "expected" / "yardi_gl_standard.json"
    expected_path.parent.mkdir(parents=True, exist_ok=True)
    with open(expected_path, "w") as f:
        json.dump(expected_values, f, indent=2)

    print(f"[OK] Generated standard fixture: {base_path / 'gl_export_standard.csv'}")
    print(f"  - {expected_values['row_count']} rows")
    print(f"  - Total debits: ${expected_values['total_debits']:,.2f}")
    print(f"  - Total credits: ${expected_values['total_credits']:,.2f}")
    print(f"  - Net amount: ${expected_values['net_amount']:,.2f}")

    # Generate malformed fixture
    generator.generate_malformed_fixture(
        output_path=base_path / "gl_export_malformed.csv"
    )
    print(f"[OK] Generated malformed fixture: {base_path / 'gl_export_malformed.csv'}")


if __name__ == "__main__":
    generate_all_fixtures()
