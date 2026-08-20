"""Multi-Property Fixture Set Generator.

Generates comprehensive fixture set spanning 3 properties with coordinated:
- GL exports (Yardi format)
- Rent rolls (MRI format)
- Tenant lease PDFs
- Expected reconciliation outputs
- Master manifest linking all files

All data coordinated with seeded random for reproducibility.
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from faker import Faker

# Import existing generators - handle both relative and absolute imports
try:
    from .calculation_expected_generator import CalculationExpectedGenerator
    from .lease_pdf_generator import LeaseDocumentGenerator
    from .yardi_generator import YardiGLFixtureGenerator
except ImportError:
    # Running as script, use absolute imports
    import sys

    sys.path.insert(0, str(Path(__file__).parent))
    from calculation_expected_generator import CalculationExpectedGenerator
    from lease_pdf_generator import LeaseDocumentGenerator
    from yardi_generator import YardiGLFixtureGenerator


class PropertyDefinition:
    """Defines a property for fixture generation."""

    def __init__(
        self,
        property_id: str,
        name: str,
        property_class: str,
        total_sqft: int,
        target_occupancy: Decimal,
        base_year: int,
        cap_type: str,
        cap_rate: Decimal,
        gross_up_target: Decimal,
        admin_fee_percent: Decimal,
    ):
        self.property_id = property_id
        self.name = name
        self.property_class = property_class
        self.total_sqft = total_sqft
        self.target_occupancy = target_occupancy
        self.base_year = base_year
        self.cap_type = cap_type
        self.cap_rate = cap_rate
        self.gross_up_target = gross_up_target
        self.admin_fee_percent = admin_fee_percent


class TenantDefinition:
    """Defines a tenant for fixture generation."""

    def __init__(
        self,
        tenant_id: str,
        company_name: str,
        suite: str,
        rentable_sqft: int,
        usable_sqft: int,
        monthly_rent: Decimal,
        lease_start: date,
        lease_end: date,
    ):
        self.tenant_id = tenant_id
        self.company_name = company_name
        self.suite = suite
        self.rentable_sqft = rentable_sqft
        self.usable_sqft = usable_sqft
        self.monthly_rent = monthly_rent
        self.lease_start = lease_start
        self.lease_end = lease_end


class MultiPropertyFixtureSet:
    """Generates comprehensive multi-property fixture set."""

    def __init__(self, output_dir: Path | None = None, seed: int = 42):
        """Initialize generator with output directory and random seed."""
        if output_dir is None:
            output_dir = Path(__file__).parent.parent
        self.output_dir = Path(output_dir)
        self.seed = seed
        random.seed(seed)
        self.faker = Faker()
        self.faker.seed_instance(seed)

        # Create subdirectories
        self.yardi_dir = self.output_dir / "yardi"
        self.mri_dir = self.output_dir / "mri"
        self.leases_dir = self.output_dir / "leases"
        self.expected_dir = self.output_dir / "expected"

        for dir_path in [
            self.yardi_dir,
            self.mri_dir,
            self.leases_dir,
            self.expected_dir,
        ]:
            dir_path.mkdir(parents=True, exist_ok=True)

        # Initialize sub-generators (only those that take output_dir)
        self.lease_gen = LeaseDocumentGenerator(output_dir=self.leases_dir)
        self.calc_gen = CalculationExpectedGenerator(output_dir=self.expected_dir)

        # Define properties
        self.properties = self._define_properties()
        self.tenants_by_property = {}
        self.manifest = {
            "generated_date": datetime.now().isoformat(),
            "seed": seed,
            "properties": [],
            "total_tenants": 0,
            "total_sqft": 0,
        }

    def _define_properties(self) -> list[PropertyDefinition]:
        """Define the three properties with different characteristics."""
        return [
            PropertyDefinition(
                property_id="PROP001",
                name="Parkview Office Tower",
                property_class="Class A Office",
                total_sqft=100000,
                target_occupancy=Decimal("0.95"),
                base_year=2024,
                cap_type="cumulative",
                cap_rate=Decimal("0.05"),
                gross_up_target=Decimal("0.95"),
                admin_fee_percent=Decimal("0.15"),
            ),
            PropertyDefinition(
                property_id="PROP002",
                name="Metro Business Center",
                property_class="Class B Office",
                total_sqft=75000,
                target_occupancy=Decimal("0.92"),
                base_year=2024,
                cap_type="non_cumulative",
                cap_rate=Decimal("0.04"),
                gross_up_target=Decimal("0.92"),
                admin_fee_percent=Decimal("0.12"),
            ),
            PropertyDefinition(
                property_id="PROP003",
                name="Harbor Industrial Park",
                property_class="Industrial",
                total_sqft=200000,
                target_occupancy=Decimal("0.90"),
                base_year=2024,
                cap_type="cumulative_compounding",
                cap_rate=Decimal("0.03"),
                gross_up_target=Decimal("0.90"),
                admin_fee_percent=Decimal("0.10"),
            ),
        ]

    def _generate_tenants_for_property(
        self, prop: PropertyDefinition, num_tenants: int
    ) -> list[TenantDefinition]:
        """Generate tenant definitions for a property."""
        tenants = []
        total_allocated = 0

        for i in range(num_tenants):
            # Distribute square footage
            if i == num_tenants - 1:
                # Last tenant gets remaining space (accounting for vacancy)
                target_occupied = int(prop.total_sqft * float(prop.target_occupancy))
                rentable_sqft = target_occupied - total_allocated
            else:
                # Random allocation between 1000-8000 sqft
                rentable_sqft = random.randint(1000, 8000)

            total_allocated += rentable_sqft

            # Calculate usable sqft (load factor 1.12)
            usable_sqft = int(rentable_sqft / 1.12)

            # Calculate rent ($25-45 PSF annually, varies by class)
            if prop.property_class == "Class A Office":
                psf_annual = Decimal(str(random.uniform(38, 45)))
            elif prop.property_class == "Class B Office":
                psf_annual = Decimal(str(random.uniform(28, 35)))
            else:  # Industrial
                psf_annual = Decimal(str(random.uniform(20, 28)))

            annual_rent = Decimal(rentable_sqft) * psf_annual
            monthly_rent = annual_rent / 12

            # Generate lease dates (5-year leases)
            lease_start = date(2025, 1, 1)
            lease_end = date(2029, 12, 31)

            tenant = TenantDefinition(
                tenant_id=f"{prop.property_id}-T{i+1:02d}",
                company_name=self.faker.company(),
                suite=f"{(i+1)*100}",
                rentable_sqft=rentable_sqft,
                usable_sqft=usable_sqft,
                monthly_rent=monthly_rent.quantize(Decimal("0.01")),
                lease_start=lease_start,
                lease_end=lease_end,
            )
            tenants.append(tenant)

        return tenants

    def _generate_gl_export(self, prop: PropertyDefinition, year: int = 2025) -> Path:
        """Generate GL export for a property."""
        # Generate GL export using Yardi generator
        filename = f"gl_export_{prop.property_id.lower()}_{year}.csv"
        filepath = self.yardi_dir / filename

        # Create Yardi generator with property-specific parameters
        yardi_gen = YardiGLFixtureGenerator(
            property_name=prop.name,
            property_code=prop.property_id,
            start_date=date(year, 1, 1),
            end_date=date(year, 12, 31),
        )

        yardi_gen.generate_standard_fixture(
            output_path=filepath,
            num_rows=500,
        )

        return filepath

    def _generate_rent_roll(
        self, prop: PropertyDefinition, tenants: list[TenantDefinition]
    ) -> Path:
        """Generate rent roll for a property and its tenants."""
        filename = f"rent_roll_{prop.property_id.lower()}.csv"

        # Create rent roll data manually to match our tenants
        import csv

        filepath = self.mri_dir / filename

        with open(filepath, "w", newline="") as f:
            writer = csv.writer(f)

            # MRI header
            writer.writerow(["MRI Software LLC - Commercial Management"])
            writer.writerow([f"Property: {prop.name}"])
            writer.writerow([f"Report Date: {datetime.now().strftime('%m/%d/%Y')}"])
            writer.writerow([])
            writer.writerow(
                [
                    "PERIOD",
                    "REF NUM",
                    "SOURCE",
                    "UNIT",
                    "TENANT",
                    "SQFT",
                    "STATUS",
                    "DEBIT",
                    "CREDIT",
                ]
            )

            # Write tenant rows
            for tenant in tenants:
                period = "01/2025"
                ref_num = tenant.tenant_id
                source = "RR"
                unit = tenant.suite
                tenant_name = tenant.company_name
                sqft = tenant.rentable_sqft
                status = "Active"
                debit = f"{tenant.monthly_rent:.2f}"
                credit = "0.00"

                writer.writerow(
                    [
                        period,
                        ref_num,
                        source,
                        unit,
                        tenant_name,
                        sqft,
                        status,
                        debit,
                        credit,
                    ]
                )

        return filepath

    def _generate_lease_pdf(
        self, prop: PropertyDefinition, tenant: TenantDefinition
    ) -> Path:
        """Generate lease PDF for a tenant."""
        filename = f"lease_{tenant.tenant_id.lower()}.pdf"

        # Calculate pro-rata share
        pro_rata_share = Decimal(tenant.rentable_sqft) / Decimal(prop.total_sqft)

        # Annual rent
        _annual_rent = tenant.monthly_rent * 12

        # Generate lease PDF
        filepath = self.lease_gen.generate_standard_lease(
            filename=filename,
            property_name=prop.name,
            tenant_name=tenant.company_name,
            suite_number=tenant.suite,
            rentable_sqft=tenant.rentable_sqft,
            usable_sqft=tenant.usable_sqft,
            base_year=prop.base_year,
            monthly_base_rent=tenant.monthly_rent,
            pro_rata_share=pro_rata_share,
            cap_type=prop.cap_type,
            cap_rate=prop.cap_rate,
            gross_up_target=prop.gross_up_target,
            admin_fee_percent=prop.admin_fee_percent,
        )

        # Also generate expected extraction values
        expected_filename = f"lease_{tenant.tenant_id.lower()}_expected.json"
        self.lease_gen.generate_expected_extraction_values(
            output_filename=expected_filename,
            base_year=prop.base_year,
            pro_rata_share=pro_rata_share,
            cap_type=prop.cap_type,
            cap_rate=prop.cap_rate,
            gross_up_target=prop.gross_up_target,
            admin_fee_percent=prop.admin_fee_percent,
            rentable_sqft=tenant.rentable_sqft,
            monthly_base_rent=tenant.monthly_rent,
        )

        return filepath

    def _calculate_expected_reconciliation(
        self, prop: PropertyDefinition, tenant: TenantDefinition
    ) -> dict[str, Any]:
        """Calculate expected reconciliation output for a tenant."""
        # Simplified expected reconciliation calculation
        # In real scenario, this would use the CalculationExpectedGenerator

        pro_rata_share = Decimal(tenant.rentable_sqft) / Decimal(prop.total_sqft)

        # Hypothetical building expenses for 2025
        building_expenses = Decimal(prop.total_sqft) * Decimal("12.00")  # $12 PSF

        # Base year expenses (from 2024)
        base_year_expenses = Decimal(prop.total_sqft) * Decimal("10.00")  # $10 PSF

        # Increase over base
        expense_increase = building_expenses - base_year_expenses

        # Admin fee
        admin_fee = expense_increase * prop.admin_fee_percent

        # Total recoverable
        total_recoverable = expense_increase + admin_fee

        # Tenant share
        tenant_share = total_recoverable * pro_rata_share

        return {
            "tenant_id": tenant.tenant_id,
            "tenant_name": tenant.company_name,
            "property_id": prop.property_id,
            "property_name": prop.name,
            "reconciliation_year": 2025,
            "base_year": prop.base_year,
            "rentable_sqft": tenant.rentable_sqft,
            "pro_rata_share": float(pro_rata_share),
            "building_expenses": {
                "base_year_total": float(base_year_expenses),
                "current_year_total": float(building_expenses),
                "expense_increase": float(expense_increase),
            },
            "adjustments": {
                "gross_up_applied": False,
                "cap_applied": False,
                "admin_fee": float(admin_fee),
            },
            "tenant_billable": {
                "amount": float(tenant_share),
                "per_sqft": float(tenant_share / Decimal(tenant.rentable_sqft)),
            },
        }

    def generate_all(self) -> dict[str, Any]:
        """Generate complete multi-property fixture set."""
        print("Generating multi-property fixture set...")
        print(f"Seed: {self.seed}")
        print()

        total_tenants = 0
        total_sqft = 0

        for prop in self.properties:
            print(f"Processing {prop.name} ({prop.property_class})...")

            # Determine number of tenants based on building size
            if prop.total_sqft >= 150000:
                num_tenants = 5
            elif prop.total_sqft >= 80000:
                num_tenants = 4
            else:
                num_tenants = 3

            # Generate tenants
            tenants = self._generate_tenants_for_property(prop, num_tenants)
            self.tenants_by_property[prop.property_id] = tenants

            # Generate GL export
            gl_file = self._generate_gl_export(prop, year=2025)
            print(f"  Generated GL export: {gl_file.name}")

            # Generate rent roll
            rent_roll_file = self._generate_rent_roll(prop, tenants)
            print(f"  Generated rent roll: {rent_roll_file.name}")

            # Generate tenant fixtures
            tenant_fixtures = []
            for tenant in tenants:
                # Generate lease PDF
                lease_pdf = self._generate_lease_pdf(prop, tenant)

                # Calculate expected reconciliation
                expected_recon = self._calculate_expected_reconciliation(prop, tenant)

                tenant_fixture = {
                    "tenant_id": tenant.tenant_id,
                    "company_name": tenant.company_name,
                    "suite": tenant.suite,
                    "rentable_sqft": tenant.rentable_sqft,
                    "usable_sqft": tenant.usable_sqft,
                    "monthly_rent": float(tenant.monthly_rent),
                    "lease_pdf": str(lease_pdf.relative_to(self.output_dir)),
                    "expected_extraction": str(
                        (
                            self.expected_dir
                            / f"lease_{tenant.tenant_id.lower()}_expected.json"
                        ).relative_to(self.output_dir)
                    ),
                    "expected_reconciliation": expected_recon,
                }
                tenant_fixtures.append(tenant_fixture)

            print(f"  Generated {len(tenants)} tenant fixtures")

            # Add to manifest
            occupied_sqft = sum(t.rentable_sqft for t in tenants)
            occupancy_rate = occupied_sqft / prop.total_sqft

            property_manifest = {
                "property_id": prop.property_id,
                "name": prop.name,
                "class": prop.property_class,
                "total_sqft": prop.total_sqft,
                "occupied_sqft": occupied_sqft,
                "occupancy_rate": round(occupancy_rate, 4),
                "num_tenants": len(tenants),
                "financial_terms": {
                    "base_year": prop.base_year,
                    "cap_type": prop.cap_type,
                    "cap_rate": float(prop.cap_rate),
                    "gross_up_target": float(prop.gross_up_target),
                    "admin_fee_percent": float(prop.admin_fee_percent),
                },
                "files": {
                    "gl_export": str(gl_file.relative_to(self.output_dir)),
                    "rent_roll": str(rent_roll_file.relative_to(self.output_dir)),
                },
                "tenants": tenant_fixtures,
            }

            self.manifest["properties"].append(property_manifest)
            total_tenants += len(tenants)
            total_sqft += prop.total_sqft

            print()

        self.manifest["total_tenants"] = total_tenants
        self.manifest["total_sqft"] = total_sqft

        # Save manifest
        manifest_path = self.output_dir / "multi_property_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(self.manifest, f, indent=2)

        print(f"Generated manifest: {manifest_path.name}")
        print(
            f"\nTotal: {len(self.properties)} properties, {total_tenants} tenants, {total_sqft:,} sqft"
        )

        return self.manifest


if __name__ == "__main__":
    generator = MultiPropertyFixtureSet(seed=42)
    manifest = generator.generate_all()

    print("\nFixture set generation complete!")
    print(f"Manifest: {generator.output_dir / 'multi_property_manifest.json'}")
