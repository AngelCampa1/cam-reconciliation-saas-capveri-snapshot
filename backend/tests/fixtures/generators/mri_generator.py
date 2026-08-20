"""MRI Rent Roll Fixture Generator.

Generates realistic MRI rent roll export files for testing the MRIRentRollParser.
"""

from __future__ import annotations

import csv
import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from random import Random
from typing import Any

from faker import Faker

fake = Faker()
fake.seed_instance(42)  # For reproducible fixtures

# Seed random for reproducibility
rng = Random(42)


class MRIRentRollGenerator:
    """Generator for realistic MRI rent roll fixtures."""

    # Realistic tenant company names
    TENANT_NAMES = [
        "Acme Corporation",
        "Global Tech Solutions",
        "Mountain View Medical",
        "Summit Legal Group",
        "Premier Insurance Co",
        "Elevation Consulting",
        "Peak Performance Fitness",
        "Urban Design Studio",
        "Metro Financial Services",
        "Cascade Marketing Group",
        "Horizon Capital Partners",
        "Skyline Architects",
        "Riverside Dental Care",
        "Gateway Technology",
        "Pioneer Engineering",
        "Altitude Investments",
        "Cornerstone Real Estate",
        "Beacon Insurance Agency",
        "Summit CPA Group",
        "Front Range Law Firm",
    ]

    # Lease statuses
    LEASE_STATUSES = {
        "active": 0.75,  # 75% active
        "expired": 0.10,  # 10% expired
        "pending": 0.05,  # 5% pending
        "vacant": 0.10,  # 10% vacant
    }

    def __init__(
        self,
        property_name: str = "Metroplex Office Tower",
        property_code: str = "METRO-001",
        num_floors: int = 10,
        units_per_floor: int = 6,
        occupancy_rate: float = 0.85,
        period_date: date | None = None,
    ):
        """Initialize the generator.

        Args:
            property_name: Name of the property
            property_code: Property identifier code
            num_floors: Number of floors in the building
            units_per_floor: Units per floor
            occupancy_rate: Target occupancy rate (0.0-1.0)
            period_date: Reporting period date (defaults to current month)
        """
        self.property_name = property_name
        self.property_code = property_code
        self.num_floors = num_floors
        self.units_per_floor = units_per_floor
        self.occupancy_rate = occupancy_rate
        self.period_date = period_date or date.today().replace(day=1)

        # Calculate total units
        self.total_units = num_floors * units_per_floor

    def generate_unit_number(self, floor: int, position: int) -> str:
        """Generate unit number.

        Args:
            floor: Floor number (1-based)
            position: Position on floor (1-based)

        Returns:
            Unit number string (e.g., "401", "1025")
        """
        if floor < 10:
            return f"{floor}0{position}"
        else:
            # Use letter suffix for floors 10+
            letter = chr(ord("A") + position - 1)
            return f"{floor}{letter}"

    def generate_square_footage(self) -> int:
        """Generate realistic square footage for a unit.

        Returns:
            Square footage (800-5000 range)
        """
        # Most units are in the 1000-3000 range
        size_category = rng.random()

        if size_category < 0.10:  # 10% small
            return rng.randint(800, 1200)
        elif size_category < 0.70:  # 60% medium
            return rng.randint(1200, 3000)
        else:  # 30% large
            return rng.randint(3000, 5000)

    def calculate_rent(self, sqft: int, base_rate_psf: float = 35.0) -> Decimal:
        """Calculate annual rent based on square footage.

        Args:
            sqft: Square footage
            base_rate_psf: Base rate per square foot annually

        Returns:
            Annual rent amount
        """
        # Add some variance (±15%)
        variance_factor = rng.uniform(0.85, 1.15)
        annual_rent = Decimal(str(sqft * base_rate_psf * variance_factor))

        # Round to nearest 100
        return (annual_rent / 100).quantize(Decimal("1")) * 100

    def generate_lease_dates(self, status: str) -> tuple[date | None, date | None]:
        """Generate lease start and end dates based on status.

        Args:
            status: Lease status (active, expired, pending, vacant)

        Returns:
            Tuple of (start_date, end_date)
        """
        if status == "vacant":
            return (None, None)

        today = date.today()

        if status == "active":
            # Started 1-3 years ago, ends 1-5 years in future
            start_offset = rng.randint(365, 1095)  # 1-3 years
            end_offset = rng.randint(365, 1825)  # 1-5 years
            start_date = today - timedelta(days=start_offset)
            end_date = today + timedelta(days=end_offset)
            return (start_date, end_date)

        elif status == "expired":
            # Started 2-5 years ago, ended 1-6 months ago
            start_offset = rng.randint(730, 1825)  # 2-5 years
            end_offset = rng.randint(30, 180)  # 1-6 months
            start_date = today - timedelta(days=start_offset)
            end_date = today - timedelta(days=end_offset)
            return (start_date, end_date)

        else:  # pending
            # Starts 1-3 months in future, ends 3-5 years after start
            start_offset = rng.randint(30, 90)  # 1-3 months
            start_date = today + timedelta(days=start_offset)
            end_date = start_date + timedelta(days=rng.randint(1095, 1825))
            return (start_date, end_date)

    def generate_units(self) -> list[dict[str, Any]]:
        """Generate unit data.

        Returns:
            List of unit dictionaries
        """
        units = []
        tenant_idx = 0

        for floor in range(1, self.num_floors + 1):
            for position in range(1, self.units_per_floor + 1):
                unit_number = self.generate_unit_number(floor, position)
                sqft = self.generate_square_footage()

                # Determine occupancy status based on target rate
                is_occupied = rng.random() < self.occupancy_rate

                if is_occupied:
                    # Select lease status (weighted probabilities)
                    rand_val = rng.random()
                    cumulative = 0.0
                    status = "active"

                    for s, prob in self.LEASE_STATUSES.items():
                        if s == "vacant":
                            continue
                        cumulative += prob / (1 - self.LEASE_STATUSES["vacant"])
                        if rand_val < cumulative:
                            status = s
                            break

                    tenant_name = self.TENANT_NAMES[tenant_idx % len(self.TENANT_NAMES)]
                    tenant_idx += 1

                    annual_rent = self.calculate_rent(sqft)
                    start_date, end_date = self.generate_lease_dates(status)

                else:
                    status = "vacant"
                    tenant_name = ""
                    annual_rent = Decimal("0")
                    start_date = None
                    end_date = None

                unit = {
                    "unit_number": unit_number,
                    "floor": floor,
                    "sqft": sqft,
                    "status": status,
                    "tenant_name": tenant_name,
                    "annual_rent": annual_rent,
                    "monthly_rent": (
                        annual_rent / 12 if annual_rent > 0 else Decimal("0")
                    ),
                    "start_date": start_date,
                    "end_date": end_date,
                    "psf_rate": (
                        (annual_rent / sqft) if annual_rent > 0 else Decimal("0")
                    ),
                }

                units.append(unit)

        return units

    def generate_csv(self, output_path: Path, units: list[dict[str, Any]]) -> None:
        """Generate MRI-formatted CSV file.

        Args:
            output_path: Path to write CSV file
            units: List of unit dictionaries
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            # Write MRI-specific header
            f.write("MRI Software - Commercial Management\n")
            f.write("Rent Roll Report\n")
            f.write(f"Property: {self.property_name} ({self.property_code})\n")
            f.write(f"Period: {self.period_date.strftime('%m/%Y')}\n")
            f.write(f"Run Date: {datetime.now().strftime('%m/%d/%Y %I:%M %p')}\n")
            f.write("\n")

            # Column headers
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "PERIOD",
                    "REF NUM",
                    "SOURCE",
                    "UNIT",
                    "TENANT",
                    "SQFT",
                    "STATUS",
                    "LEASE START",
                    "LEASE END",
                    "MONTHLY RENT",
                    "DEBIT",
                    "CREDIT",
                    "ACCOUNT",
                ],
            )
            writer.writeheader()

            # Write unit rows
            for idx, unit in enumerate(units, start=1001):
                row = {
                    "PERIOD": self.period_date.strftime("%Y-%m"),
                    "REF NUM": f"RR-{idx}",
                    "SOURCE": "RENT_ROLL",
                    "UNIT": unit["unit_number"],
                    "TENANT": unit["tenant_name"],
                    "SQFT": unit["sqft"],
                    "STATUS": unit["status"].upper(),
                    "LEASE START": (
                        unit["start_date"].strftime("%m/%d/%Y")
                        if unit["start_date"]
                        else ""
                    ),
                    "LEASE END": (
                        unit["end_date"].strftime("%m/%d/%Y")
                        if unit["end_date"]
                        else ""
                    ),
                    "MONTHLY RENT": (
                        f"{unit['monthly_rent']:.2f}"
                        if unit["monthly_rent"] > 0
                        else ""
                    ),
                    "DEBIT": (
                        f"{unit['monthly_rent']:.2f}"
                        if unit["monthly_rent"] > 0
                        else ""
                    ),
                    "CREDIT": "",
                    "ACCOUNT": "4100",  # Rental Income account
                }
                writer.writerow(row)

    def generate_expected_values(
        self, output_path: Path, units: list[dict[str, Any]]
    ) -> None:
        """Generate expected values JSON for test assertions.

        Args:
            output_path: Path to write JSON file
            units: List of unit dictionaries
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        occupied_units = [u for u in units if u["status"] != "vacant"]
        vacant_units = [u for u in units if u["status"] == "vacant"]
        active_units = [u for u in units if u["status"] == "active"]
        expired_units = [u for u in units if u["status"] == "expired"]
        pending_units = [u for u in units if u["status"] == "pending"]

        total_annual_rent = sum(u["annual_rent"] for u in units)
        total_monthly_rent = total_annual_rent / 12

        avg_sqft = sum(u["sqft"] for u in units) / len(units)
        avg_psf = (
            sum(u["psf_rate"] for u in occupied_units) / len(occupied_units)
            if occupied_units
            else 0
        )

        expected = {
            "row_count": len(units),
            "total_units": len(units),
            "occupied_units": len(occupied_units),
            "vacant_units": len(vacant_units),
            "occupancy_rate": round(len(occupied_units) / len(units), 3),
            "active_leases": len(active_units),
            "expired_leases": len(expired_units),
            "pending_leases": len(pending_units),
            "total_annual_rent": float(total_annual_rent),
            "total_monthly_rent": float(total_monthly_rent),
            "average_sqft": round(avg_sqft, 1),
            "average_psf": round(float(avg_psf), 2),
            "min_sqft": min(u["sqft"] for u in units),
            "max_sqft": max(u["sqft"] for u in units),
            "period": self.period_date.strftime("%Y-%m"),
            "property_code": self.property_code,
            "statuses": ["ACTIVE", "EXPIRED", "PENDING", "VACANT"],
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(expected, f, indent=2)


def main():
    """Generate all MRI fixtures."""
    fixtures_dir = Path(__file__).parent.parent / "mri"
    expected_dir = Path(__file__).parent.parent / "expected"

    # Standard fixture (50+ units)
    print("Generating standard MRI rent roll fixture...")
    generator = MRIRentRollGenerator(
        property_name="Metroplex Office Tower",
        property_code="METRO-001",
        num_floors=10,
        units_per_floor=6,
        occupancy_rate=0.85,
        period_date=date(2025, 1, 1),
    )

    units = generator.generate_units()
    generator.generate_csv(fixtures_dir / "rent_roll_standard.csv", units)
    generator.generate_expected_values(
        expected_dir / "mri_rent_roll_standard.json", units
    )

    print(f"[OK] Generated {len(units)} units in rent_roll_standard.csv")
    print(f"  - Occupied: {len([u for u in units if u['status'] != 'vacant'])}")
    print(f"  - Vacant: {len([u for u in units if u['status'] == 'vacant'])}")

    # Large property variant (200+ units for performance testing)
    print("\nGenerating large property variant...")
    large_generator = MRIRentRollGenerator(
        property_name="Downtown Corporate Campus",
        property_code="DCC-001",
        num_floors=20,
        units_per_floor=12,
        occupancy_rate=0.90,
        period_date=date(2025, 1, 1),
    )

    large_units = large_generator.generate_units()
    large_generator.generate_csv(fixtures_dir / "rent_roll_large.csv", large_units)
    large_generator.generate_expected_values(
        expected_dir / "mri_rent_roll_large.json", large_units
    )

    print(f"[OK] Generated {len(large_units)} units in rent_roll_large.csv")
    print(f"  - Occupied: {len([u for u in large_units if u['status'] != 'vacant'])}")
    print(f"  - Vacant: {len([u for u in large_units if u['status'] == 'vacant'])}")

    print("\n[SUCCESS] All MRI fixtures generated successfully!")


if __name__ == "__main__":
    main()
