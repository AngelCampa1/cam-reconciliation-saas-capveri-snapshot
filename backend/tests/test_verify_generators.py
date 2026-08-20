"""Quick verification script for all Epic 8 generators."""

# Add generators to path
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "fixtures" / "generators"))

from calculation_expected_generator import CalculationExpectedGenerator
from lease_pdf_generator import LeaseDocumentGenerator
from mri_generator import MRIRentRollGenerator
from yardi_generator import YardiGLFixtureGenerator


def test_yardi_generator():
    """Test Yardi GL generator."""
    print("Testing Yardi GL generator...")
    yardi_gen = YardiGLFixtureGenerator(
        property_name="Test Property",
        property_code="TEST-001",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 12, 31),
    )
    test_path = Path(__file__).parent / "fixtures" / "yardi" / "_test_verify.csv"
    yardi_gen.generate_standard_fixture(output_path=test_path, num_rows=50)
    print(f"  OK - Generated file exists: {test_path.exists()}")
    test_path.unlink()  # Clean up


def test_mri_generator():
    """Test MRI Rent Roll generator."""
    print("Testing MRI Rent Roll generator...")
    mri_gen = MRIRentRollGenerator(num_floors=3, units_per_floor=2, occupancy_rate=0.85)
    units = mri_gen.generate_units()
    test_path = Path(__file__).parent / "fixtures" / "mri" / "_test_verify.csv"
    mri_gen.generate_csv(test_path, units)
    print(f"  OK - Generated {len(units)} units")
    print(f"    - Occupied: {len([u for u in units if u['status'] != 'vacant'])}")
    print(f"    - Vacant: {len([u for u in units if u['status'] == 'vacant'])}")
    test_path.unlink()  # Clean up


def test_lease_pdf_generator():
    """Test Lease PDF generator."""
    print("Testing Lease PDF generator...")
    lease_gen = LeaseDocumentGenerator(
        output_dir=Path(__file__).parent / "fixtures" / "leases"
    )
    result_path = lease_gen.generate_standard_lease(
        filename="_test_verify.pdf",
        property_name="Test Building",
        tenant_name="Test Tenant Inc",
        suite_number="Suite 100",
        rentable_sqft=2500,
        usable_sqft=2250,
        monthly_base_rent=Decimal("6250.00"),
        base_year=2024,
        pro_rata_share=Decimal("0.0312"),
        cap_rate=Decimal("0.05"),
        gross_up_target=Decimal("0.95"),
        admin_fee_percent=Decimal("0.15"),
    )
    print(f"  OK - Generated file exists: {result_path.exists()}")
    result_path.unlink()  # Clean up


def test_calculation_expected_generator():
    """Test Calculation Expected generator."""
    print("Testing Calculation Expected generator...")
    calc_gen = CalculationExpectedGenerator(
        output_dir=Path(__file__).parent / "fixtures" / "expected"
    )
    # Test a single generator method
    result = calc_gen.generate_grossup_basic()
    print(f"  OK - Generated file: {result.name}")
    print(f"  OK - File exists: {result.exists()}")


if __name__ == "__main__":
    print("=== Epic 8 Generator Verification ===\n")

    test_yardi_generator()
    test_mri_generator()
    test_lease_pdf_generator()
    test_calculation_expected_generator()

    print("\n=== All generators working! ===")
