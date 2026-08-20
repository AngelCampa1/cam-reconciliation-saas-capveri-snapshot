"""Lease PDF Document Generator.

Generates realistic commercial lease PDF documents for testing OCR and extraction.
Uses ReportLab to create professional-looking lease documents with all
Financial DNA fields.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class LeaseDocumentGenerator:
    """Generator for realistic commercial lease PDF documents."""

    def __init__(self, output_dir: Path):
        """Initialize the generator.

        Args:
            output_dir: Directory to save generated PDFs
        """
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Set up styles
        self.styles = getSampleStyleSheet()
        self._create_custom_styles()

    def _create_custom_styles(self) -> None:
        """Create custom paragraph styles for lease documents."""
        # Title style
        self.styles.add(
            ParagraphStyle(
                name="LeaseTitle",
                parent=self.styles["Title"],
                fontSize=18,
                textColor=colors.HexColor("#1a1a1a"),
                spaceAfter=30,
                alignment=1,  # Center
            )
        )

        # Article heading style
        self.styles.add(
            ParagraphStyle(
                name="ArticleHeading",
                parent=self.styles["Heading1"],
                fontSize=14,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=12,
                spaceBefore=20,
                bold=True,
            )
        )

        # Section heading style
        self.styles.add(
            ParagraphStyle(
                name="SectionHeading",
                parent=self.styles["Heading2"],
                fontSize=12,
                textColor=colors.HexColor("#34495e"),
                spaceAfter=8,
                spaceBefore=12,
                bold=True,
            )
        )

        # Body text style
        self.styles.add(
            ParagraphStyle(
                name="LeaseBody",
                parent=self.styles["BodyText"],
                fontSize=11,
                leading=14,
                spaceAfter=10,
                alignment=4,  # Justify
            )
        )

        # Emphasis style for key terms
        self.styles.add(
            ParagraphStyle(
                name="KeyTerm",
                parent=self.styles["LeaseBody"],
                textColor=colors.HexColor("#c0392b"),
                bold=True,
            )
        )

    def generate_standard_lease(
        self,
        filename: str = "sample_commercial_lease.pdf",
        property_name: str = "Metroplex Office Tower",
        tenant_name: str = "Acme Corporation",
        suite_number: str = "Suite 401",
        rentable_sqft: int = 2500,
        usable_sqft: int = 2250,
        base_year: int = 2024,
        monthly_base_rent: Decimal = Decimal("6250.00"),
        pro_rata_share: Decimal = Decimal("0.0312"),
        cap_type: str = "cumulative",
        cap_rate: Decimal = Decimal("0.05"),
        gross_up_target: Decimal = Decimal("0.95"),
        admin_fee_percent: Decimal = Decimal("0.15"),
    ) -> Path:
        """Generate a standard commercial lease PDF.

        Args:
            filename: Output filename
            property_name: Name of the property
            tenant_name: Name of the tenant
            suite_number: Suite/unit identifier
            rentable_sqft: Rentable square feet (BOMA)
            usable_sqft: Usable square feet
            base_year: Base year for expense stops
            monthly_base_rent: Monthly base rent amount
            pro_rata_share: Tenant's proportionate share (0.0312 = 3.12%)
            cap_type: Type of expense cap
                (cumulative, non_cumulative, cumulative_compounding, none)
            cap_rate: Annual cap rate (0.05 = 5%)
            gross_up_target: Target occupancy for gross-up (0.95 = 95%)
            admin_fee_percent: Administrative fee percentage (0.15 = 15%)

        Returns:
            Path to generated PDF file
        """
        output_path = self.output_dir / filename

        # Create document
        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=letter,
            rightMargin=1 * inch,
            leftMargin=1 * inch,
            topMargin=1 * inch,
            bottomMargin=1 * inch,
        )

        # Build content
        story = []

        # Calculate lease dates
        commencement_date = date(2025, 1, 1)
        expiration_date = commencement_date + timedelta(days=5 * 365)  # 5-year lease
        load_factor = rentable_sqft / usable_sqft

        # Title
        story.append(Paragraph("COMMERCIAL LEASE AGREEMENT", self.styles["LeaseTitle"]))
        story.append(Spacer(1, 0.2 * inch))

        # Parties
        story.append(Paragraph("ARTICLE 1: PARTIES", self.styles["ArticleHeading"]))
        parties_text = f"""
        This Lease Agreement ("Lease") is entered into as of
        January 1, 2025, by and between <b>METROPLEX PROPERTIES LLC</b>,
        a Delaware limited liability company ("Landlord"),
        and <b>{tenant_name.upper()}</b>, a Delaware corporation ("Tenant").
        """
        story.append(Paragraph(parties_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.15 * inch))

        # Premises
        story.append(Paragraph("ARTICLE 2: PREMISES", self.styles["ArticleHeading"]))
        premises_text = f"""
        Landlord hereby leases to Tenant and Tenant hereby leases from Landlord those certain
        premises located at <b>{property_name}</b>, consisting of approximately
        <b>{usable_sqft:,} square feet</b> of Usable Area and <b>{rentable_sqft:,} square feet</b>
        of Rentable Area, commonly known as <b>{suite_number}</b> (the "Premises").
        The Rentable Area has been calculated in accordance with ANSI/BOMA Z65.1-2024 standards
        and includes a load factor of <b>{load_factor:.4f}</b>.
        """
        story.append(Paragraph(premises_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.15 * inch))

        # Term
        story.append(Paragraph("ARTICLE 3: TERM", self.styles["ArticleHeading"]))
        term_text = f"""
        The term of this Lease shall be for a period of five (5) years, commencing on
        <b>{commencement_date.strftime('%B %d, %Y')}</b> (the "Commencement Date") and
        expiring on <b>{expiration_date.strftime('%B %d, %Y')}</b> (the "Expiration Date"),
        unless sooner terminated as provided herein.
        """
        story.append(Paragraph(term_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.15 * inch))

        # Base Rent
        story.append(Paragraph("ARTICLE 4: BASE RENT", self.styles["ArticleHeading"]))
        annual_base_rent = monthly_base_rent * 12
        psf_annual = annual_base_rent / rentable_sqft
        base_rent_text = f"""
        Tenant shall pay to Landlord annual base rent of <b>${annual_base_rent:,.2f}</b>
        (${monthly_base_rent:,.2f} per month), which equals <b>${psf_annual:.2f} per square foot</b>
        of Rentable Area per annum. Base Rent shall be payable in advance on the first day of
        each calendar month during the Lease Term.
        """
        story.append(Paragraph(base_rent_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.2 * inch))

        # Operating Expenses - KEY SECTION
        story.append(
            Paragraph(
                "ARTICLE 5: OPERATING EXPENSES AND ADDITIONAL RENT",
                self.styles["ArticleHeading"],
            )
        )
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.1: Definitions
        story.append(Paragraph("5.1 Definitions", self.styles["SectionHeading"]))
        definitions_text = """
        <b>"Operating Expenses"</b> means all expenses incurred by Landlord in connection with
        the operation, management, maintenance, and repair of the Building and Common Areas,
        including but not limited to: real estate taxes and assessments; insurance premiums;
        utilities for Common Areas; janitorial and cleaning services; landscaping and snow removal;
        security; management fees; and repairs and maintenance.
        """
        story.append(Paragraph(definitions_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.2: Base Year
        story.append(Paragraph("5.2 Base Year", self.styles["SectionHeading"]))
        base_year_text = f"""
        Tenant's Base Year for Operating Expenses shall be calendar year <b>{base_year}</b>
        (the "Base Year"). Tenant shall not be responsible for Tenant's Pro Rata Share of
        Operating Expenses to the extent such expenses do not exceed the Operating Expenses
        for the Base Year.
        """
        story.append(Paragraph(base_year_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.3: Pro Rata Share
        story.append(Paragraph("5.3 Pro Rata Share", self.styles["SectionHeading"]))
        pro_rata_percent = pro_rata_share * 100
        pro_rata_text = f"""
        Tenant's proportionate share ("Pro Rata Share") of Operating Expenses shall be
        <b>{pro_rata_percent:.4f}%</b>, which represents the ratio of the Rentable Area of
        the Premises ({rentable_sqft:,} square feet) to the total Rentable Area of the
        Building (80,000 square feet).
        """
        story.append(Paragraph(pro_rata_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.4: Expense Caps
        story.append(Paragraph("5.4 Expense Caps", self.styles["SectionHeading"]))
        cap_rate_percent = cap_rate * 100
        if cap_type == "cumulative":
            cap_text = f"""
            Operating Expenses shall be subject to a <b>Cumulative Cap</b> of <b>{cap_rate_percent:.1f}%</b>
            per annum over the Base Year amount. The cap shall be calculated cumulatively such that
            the maximum Operating Expenses for any year shall equal the Base Year amount multiplied
            by (1 + {cap_rate_percent:.1f}% × number of years since Base Year). Any unused capacity
            in one year may be carried forward to subsequent years.
            """
        elif cap_type == "non_cumulative":
            cap_text = f"""
            Operating Expenses shall be subject to a <b>Non-Cumulative Cap</b> of <b>{cap_rate_percent:.1f}%</b>
            per annum. The maximum increase in Operating Expenses from one year to the next shall not
            exceed {cap_rate_percent:.1f}% of the prior year's actual Operating Expenses. Any unused
            capacity in one year shall not carry forward to subsequent years.
            """
        elif cap_type == "cumulative_compounding":
            cap_text = f"""
            Operating Expenses shall be subject to a <b>Cumulative Compounding Cap</b> of
            <b>{cap_rate_percent:.1f}%</b> per annum over the Base Year amount. The cap shall be
            calculated with annual compounding such that the maximum Operating Expenses for any year
            shall equal the Base Year amount multiplied by (1 + {cap_rate_percent:.1f}%) raised to the
            number of years since the Base Year. Unused compounded capacity may be carried forward to
            subsequent years.
            """
        else:
            cap_text = """
            There shall be <b>no cap</b> on Operating Expenses. Tenant shall pay Tenant's Pro Rata
            Share of all increases in Operating Expenses over the Base Year amount without limitation.
            """
        story.append(Paragraph(cap_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.5: Gross-Up Provision
        story.append(Paragraph("5.5 Gross-Up Provision", self.styles["SectionHeading"]))
        gross_up_percent = gross_up_target * 100
        grossup_text = f"""
        Variable Operating Expenses (including but not limited to janitorial services, utilities
        for Common Areas, and management fees) shall be "grossed up" to <b>{gross_up_percent:.0f}%</b>
        occupancy for purposes of calculating Tenant's share of Operating Expenses. This gross-up
        shall apply when the average physical occupancy of the Building is less than {gross_up_percent:.0f}%
        during any calendar year.
        """
        story.append(Paragraph(grossup_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.1 * inch))

        # Section 5.6: Administrative Fee
        story.append(Paragraph("5.6 Administrative Fee", self.styles["SectionHeading"]))
        admin_fee_percent_display = admin_fee_percent * 100
        admin_fee_text = f"""
        Landlord shall be entitled to include in Operating Expenses an administrative fee equal to
        <b>{admin_fee_percent_display:.0f}%</b> of all Operating Expenses to compensate Landlord
        for the cost of administering and billing Operating Expense reconciliations.
        """
        story.append(Paragraph(admin_fee_text, self.styles["LeaseBody"]))
        story.append(Spacer(1, 0.2 * inch))

        # Lease Summary Table
        story.append(
            Paragraph("SCHEDULE A: LEASE SUMMARY", self.styles["ArticleHeading"])
        )
        story.append(Spacer(1, 0.1 * inch))

        summary_data = [
            ["Item", "Details"],
            ["Property", property_name],
            ["Premises", suite_number],
            ["Tenant", tenant_name],
            ["Usable Area", f"{usable_sqft:,} sq ft"],
            ["Rentable Area", f"{rentable_sqft:,} sq ft"],
            ["Load Factor", f"{load_factor:.4f}"],
            ["Commencement Date", commencement_date.strftime("%B %d, %Y")],
            ["Expiration Date", expiration_date.strftime("%B %d, %Y")],
            ["Base Rent (Annual)", f"${annual_base_rent:,.2f}"],
            ["Base Rent (Monthly)", f"${monthly_base_rent:,.2f}"],
            ["Base Rent (Per SF)", f"${psf_annual:.2f}/SF/year"],
            ["Base Year", str(base_year)],
            ["Pro Rata Share", f"{pro_rata_percent:.4f}%"],
            ["Expense Cap Type", cap_type.replace("_", " ").title()],
            ["Expense Cap Rate", f"{cap_rate_percent:.1f}% per annum"],
            ["Gross-Up Target", f"{gross_up_percent:.0f}% occupancy"],
            ["Administrative Fee", f"{admin_fee_percent_display:.0f}%"],
        ]

        summary_table = Table(summary_data, colWidths=[2.5 * inch, 4 * inch])
        summary_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495e")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.grey),
                    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 1), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 10),
                    ("TOPPADDING", (0, 1), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                ]
            )
        )
        story.append(summary_table)

        # Build PDF
        doc.build(story)

        print(f"[OK] Generated {filename}")
        return output_path

    def generate_expected_extraction_values(
        self,
        output_filename: str = "sample_commercial_lease_expected.json",
        base_year: int = 2024,
        pro_rata_share: Decimal = Decimal("0.0312"),
        cap_type: str = "cumulative",
        cap_rate: Decimal = Decimal("0.05"),
        gross_up_target: Decimal = Decimal("0.95"),
        admin_fee_percent: Decimal = Decimal("0.15"),
        rentable_sqft: int = 2500,
        monthly_base_rent: Decimal = Decimal("6250.00"),
    ) -> Path:
        """Generate expected extraction values JSON for test assertions.

        Args:
            output_filename: Output filename for JSON
            base_year: Base year value
            pro_rata_share: Pro rata share decimal
            cap_type: Expense cap type
            cap_rate: Annual cap rate
            gross_up_target: Target occupancy for gross-up
            admin_fee_percent: Administrative fee percentage
            rentable_sqft: Rentable square feet
            monthly_base_rent: Monthly base rent

        Returns:
            Path to generated JSON file
        """
        output_path = self.output_dir.parent / "expected" / output_filename
        output_path.parent.mkdir(parents=True, exist_ok=True)

        expected_data = {
            "lease_terms": {
                "base_year": base_year,
                "pro_rata_share": float(pro_rata_share),
                "cap_type": cap_type,
                "cap_rate": float(cap_rate),
                "gross_up_target": float(gross_up_target),
                "admin_fee_percent": float(admin_fee_percent),
            },
            "premises": {
                "rentable_sqft": rentable_sqft,
                "usable_sqft": 2250,
                "load_factor": 1.1111,
            },
            "rent": {
                "monthly_base_rent": float(monthly_base_rent),
                "annual_base_rent": float(monthly_base_rent * 12),
                "psf_annual": float((monthly_base_rent * 12) / rentable_sqft),
            },
            "dates": {
                "commencement_date": "2025-01-01",
                "expiration_date": "2029-12-31",
            },
            "extraction_confidence": {
                "base_year": "high",
                "pro_rata_share": "high",
                "cap_type": "high",
                "cap_rate": "high",
                "gross_up_target": "high",
                "admin_fee_percent": "high",
            },
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(expected_data, f, indent=2)

        print(f"[OK] Generated {output_filename}")
        return output_path


def main():
    """Generate all lease PDF fixtures."""
    fixtures_dir = Path(__file__).parent.parent / "leases"
    generator = LeaseDocumentGenerator(fixtures_dir)

    # Standard lease with all Financial DNA fields
    print("Generating standard commercial lease PDF...")
    generator.generate_standard_lease(
        filename="sample_commercial_lease.pdf",
        property_name="Metroplex Office Tower",
        tenant_name="Acme Corporation",
        suite_number="Suite 401",
        rentable_sqft=2500,
        usable_sqft=2250,
        base_year=2024,
        monthly_base_rent=Decimal("6250.00"),
        pro_rata_share=Decimal("0.0312"),
        cap_type="cumulative",
        cap_rate=Decimal("0.05"),
        gross_up_target=Decimal("0.95"),
        admin_fee_percent=Decimal("0.15"),
    )

    # Generate expected extraction values
    print("\nGenerating expected extraction values...")
    generator.generate_expected_extraction_values(
        output_filename="sample_commercial_lease_expected.json",
        base_year=2024,
        pro_rata_share=Decimal("0.0312"),
        cap_type="cumulative",
        cap_rate=Decimal("0.05"),
        gross_up_target=Decimal("0.95"),
        admin_fee_percent=Decimal("0.15"),
        rentable_sqft=2500,
        monthly_base_rent=Decimal("6250.00"),
    )

    print("\n[SUCCESS] All lease PDF fixtures generated successfully!")


if __name__ == "__main__":
    main()
