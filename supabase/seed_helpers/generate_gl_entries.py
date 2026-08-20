"""Generate GL Entry CSV Fixtures for Manual Testing Seed Data.

This script generates 6 realistic Yardi GL export CSV files for comprehensive
manual testing, using the existing YardiGLFixtureGenerator.

Output Location: backend/tests/fixtures/seed_data/

Files Generated:
1. yardi_gl_downtown_tower_2022_2024.csv (300 entries)
2. yardi_gl_suburban_office_2022_2024.csv (300 entries)
3. yardi_gl_retail_plaza_2023_2024.csv (200 entries)
4. yardi_gl_medical_building_2023_2024.csv (200 entries - with outliers)
5. yardi_gl_class_a_tower_2019_2024.csv (450 entries - 6 years)
6. yardi_gl_industrial_complex_2023_2024.csv (100 entries)

Total: ~1,550 GL entries

Usage:
    cd supabase/seed_helpers
    python generate_gl_entries.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

# Add backend to path to import generators
backend_path = Path(__file__).parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from tests.fixtures.generators.yardi_generator import YardiGLFixtureGenerator


def generate_all_manual_testing_gl_fixtures() -> None:
    """Generate all 6 GL CSV fixtures for manual testing."""

    # Output directory
    output_dir = backend_path / "tests" / "fixtures" / "seed_data"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("GENERATING GL ENTRY FIXTURES FOR MANUAL TESTING SEED DATA")
    print("=" * 80)
    print()

    fixtures = [
        {
            "property_name": "Downtown Tower",
            "property_code": "DT-001",
            "start_date": date(2022, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 300,
            "filename": "yardi_gl_downtown_tower_2022_2024.csv",
            "description": "Acme Property Management - Downtown Tower (3 years)"
        },
        {
            "property_name": "Suburban Office Park",
            "property_code": "SOP-001",
            "start_date": date(2022, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 300,
            "filename": "yardi_gl_suburban_office_2022_2024.csv",
            "description": "Acme Property Management - Suburban Office Park (3 years)"
        },
        {
            "property_name": "Retail Plaza",
            "property_code": "RP-001",
            "start_date": date(2023, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 200,
            "filename": "yardi_gl_retail_plaza_2023_2024.csv",
            "description": "Beta Real Estate Holdings - Retail Plaza (2 years)"
        },
        {
            "property_name": "Medical Office Building",
            "property_code": "MOB-001",
            "start_date": date(2023, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 200,
            "filename": "yardi_gl_medical_building_2023_2024.csv",
            "description": "Gamma Commercial Group - Medical Building (2 years, with outliers)"
        },
        {
            "property_name": "Class A Office Tower",
            "property_code": "CAT-001",
            "start_date": date(2019, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 450,
            "filename": "yardi_gl_class_a_tower_2019_2024.csv",
            "description": "Delta Development Corp - Class A Tower (6 years for trend analysis)"
        },
        {
            "property_name": "Industrial Complex",
            "property_code": "IC-001",
            "start_date": date(2023, 1, 1),
            "end_date": date(2024, 12, 31),
            "num_rows": 100,
            "filename": "yardi_gl_industrial_complex_2023_2024.csv",
            "description": "Epsilon Ventures - Industrial Complex (2 years)"
        },
    ]

    total_rows = 0

    for idx, fixture_config in enumerate(fixtures, 1):
        print(f"[{idx}/6] Generating: {fixture_config['filename']}")
        print(f"     Property: {fixture_config['property_name']} ({fixture_config['property_code']})")
        print(f"     Period: {fixture_config['start_date']} to {fixture_config['end_date']}")
        print(f"     Target Rows: {fixture_config['num_rows']}")

        generator = YardiGLFixtureGenerator(
            property_name=fixture_config['property_name'],
            property_code=fixture_config['property_code'],
            start_date=fixture_config['start_date'],
            end_date=fixture_config['end_date']
        )

        output_path = output_dir / fixture_config['filename']
        expected_values = generator.generate_standard_fixture(
            output_path=output_path,
            num_rows=fixture_config['num_rows']
        )

        total_rows += expected_values['row_count']

        print(f"     [OK] Generated {expected_values['row_count']} rows")
        print(f"       Total Debits:  ${expected_values['total_debits']:>12,.2f}")
        print(f"       Total Credits: ${expected_values['total_credits']:>12,.2f}")
        print(f"       Net Amount:    ${expected_values['net_amount']:>12,.2f}")
        print(f"       Saved to: {output_path}")
        print()

    print("=" * 80)
    print("GENERATION COMPLETE")
    print("=" * 80)
    print(f"Total Files:  {len(fixtures)}")
    print(f"Total Rows:   {total_rows:,}")
    print(f"Output Dir:   {output_dir}")
    print()
    print("Next Steps:")
    print("1. Review the generated CSV files in backend/tests/fixtures/seed_data/")
    print("2. Run the seed_manual_testing.sql script to load this data into the database")
    print("3. CSV files include realistic edge cases:")
    print("   - Negative amounts (credits/refunds): ~5% of entries")
    print("   - Varied vendors by category")
    print("   - Monthly variance in amounts")
    print("   - Realistic account code structure (5100-5700 series)")
    print()


if __name__ == "__main__":
    generate_all_manual_testing_gl_fixtures()
